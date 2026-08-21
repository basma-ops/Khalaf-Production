import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  pressingRunsTable, oilBatchesTable, labResultsTable,
  grovesTable, treesTable,
} from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListPressingRunsQueryParams, CreatePressingRunBody, GetPressingRunParams,
  UpdatePressingRunParams, UpdatePressingRunBody,
  CreateOilBatchBody, GetOilBatchParams, UpdateOilBatchParams, UpdateOilBatchBody,
  ListLabResultsForOilBatchParams,
  ListLabResultsQueryParams, CreateLabResultBody, GetLabResultParams,
  UpdateLabResultParams, UpdateLabResultBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

type LabRow = typeof labResultsTable.$inferSelect;

export function withLabFlags(r: LabRow & {
  groveName?: string | null; treeCode?: string | null; oilBatchCode?: string | null;
}) {
  const isExtraVirgin = r.acidity != null ? r.acidity <= 0.8 : null;
  const isHealthClaimEligible = r.totalPolyphenolsMgKg != null ? r.totalPolyphenolsMgKg >= 250 : null;
  return { ...r, isExtraVirgin, isHealthClaimEligible };
}

// --- Pressing Runs ---
router.get("/pressing-runs", async (req, res) => {
  const query = ListPressingRunsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { batchId } = query.data;
  const conditions: SQL[] = [];
  if (batchId) conditions.push(eq(pressingRunsTable.harvestBatchId, batchId));
  const runs = await db.select().from(pressingRunsTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(runs);
});
router.post("/pressing-runs", async (req, res) => {
  const body = CreatePressingRunBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [run] = await db.insert(pressingRunsTable).values(body.data as any).returning();
  res.status(201).json(run);
});
router.get("/pressing-runs/:id", async (req, res) => {
  const params = GetPressingRunParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [run] = await db.select().from(pressingRunsTable).where(eq(pressingRunsTable.id, params.data.id));
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  res.json(run);
});
router.patch("/pressing-runs/:id", async (req, res) => {
  const params = UpdatePressingRunParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdatePressingRunBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(pressingRunsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(pressingRunsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// --- Oil Batches ---
router.get("/oil-batches", async (_req, res) => {
  const batches = await db.select().from(oilBatchesTable);
  // Annotate with lab result counts.
  const allLabs = await db.select({ id: labResultsTable.id, oilBatchId: labResultsTable.oilBatchId }).from(labResultsTable);
  const counts = new Map<number, number>();
  for (const l of allLabs) {
    if (l.oilBatchId != null) counts.set(l.oilBatchId, (counts.get(l.oilBatchId) ?? 0) + 1);
  }
  res.json(batches.map((b) => ({ ...b, labResultCount: counts.get(b.id) ?? 0 })));
});
router.post("/oil-batches", async (req, res) => {
  const body = CreateOilBatchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const data = { ...body.data } as any;
  if (data.volumeRemainingLiters == null && data.volumeLiters != null) {
    data.volumeRemainingLiters = data.volumeLiters;
  }
  const [batch] = await db.insert(oilBatchesTable).values(data).returning();
  res.status(201).json(batch);
});
router.get("/oil-batches/:id", async (req, res) => {
  const params = GetOilBatchParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [batch] = await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, params.data.id));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }
  const labs = await db.select().from(labResultsTable).where(eq(labResultsTable.oilBatchId, params.data.id));
  res.json({ ...batch, labResultCount: labs.length });
});
router.delete("/oil-batches/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Detach lab results so we don't orphan them.
  await db.update(labResultsTable).set({ oilBatchId: null }).where(eq(labResultsTable.oilBatchId, id));
  await db.delete(oilBatchesTable).where(eq(oilBatchesTable.id, id));
  res.status(204).end();
});
router.patch("/oil-batches/:id", async (req, res) => {
  const params = UpdateOilBatchParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateOilBatchBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(oilBatchesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(oilBatchesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});
router.get("/oil-batches/:id/lab-results", async (req, res) => {
  const params = ListLabResultsForOilBatchParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const labs = await db.select().from(labResultsTable).where(eq(labResultsTable.oilBatchId, params.data.id));
  res.json(labs.map((l) => withLabFlags(l)));
});

// --- Lab Results ---
async function enrichLab(r: LabRow) {
  const grove = r.groveId ? (await db.select().from(grovesTable).where(eq(grovesTable.id, r.groveId)))[0] : null;
  const tree = r.treeId ? (await db.select().from(treesTable).where(eq(treesTable.id, r.treeId)))[0] : null;
  const oilBatch = r.oilBatchId ? (await db.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, r.oilBatchId)))[0] : null;
  return withLabFlags({
    ...r,
    groveName: grove?.name ?? null,
    treeCode: tree?.treeCode ?? null,
    oilBatchCode: oilBatch?.oilBatchCode ?? null,
  });
}

router.get("/lab-results", async (req, res) => {
  const query = ListLabResultsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { seasonId, batchId, oilBatchId, groveId, treeId, attributionLevel } = query.data;
  const conditions: SQL[] = [];
  if (seasonId) conditions.push(eq(labResultsTable.harvestSeasonId, seasonId));
  if (batchId) conditions.push(eq(labResultsTable.harvestBatchId, batchId));
  if (oilBatchId) conditions.push(eq(labResultsTable.oilBatchId, oilBatchId));
  if (groveId) conditions.push(eq(labResultsTable.groveId, groveId));
  if (treeId) conditions.push(eq(labResultsTable.treeId, treeId));
  if (attributionLevel) conditions.push(eq(labResultsTable.attributionLevel, attributionLevel));
  const results = await db.select().from(labResultsTable).where(conditions.length ? and(...conditions) : undefined);
  const enriched = await Promise.all(results.map((r) => enrichLab(r)));
  res.json(enriched);
});
router.post("/lab-results", async (req, res) => {
  const body = CreateLabResultBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [result] = await db.insert(labResultsTable).values(body.data as any).returning();
  res.status(201).json(await enrichLab(result));
});
router.get("/lab-results/:id", async (req, res) => {
  const params = GetLabResultParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [result] = await db.select().from(labResultsTable).where(eq(labResultsTable.id, params.data.id));
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichLab(result));
});
router.patch("/lab-results/:id", async (req, res) => {
  const params = UpdateLabResultParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateLabResultBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const { sampleDate, ...rest } = body.data;
  const sampleDateStr =
    sampleDate instanceof Date ? sampleDate.toISOString().slice(0, 10) : sampleDate ?? undefined;
  const [updated] = await db
    .update(labResultsTable)
    .set({ ...rest, sampleDate: sampleDateStr, updatedAt: new Date() })
    .where(eq(labResultsTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichLab(updated));
});

export default router;
