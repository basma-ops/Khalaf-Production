import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db, photoAnalysisResultsTable, ruleEvidenceTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupFixtures,
  createFixtures,
  insertAnalysisResult,
  insertHeritageRule,
  insertPendingPhoto,
  managerCookie,
  workerCookie,
  type TestFixtures,
} from "./helpers";

import app from "../src/app";

describe("POST /api/photo-analysis/results/:id/link-rule", () => {
  let fixtures: TestFixtures;
  let heritageRuleId: number;
  const evidenceIds: number[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    const rule = await insertHeritageRule("link-rule");
    heritageRuleId = rule.id;
    fixtures.cleanupIds.heritageRuleIds.push(rule.id);
  });

  afterAll(async () => {
    for (const id of evidenceIds) {
      await db.delete(ruleEvidenceTable).where(eq(ruleEvidenceTable.id, id));
    }
    await cleanupFixtures(fixtures);
  });

  for (const status of ["pending", "rejected", "needs_verification"] as const) {
    it(`rejects with 409 when reviewStatus is "${status}"`, async () => {
      const photo = await insertPendingPhoto({
        workerUserId: fixtures.workerUserId,
        treeId: fixtures.treeId,
        groveId: fixtures.groveId,
        linkedEntityType: "library",
      });
      fixtures.cleanupIds.mediaIds.push(photo.id);

      const result = await insertAnalysisResult({
        mediaId: photo.id,
        treeId: fixtures.treeId,
        groveId: fixtures.groveId,
        reviewStatus: status,
      });

      const res = await request(app)
        .post(`/api/photo-analysis/results/${result.id}/link-rule`)
        .set("Cookie", managerCookie())
        .send({ heritageRuleId, evidence: "Should be rejected." });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/confirmed/i);

      const [stored] = await db
        .select()
        .from(photoAnalysisResultsTable)
        .where(eq(photoAnalysisResultsTable.id, result.id));
      expect(stored?.linkedHeritageRuleId).toBeNull();
      expect(stored?.linkedRuleEvidenceId).toBeNull();
    });
  }

  it("accepts link-rule when reviewStatus is 'confirmed' and persists rule_evidence", async () => {
    const photo = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "library",
    });
    fixtures.cleanupIds.mediaIds.push(photo.id);

    const result = await insertAnalysisResult({
      mediaId: photo.id,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      reviewStatus: "confirmed",
      confidenceScore: 0.85,
      summary: "Confirmed canopy thinning observed.",
    });

    const res = await request(app)
      .post(`/api/photo-analysis/results/${result.id}/link-rule`)
      .set("Cookie", managerCookie())
      .send({ heritageRuleId, evidence: "Manager confirmed thinning signal." });

    expect(res.status).toBe(201);
    expect(res.body.linkedHeritageRuleId).toBe(heritageRuleId);
    expect(res.body.linkedRuleEvidenceId).toEqual(expect.any(Number));
    evidenceIds.push(res.body.linkedRuleEvidenceId);

    const [evidence] = await db
      .select()
      .from(ruleEvidenceTable)
      .where(eq(ruleEvidenceTable.id, res.body.linkedRuleEvidenceId));
    expect(evidence?.heritageRuleId).toBe(heritageRuleId);
    expect(evidence?.treeId).toBe(fixtures.treeId);
    expect(evidence?.groveId).toBe(fixtures.groveId);
    expect(evidence?.confidenceLevel).toBe("high");
    expect(evidence?.metricName).toBe("visual_photo_signal");

    const [stored] = await db
      .select()
      .from(photoAnalysisResultsTable)
      .where(eq(photoAnalysisResultsTable.id, result.id));
    expect(stored?.linkedHeritageRuleId).toBe(heritageRuleId);
    expect(stored?.linkedRuleEvidenceId).toBe(res.body.linkedRuleEvidenceId);
  });

  it("rejects worker sessions with 403 (manager-only)", async () => {
    const photo = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "library",
    });
    fixtures.cleanupIds.mediaIds.push(photo.id);
    const result = await insertAnalysisResult({
      mediaId: photo.id,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      reviewStatus: "confirmed",
    });

    const res = await request(app)
      .post(`/api/photo-analysis/results/${result.id}/link-rule`)
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({ heritageRuleId });
    expect(res.status).toBe(403);
  });
});
