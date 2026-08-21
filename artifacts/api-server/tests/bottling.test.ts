import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  cleanupFixtures,
  createFixtures,
  managerCookie,
  workerCookie,
  type TestFixtures,
} from "./helpers";
import app from "../src/app";
import { db } from "@workspace/db";
import {
  harvestSeasonsTable,
  harvestEventsTable,
  harvestBoxesTable,
  harvestBatchesTable,
  harvestBatchItemsTable,
  pressingRunsTable,
  oilBatchesTable,
  bottlingRunsTable,
  bottlingRunOilSourcesTable,
  bottleOriginsTable,
  treesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

describe("bottling runs + bottle ↔ tree traceability", () => {
  let fixtures: TestFixtures;
  let treeAId = 0;
  let treeBId = 0;
  let oilBatchId = 0;
  let seasonId = 0;
  let batchId = 0;
  const cleanupBottlingIds: number[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    treeAId = fixtures.treeId;

    // Create a second tree in the same grove
    const [treeB] = await db
      .insert(treesTable)
      .values({
        groveId: fixtures.groveId,
        treeCode: `T-bottling-${Date.now()}`,
        currentHealthIndex: 0.9,
      })
      .returning();
    treeBId = treeB.id;

    // Build a tiny harvest → press → oil batch chain (60kg from A, 40kg from B → 100kg → 20L oil)
    const [season] = await db.insert(harvestSeasonsTable).values({ year: 2026, name: "T-2026", startDate: "2026-10-01" }).returning();
    seasonId = season.id;

    const [eventA] = await db.insert(harvestEventsTable).values({
      harvestSeasonId: seasonId, groveId: fixtures.groveId, treeId: treeAId,
      harvestDate: "2026-10-15", status: "complete",
      startedByWorkerId: fixtures.workerUserId, totalMeasuredWeightKg: 60,
    }).returning();
    const [eventB] = await db.insert(harvestEventsTable).values({
      harvestSeasonId: seasonId, groveId: fixtures.groveId, treeId: treeBId,
      harvestDate: "2026-10-15", status: "complete",
      startedByWorkerId: fixtures.workerUserId, totalMeasuredWeightKg: 40,
    }).returning();

    const [boxA] = await db.insert(harvestBoxesTable).values({
      harvestEventId: eventA.id, boxCode: "BX-A1", boxSequenceNumber: 1, measuredWeightKg: 60,
    }).returning();
    const [boxB] = await db.insert(harvestBoxesTable).values({
      harvestEventId: eventB.id, boxCode: "BX-B1", boxSequenceNumber: 1, measuredWeightKg: 40,
    }).returning();

    const [batch] = await db.insert(harvestBatchesTable).values({
      harvestSeasonId: seasonId, batchCode: `B-trace-${Date.now()}`, batchDate: "2026-10-15", groveId: fixtures.groveId,
    }).returning();
    batchId = batch.id;
    await db.insert(harvestBatchItemsTable).values([
      { harvestBatchId: batchId, harvestEventId: eventA.id, harvestBoxId: boxA.id },
      { harvestBatchId: batchId, harvestEventId: eventB.id, harvestBoxId: boxB.id },
    ]);

    const [pressRun] = await db.insert(pressingRunsTable).values({
      harvestBatchId: batchId, millName: "Trace Mill", inputOliveKg: 100, outputOilLiters: 20,
    }).returning();

    const [oilB] = await db.insert(oilBatchesTable).values({
      pressingRunId: pressRun.id, oilBatchCode: `OB-trace-${Date.now()}`,
      volumeLiters: 20, volumeRemainingLiters: 20, status: "stored",
    }).returning();
    oilBatchId = oilB.id;
  });

  afterAll(async () => {
    if (cleanupBottlingIds.length > 0) {
      await db.delete(bottleOriginsTable).where(inArray(bottleOriginsTable.bottlingRunId, cleanupBottlingIds));
      await db.delete(bottlingRunOilSourcesTable).where(inArray(bottlingRunOilSourcesTable.bottlingRunId, cleanupBottlingIds));
      await db.delete(bottlingRunsTable).where(inArray(bottlingRunsTable.id, cleanupBottlingIds));
    }
    if (oilBatchId) await db.delete(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId));
    if (batchId) {
      await db.delete(harvestBatchItemsTable).where(eq(harvestBatchItemsTable.harvestBatchId, batchId));
      await db.delete(pressingRunsTable).where(eq(pressingRunsTable.harvestBatchId, batchId));
      await db.delete(harvestBatchesTable).where(eq(harvestBatchesTable.id, batchId));
    }
    if (seasonId) {
      await db.delete(harvestBoxesTable).where(inArray(harvestBoxesTable.harvestEventId,
        (await db.select({ id: harvestEventsTable.id }).from(harvestEventsTable).where(eq(harvestEventsTable.harvestSeasonId, seasonId))).map((e) => e.id)
      ));
      await db.delete(harvestEventsTable).where(eq(harvestEventsTable.harvestSeasonId, seasonId));
      await db.delete(harvestSeasonsTable).where(eq(harvestSeasonsTable.id, seasonId));
    }
    if (treeBId) await db.delete(treesTable).where(eq(treesTable.id, treeBId));
    await cleanupFixtures(fixtures);
  });

  it("rejects unauthenticated POST /bottling-runs", async () => {
    const res = await request(app).post("/api/bottling-runs").send({ runCode: "x", bottledAt: "2026-11-01" });
    expect(res.status).toBe(401);
  });

  it("rejects worker POST /bottling-runs (manager only)", async () => {
    const res = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({ runCode: `W-${Date.now()}`, bottledAt: "2026-11-01" });
    expect(res.status).toBe(403);
  });

  it("manager can create a bottling run, allocate sources, recompute origins, and trace by tree", async () => {
    const code = `BR-trace-${Date.now()}`;
    const created = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", managerCookie())
      .send({ runCode: code, bottledAt: "2026-11-01", bottleSizeMl: 500, bottlesProduced: 30, label: "Test", lotCode: "L-T1" });
    expect(created.status).toBe(201);
    const runId: number = created.body.id;
    cleanupBottlingIds.push(runId);

    // Allocate 15 L from the oil batch
    const allocated = await request(app)
      .put(`/api/bottling-runs/${runId}/sources`)
      .set("Cookie", managerCookie())
      .send({ sources: [{ oilBatchId, litersDrawn: 15 }] });
    expect(allocated.status).toBe(200);
    expect(allocated.body.sources).toHaveLength(1);
    expect(allocated.body.origins).toHaveLength(2);

    // Origins should reflect 60/40 weight split — A=60%, B=40%
    const byTree = new Map<number, number>(allocated.body.origins.map((o: { treeId: number; sharePct: number }) => [o.treeId, o.sharePct]));
    expect(byTree.get(treeAId)).toBeCloseTo(60, 1);
    expect(byTree.get(treeBId)).toBeCloseTo(40, 1);

    // Oil batch remaining decremented from 20 → 5
    const obRow = await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId));
    expect(obRow[0].volumeRemainingLiters).toBeCloseTo(5, 5);

    // Tree A bottling-runs lookup (manager-gated)
    const treeRuns = await request(app)
      .get(`/api/trees/${treeAId}/bottling-runs`)
      .set("Cookie", managerCookie());
    expect(treeRuns.status).toBe(200);
    expect(treeRuns.body.length).toBeGreaterThanOrEqual(1);
    const treeRow = treeRuns.body.find((r: { bottlingRunId: number }) => r.bottlingRunId === runId);
    expect(treeRow).toBeTruthy();
    expect(treeRow.sharePct).toBeCloseTo(60, 1);
    expect(treeRow.estimatedBottlesShare).toBeCloseTo(18, 1); // 60% of 30

    // Lot trace report (manager-gated)
    const lotTrace = await request(app)
      .get(`/api/reports/lot-trace/${runId}`)
      .set("Cookie", managerCookie());
    expect(lotTrace.status).toBe(200);
    expect(lotTrace.body.bottlingRun.runCode).toBe(code);
    expect(lotTrace.body.sources).toHaveLength(1);
    expect(lotTrace.body.sources[0].batchCode).toBeTruthy();
    expect(lotTrace.body.origins).toHaveLength(2);
    expect(lotTrace.body.totalLitersDrawn).toBeCloseTo(15, 5);
    expect(lotTrace.body.treeCount).toBe(2);
    expect(Array.isArray(lotTrace.body.topTrees)).toBe(true);
    expect(lotTrace.body.topTrees.length).toBe(2);
    expect(Array.isArray(lotTrace.body.heritageEvidence)).toBe(true);
    expect(lotTrace.body.groveBreakdown[0].treeCount).toBeGreaterThan(0);

    // contribution_kg semantics: 15 L of 20 L drawn (75%) of 100 kg batch
    // → tree A 60 kg * 75% = 45 kg, tree B 40 kg * 75% = 30 kg
    const kgByTree = new Map<number, number>(allocated.body.origins.map((o: { treeId: number; contributionKg: number }) => [o.treeId, o.contributionKg]));
    expect(kgByTree.get(treeAId)).toBeCloseTo(45, 1);
    expect(kgByTree.get(treeBId)).toBeCloseTo(30, 1);

    // Recompute endpoint should keep the same answer.
    const recomp = await request(app)
      .post(`/api/bottling-runs/${runId}/recompute-origins`)
      .set("Cookie", managerCookie());
    expect(recomp.status).toBe(200);
    expect(recomp.body.origins).toHaveLength(2);
  });

  it("rejects unauthenticated reads of bottling endpoints (manager-gated)", async () => {
    const a = await request(app).get(`/api/bottling-runs`);
    expect(a.status).toBe(401);
    const b = await request(app).get(`/api/reports/lot-trace/1`);
    expect(b.status).toBe(401);
    const c = await request(app).get(`/api/trees/${treeAId}/bottling-runs`);
    expect(c.status).toBe(401);
  });

  it("supports year and groveId quick filters on the list", async () => {
    const wrongYear = await request(app)
      .get(`/api/bottling-runs?year=2099`)
      .set("Cookie", managerCookie());
    expect(wrongYear.status).toBe(200);
    expect(wrongYear.body).toHaveLength(0);

    const rightYear = await request(app)
      .get(`/api/bottling-runs?year=2026`)
      .set("Cookie", managerCookie());
    expect(rightYear.status).toBe(200);
    expect(rightYear.body.length).toBeGreaterThan(0);

    const inGrove = await request(app)
      .get(`/api/bottling-runs?groveId=${fixtures.groveId}`)
      .set("Cookie", managerCookie());
    expect(inGrove.status).toBe(200);
    expect(inGrove.body.length).toBeGreaterThan(0);
  });

  it("rejects oversubscription beyond oil batch remaining", async () => {
    const code = `BR-over-${Date.now()}`;
    const created = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", managerCookie())
      .send({ runCode: code, bottledAt: "2026-11-02" });
    expect(created.status).toBe(201);
    const runId = created.body.id;
    cleanupBottlingIds.push(runId);

    // Oil batch has only 5 L remaining after the prior test. Request 999 L.
    const tooMuch = await request(app)
      .put(`/api/bottling-runs/${runId}/sources`)
      .set("Cookie", managerCookie())
      .send({ sources: [{ oilBatchId, litersDrawn: 999 }] });
    expect(tooMuch.status).toBe(400);
    expect(String(tooMuch.body.error ?? "")).toMatch(/Oversubscription|remaining/i);
  });

  it("aggregates duplicate oilBatchId rows in PUT /sources (oversubscription via duplicates rejected)", async () => {
    const before = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    const remainingBefore = before.volumeRemainingLiters ?? 0;

    const code = `BR-dup-${Date.now()}`;
    const created = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", managerCookie())
      .send({ runCode: code, bottledAt: "2026-11-04" });
    const runId = created.body.id;
    cleanupBottlingIds.push(runId);

    // Two rows for the same batch summing to more than remaining — must reject.
    const oversub = await request(app)
      .put(`/api/bottling-runs/${runId}/sources`)
      .set("Cookie", managerCookie())
      .send({ sources: [
        { oilBatchId, litersDrawn: remainingBefore * 0.7 },
        { oilBatchId, litersDrawn: remainingBefore * 0.7 },
      ] });
    expect(oversub.status).toBe(400);

    // Oil batch remaining must be untouched (atomic restore on validation failure).
    const after = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    expect(after.volumeRemainingLiters).toBeCloseTo(remainingBefore, 5);

    // Two valid duplicate rows summing under remaining: should succeed and persist as a single source row.
    const ok = await request(app)
      .put(`/api/bottling-runs/${runId}/sources`)
      .set("Cookie", managerCookie())
      .send({ sources: [
        { oilBatchId, litersDrawn: 1 },
        { oilBatchId, litersDrawn: 1 },
      ] });
    expect(ok.status).toBe(200);
    expect(ok.body.sources).toHaveLength(1);
    expect(ok.body.sources[0].litersDrawn).toBeCloseTo(2, 5);
  });

  it("serializes concurrent PUT /sources on the same run (no inventory drift)", async () => {
    const before = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    const beforeRemaining = before.volumeRemainingLiters ?? 0;

    const code = `BR-conc-${Date.now()}`;
    const created = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", managerCookie())
      .send({ runCode: code, bottledAt: "2026-11-05" });
    const runId = created.body.id;
    cleanupBottlingIds.push(runId);

    // Two concurrent writers on the same run, each setting sources to 1 L.
    // After both succeed, the net delta against the prior (empty) allocation
    // must be exactly 1 L — not 2 L — because both replace the same source set.
    const [a, b] = await Promise.all([
      request(app).put(`/api/bottling-runs/${runId}/sources`).set("Cookie", managerCookie())
        .send({ sources: [{ oilBatchId, litersDrawn: 1 }] }),
      request(app).put(`/api/bottling-runs/${runId}/sources`).set("Cookie", managerCookie())
        .send({ sources: [{ oilBatchId, litersDrawn: 1 }] }),
    ]);
    expect([a.status, b.status].every((s) => s === 200)).toBe(true);

    const after = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    expect(after.volumeRemainingLiters).toBeCloseTo(beforeRemaining - 1, 5);
  });

  it("delete restores the oil batch volume remaining", async () => {
    const before = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    const beforeRemaining = before.volumeRemainingLiters ?? 0;

    const code = `BR-del-${Date.now()}`;
    const created = await request(app)
      .post("/api/bottling-runs")
      .set("Cookie", managerCookie())
      .send({ runCode: code, bottledAt: "2026-11-03" });
    const runId = created.body.id;

    await request(app)
      .put(`/api/bottling-runs/${runId}/sources`)
      .set("Cookie", managerCookie())
      .send({ sources: [{ oilBatchId, litersDrawn: 2 }] });

    const mid = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    expect(mid.volumeRemainingLiters).toBeCloseTo(beforeRemaining - 2, 5);

    const del = await request(app).delete(`/api/bottling-runs/${runId}`).set("Cookie", managerCookie());
    expect(del.status).toBe(204);

    const after = (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, oilBatchId)))[0];
    expect(after.volumeRemainingLiters).toBeCloseTo(beforeRemaining, 5);
  });
});
