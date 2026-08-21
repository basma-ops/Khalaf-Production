import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { phenologyEventsTable, usersTable, grovesTable, treesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  ListPhenologyEventsQueryParams,
  CreatePhenologyEventBody,
  GetGrovePhenologySummaryParams,
  UpdatePhenologyEventParams,
  UpdatePhenologyEventBody,
  DeletePhenologyEventParams,
  GetPhenologyEventParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const phenologySelect = {
  id: phenologyEventsTable.id,
  workerId: phenologyEventsTable.workerId,
  workerName: usersTable.name,
  groveId: phenologyEventsTable.groveId,
  groveName: grovesTable.name,
  treeId: phenologyEventsTable.treeId,
  treeCode: treesTable.treeCode,
  observedAt: phenologyEventsTable.observedAt,
  bbchStage: phenologyEventsTable.bbchStage,
  bbchCode: phenologyEventsTable.bbchCode,
  coveragePercent: phenologyEventsTable.coveragePercent,
  intensity: phenologyEventsTable.intensity,
  notes: phenologyEventsTable.notes,
  photoIds: phenologyEventsTable.photoIds,
  createdAt: phenologyEventsTable.createdAt,
} as const;

router.get("/phenology-events", async (req, res) => {
  const query = ListPhenologyEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query", details: query.error.issues });
    return;
  }
  const { groveId, treeId, bbchStage, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(phenologyEventsTable.groveId, groveId));
  if (treeId) conditions.push(eq(phenologyEventsTable.treeId, treeId));
  if (bbchStage) conditions.push(eq(phenologyEventsTable.bbchStage, bbchStage));
  if (fromDate) conditions.push(gte(phenologyEventsTable.observedAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(phenologyEventsTable.observedAt, end));
  }
  const rows = await db
    .select(phenologySelect)
    .from(phenologyEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, phenologyEventsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, phenologyEventsTable.groveId))
    .leftJoin(treesTable, eq(treesTable.id, phenologyEventsTable.treeId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(phenologyEventsTable.observedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/phenology-events", async (req, res) => {
  const body = CreatePhenologyEventBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body", details: body.error.issues });
    return;
  }
  const { observedAt, ...rest } = body.data;
  const insertValues = {
    ...rest,
    ...(observedAt ? { observedAt: new Date(observedAt) } : {}),
  };
  const [created] = await db
    .insert(phenologyEventsTable)
    .values(insertValues as typeof phenologyEventsTable.$inferInsert)
    .returning();
  req.log.info(
    { phenologyId: created?.id, stage: created?.bbchStage, groveId: created?.groveId },
    "phenology event recorded",
  );
  res.status(201).json(created);
});

router.get("/phenology-events/:id", async (req, res) => {
  const params = GetPhenologyEventParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select(phenologySelect)
    .from(phenologyEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, phenologyEventsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, phenologyEventsTable.groveId))
    .leftJoin(treesTable, eq(treesTable.id, phenologyEventsTable.treeId))
    .where(eq(phenologyEventsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/phenology-events/:id", async (req, res) => {
  const params = UpdatePhenologyEventParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdatePhenologyEventBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined });
    return;
  }
  const { observedAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (observedAt) updateValues["observedAt"] = new Date(observedAt);
  const [updated] = await db
    .update(phenologyEventsTable)
    .set(updateValues)
    .where(eq(phenologyEventsTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/phenology-events/:id", async (req, res) => {
  const params = DeletePhenologyEventParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(phenologyEventsTable).where(eq(phenologyEventsTable.id, params.data.id)).returning({ id: phenologyEventsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/groves/:groveId/phenology-summary", async (req, res) => {
  const params = GetGrovePhenologySummaryParams.safeParse({ groveId: Number(req.params["groveId"]) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid groveId" });
    return;
  }
  const events = await db
    .select(phenologySelect)
    .from(phenologyEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, phenologyEventsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, phenologyEventsTable.groveId))
    .leftJoin(treesTable, eq(treesTable.id, phenologyEventsTable.treeId))
    .where(eq(phenologyEventsTable.groveId, params.data.groveId))
    .orderBy(desc(phenologyEventsTable.observedAt))
    .limit(50);
  const latest = events[0];
  res.json({
    groveId: params.data.groveId,
    latestStage: latest?.bbchStage ?? null,
    latestObservedAt: latest?.observedAt ?? null,
    events,
  });
});

export default router;
