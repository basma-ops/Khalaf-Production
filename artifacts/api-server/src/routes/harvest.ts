import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  harvestSeasonsTable, harvestEventsTable, harvestEventWorkersTable,
  harvestBoxesTable, harvestBatchesTable, harvestBatchItemsTable,
  harvestMaturitySamplesTable,
  pressingRunsTable, labResultsTable, oilBatchesTable,
  usersTable, treesTable, grovesTable,
} from "@workspace/db";
import { eq, and, SQL, desc, inArray } from "drizzle-orm";
import {
  CreateHarvestSeasonBody, UpdateHarvestSeasonParams, UpdateHarvestSeasonBody,
  ListHarvestEventsQueryParams, CreateHarvestEventBody, GetHarvestEventParams,
  UpdateHarvestEventParams, UpdateHarvestEventBody,
  GetHarvestEventWorkersParams, AddHarvestEventWorkerParams, AddHarvestEventWorkerBody,
  GetHarvestEventTraceabilityParams,
  ListHarvestBoxesQueryParams, CreateHarvestBoxBody, UpdateHarvestBoxParams, UpdateHarvestBoxBody,
  ListHarvestBatchesQueryParams, CreateHarvestBatchBody, GetHarvestBatchParams,
  UpdateHarvestBatchParams, UpdateHarvestBatchBody,
  GetHarvestBatchItemsParams, AddHarvestBatchItemParams, AddHarvestBatchItemBody,
  ListHarvestMaturitySamplesQueryParams, CreateHarvestMaturitySampleBody,
  GetHarvestReportQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// --- Seasons ---
router.get("/harvest-seasons", async (_req, res) => {
  const seasons = await db.select().from(harvestSeasonsTable).orderBy(desc(harvestSeasonsTable.year));
  res.json(seasons);
});
router.post("/harvest-seasons", async (req, res) => {
  const body = CreateHarvestSeasonBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [s] = await db.insert(harvestSeasonsTable).values(body.data as any).returning();
  res.status(201).json(s);
});
router.patch("/harvest-seasons/:id", async (req, res) => {
  const params = UpdateHarvestSeasonParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateHarvestSeasonBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(harvestSeasonsTable).set({ ...body.data as any, updatedAt: new Date() }).where(eq(harvestSeasonsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// --- Events ---
router.get("/harvest-events", async (req, res) => {
  const query = ListHarvestEventsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { groveId, treeId, seasonId, workerId, status } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(harvestEventsTable.groveId, groveId));
  if (treeId) conditions.push(eq(harvestEventsTable.treeId, treeId));
  if (seasonId) conditions.push(eq(harvestEventsTable.harvestSeasonId, seasonId));
  if (workerId) conditions.push(eq(harvestEventsTable.startedByWorkerId, workerId));
  if (status) conditions.push(eq(harvestEventsTable.status, status));
  const events = await db.select().from(harvestEventsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(harvestEventsTable.harvestDate));
  res.json(events);
});
router.post("/harvest-events", async (req, res) => {
  const body = CreateHarvestEventBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [event] = await db.insert(harvestEventsTable).values(body.data as any).returning();
  res.status(201).json(event);
});
router.get("/harvest-events/:id", async (req, res) => {
  const params = GetHarvestEventParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [event] = await db.select().from(harvestEventsTable).where(eq(harvestEventsTable.id, params.data.id));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  res.json(event);
});
router.patch("/harvest-events/:id", async (req, res) => {
  const params = UpdateHarvestEventParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateHarvestEventBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const updateData: Record<string, unknown> = { ...body.data, updatedAt: new Date() };
  if (body.data.status === "harvested") updateData["completedAt"] = new Date();
  const [updated] = await db.update(harvestEventsTable).set(updateData).where(eq(harvestEventsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});
router.get("/harvest-events/:id/workers", async (req, res) => {
  const params = GetHarvestEventWorkersParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const workers = await db.select({
    id: harvestEventWorkersTable.id, harvestEventId: harvestEventWorkersTable.harvestEventId,
    workerId: harvestEventWorkersTable.workerId, role: harvestEventWorkersTable.role,
    workerName: usersTable.name,
  }).from(harvestEventWorkersTable)
    .leftJoin(usersTable, eq(harvestEventWorkersTable.workerId, usersTable.id))
    .where(eq(harvestEventWorkersTable.harvestEventId, params.data.id));
  res.json(workers);
});
router.post("/harvest-events/:id/workers", async (req, res) => {
  const params = AddHarvestEventWorkerParams.safeParse({ id: Number(req.params["id"]) });
  const body = AddHarvestEventWorkerBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [worker] = await db.insert(harvestEventWorkersTable).values({ harvestEventId: params.data.id, ...body.data }).returning();
  res.status(201).json(worker);
});
router.get("/harvest-events/:id/traceability", async (req, res) => {
  const params = GetHarvestEventTraceabilityParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [event] = await db.select().from(harvestEventsTable).where(eq(harvestEventsTable.id, params.data.id));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  const [tree] = await db.select().from(treesTable).where(eq(treesTable.id, event.treeId));
  const [grove] = await db.select().from(grovesTable).where(eq(grovesTable.id, event.groveId));
  const boxes = await db.select().from(harvestBoxesTable).where(eq(harvestBoxesTable.harvestEventId, params.data.id));
  res.json({ harvestEvent: event, tree, grove, boxes });
});

// --- Boxes ---
router.get("/harvest-boxes", async (req, res) => {
  const query = ListHarvestBoxesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { harvestEventId } = query.data;
  const conditions: SQL[] = [];
  if (harvestEventId) conditions.push(eq(harvestBoxesTable.harvestEventId, harvestEventId));
  const boxes = await db.select().from(harvestBoxesTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(boxes);
});
router.post("/harvest-boxes", async (req, res) => {
  const body = CreateHarvestBoxBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [box] = await db.insert(harvestBoxesTable).values(body.data).returning();
  res.status(201).json(box);
});
router.patch("/harvest-boxes/:id", async (req, res) => {
  const params = UpdateHarvestBoxParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateHarvestBoxBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(harvestBoxesTable).set(body.data).where(eq(harvestBoxesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// --- Batches ---
router.get("/harvest-batches", async (req, res) => {
  const query = ListHarvestBatchesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { seasonId, status } = query.data;
  const conditions: SQL[] = [];
  if (seasonId) conditions.push(eq(harvestBatchesTable.harvestSeasonId, seasonId));
  if (status) conditions.push(eq(harvestBatchesTable.status, status));
  const batches = await db.select().from(harvestBatchesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(harvestBatchesTable.batchDate));
  res.json(batches);
});
router.post("/harvest-batches", async (req, res) => {
  const body = CreateHarvestBatchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [batch] = await db.insert(harvestBatchesTable).values(body.data as any).returning();
  res.status(201).json(batch);
});
router.get("/harvest-batches/:id", async (req, res) => {
  const params = GetHarvestBatchParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [batch] = await db.select().from(harvestBatchesTable).where(eq(harvestBatchesTable.id, params.data.id));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }
  res.json(batch);
});
router.patch("/harvest-batches/:id", async (req, res) => {
  const params = UpdateHarvestBatchParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateHarvestBatchBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(harvestBatchesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(harvestBatchesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});
router.get("/harvest-batches/:id/items", async (req, res) => {
  const params = GetHarvestBatchItemsParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const items = await db.select().from(harvestBatchItemsTable).where(eq(harvestBatchItemsTable.harvestBatchId, params.data.id));
  res.json(items);
});
router.post("/harvest-batches/:id/items", async (req, res) => {
  const params = AddHarvestBatchItemParams.safeParse({ id: Number(req.params["id"]) });
  const body = AddHarvestBatchItemBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [item] = await db.insert(harvestBatchItemsTable).values({ harvestBatchId: params.data.id, ...body.data }).returning();
  res.status(201).json(item);
});

// --- Maturity samples (Jaén) ---
function jaenScore(c: { countGreen: number; countYellow: number; countPurpleStreaked: number; countPurple: number; countBlack: number }): number {
  // Weights per Jaén Maturity Index (0..7)
  const total = c.countGreen + c.countYellow + c.countPurpleStreaked + c.countPurple + c.countBlack;
  if (total <= 0) return 0;
  return (
    (c.countGreen * 0 + c.countYellow * 1 + c.countPurpleStreaked * 2 + c.countPurple * 4 + c.countBlack * 7) / total
  );
}

router.get("/harvest-maturity-samples", async (req, res) => {
  const query = ListHarvestMaturitySamplesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { harvestEventId } = query.data;
  const conditions: SQL[] = [];
  if (harvestEventId) conditions.push(eq(harvestMaturitySamplesTable.harvestEventId, harvestEventId));
  const rows = await db.select().from(harvestMaturitySamplesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(harvestMaturitySamplesTable.sampledAt));
  res.json(rows);
});
router.post("/harvest-maturity-samples", async (req, res) => {
  const body = CreateHarvestMaturitySampleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const score = jaenScore(body.data);
  const total = body.data.countGreen + body.data.countYellow + body.data.countPurpleStreaked + body.data.countPurple + body.data.countBlack;
  const [sample] = await db.insert(harvestMaturitySamplesTable).values({
    ...body.data,
    totalSampled: total,
    jaenScore: score,
  }).returning();
  // Also update the parent event's fruitMaturityScore.
  await db.update(harvestEventsTable)
    .set({ fruitMaturityScore: score, updatedAt: new Date() })
    .where(eq(harvestEventsTable.id, body.data.harvestEventId));
  res.status(201).json(sample);
});

// --- Harvest report (Phase 2) ---
router.get("/reports/harvest", async (req, res) => {
  const query = GetHarvestReportQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { seasonId } = query.data;

  // Load season (or pick the active one if not specified)
  let season = null as null | typeof harvestSeasonsTable.$inferSelect;
  if (seasonId) {
    [season] = await db.select().from(harvestSeasonsTable).where(eq(harvestSeasonsTable.id, seasonId));
  } else {
    const seasons = await db.select().from(harvestSeasonsTable).orderBy(desc(harvestSeasonsTable.year));
    season = seasons.find((s) => s.status === "active") ?? seasons[0] ?? null;
  }

  const eventConditions: SQL[] = [];
  if (season) eventConditions.push(eq(harvestEventsTable.harvestSeasonId, season.id));
  const events = await db.select().from(harvestEventsTable).where(eventConditions.length ? and(...eventConditions) : undefined);

  const groves = await db.select().from(grovesTable);
  const trees = await db.select().from(treesTable);

  const groveById = new Map(groves.map((g) => [g.id, g]));
  const treeById = new Map(trees.map((t) => [t.id, t]));

  // Per-grove totals
  const groveAgg = new Map<number, { kg: number; trees: Set<number> }>();
  const treeAgg = new Map<number, number>();
  let totalKg = 0;
  let maturitySum = 0;
  let maturityCount = 0;
  for (const e of events) {
    const kg = e.totalMeasuredWeightKg ?? e.totalEstimatedWeightKg ?? 0;
    totalKg += kg;
    const g = groveAgg.get(e.groveId) ?? { kg: 0, trees: new Set<number>() };
    g.kg += kg;
    g.trees.add(e.treeId);
    groveAgg.set(e.groveId, g);
    treeAgg.set(e.treeId, (treeAgg.get(e.treeId) ?? 0) + kg);
    if (e.fruitMaturityScore != null) {
      maturitySum += e.fruitMaturityScore;
      maturityCount += 1;
    }
  }

  // Pressing-run aggregates: mean delay + yield % (over runs whose batches are in this season)
  const batches = season
    ? await db.select().from(harvestBatchesTable).where(eq(harvestBatchesTable.harvestSeasonId, season.id))
    : await db.select().from(harvestBatchesTable);
  const batchIds = batches.map((b) => b.id);
  const runs = batchIds.length
    ? await db.select().from(pressingRunsTable).where(inArray(pressingRunsTable.harvestBatchId, batchIds))
    : [];
  let delaySum = 0; let delayCount = 0;
  let oliveTotal = 0; let oilTotal = 0;
  for (const r of runs) {
    if (r.pressingDelayHours != null) { delaySum += r.pressingDelayHours; delayCount += 1; }
    if (r.inputOliveKg != null) oliveTotal += r.inputOliveKg;
    if (r.outputOilLiters != null) oilTotal += r.outputOilLiters;
  }
  const meanPressingDelayHours = delayCount > 0 ? delaySum / delayCount : null;
  const oilYieldPercent = oliveTotal > 0 ? (oilTotal / oliveTotal) * 100 : null;

  // Lab results
  const labs = season
    ? await db.select().from(labResultsTable).where(eq(labResultsTable.harvestSeasonId, season.id))
    : await db.select().from(labResultsTable);
  const oilBatchIds = labs.map((l) => l.oilBatchId).filter((v): v is number => v != null);
  const oilBatches = oilBatchIds.length
    ? await db.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, oilBatchIds))
    : [];
  const oilBatchById = new Map(oilBatches.map((b) => [b.id, b]));

  res.json({
    seasonId: season?.id ?? null,
    seasonName: season?.name ?? null,
    totalKg,
    meanMaturityAtHarvest: maturityCount > 0 ? maturitySum / maturityCount : null,
    meanPressingDelayHours,
    oilYieldPercent,
    totalOilLiters: oilTotal || null,
    kgPerGrove: Array.from(groveAgg.entries()).map(([groveId, v]) => ({
      groveId,
      groveName: groveById.get(groveId)?.name ?? null,
      totalKg: v.kg,
      treeCount: v.trees.size,
    })).sort((a, b) => b.totalKg - a.totalKg),
    kgPerTree: Array.from(treeAgg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([treeId, kg]) => {
        const t = treeById.get(treeId);
        return {
          treeId,
          treeCode: t?.treeCode ?? null,
          groveName: t ? groveById.get(t.groveId)?.name ?? null : null,
          totalKg: kg,
        };
      }),
    labResults: labs.map((l) => ({
      id: l.id,
      attributionLevel: l.attributionLevel,
      oilBatchCode: l.oilBatchId ? oilBatchById.get(l.oilBatchId)?.oilBatchCode ?? null : null,
      labName: l.labName,
      sampleDate: l.sampleDate,
      acidity: l.acidity,
      peroxideValue: l.peroxideValue,
      totalPolyphenolsMgKg: l.totalPolyphenolsMgKg,
      isExtraVirgin: l.acidity != null ? l.acidity <= 0.8 : null,
      isHealthClaimEligible: l.totalPolyphenolsMgKg != null ? l.totalPolyphenolsMgKg >= 250 : null,
    })),
  });
});

export default router;
