import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { treatmentsTable, usersTable, grovesTable, treesTable, pestDiseaseFindsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  ListTreatmentsQueryParams,
  CreateTreatmentBody,
  GetTreatmentParams,
  UpdateTreatmentParams,
  UpdateTreatmentBody,
  DeleteTreatmentParams,
  GetWithholdingWatchQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const selectShape = {
  id: treatmentsTable.id,
  workerId: treatmentsTable.workerId,
  workerName: usersTable.name,
  groveId: treatmentsTable.groveId,
  groveName: grovesTable.name,
  treeIds: treatmentsTable.treeIds,
  photoIds: treatmentsTable.photoIds,
  linkedFindId: treatmentsTable.linkedFindId,
  treatmentKind: treatmentsTable.treatmentKind,
  product: treatmentsTable.product,
  activeIngredient: treatmentsTable.activeIngredient,
  rate: treatmentsTable.rate,
  rateUnit: treatmentsTable.rateUnit,
  method: treatmentsTable.method,
  areaHectares: treatmentsTable.areaHectares,
  treesAffectedCount: treatmentsTable.treesAffectedCount,
  appliedAt: treatmentsTable.appliedAt,
  withholdingDays: treatmentsTable.withholdingDays,
  weatherConditions: treatmentsTable.weatherConditions,
  notes: treatmentsTable.notes,
  createdAt: treatmentsTable.createdAt,
} as const;

// IMPORTANT: place /treatments/withholding-watch BEFORE /treatments/:id
router.get("/treatments/withholding-watch", async (req, res) => {
  const query = GetWithholdingWatchQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { targetDate, groveId, treeId, windowDays } = query.data;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(targetDate);
  const targetStart = isDateOnly ? new Date(targetDate + "T00:00:00.000Z") : new Date(targetDate);
  if (Number.isNaN(targetStart.getTime())) { res.status(400).json({ error: "Invalid targetDate" }); return; }
  const days = windowDays && windowDays > 0 ? windowDays : 1;
  const windowEnd = new Date(targetStart.getTime() + (days * 86400000) - 1);

  // Resolve effective grove for treeId — prevents matching grove-wide treatments from
  // every grove when only treeId is supplied (treeIds IS NULL means "whole grove").
  let effectiveGroveId: number | undefined = groveId;
  if (treeId && !effectiveGroveId) {
    const [tree] = await db.select({ groveId: treesTable.groveId }).from(treesTable).where(eq(treesTable.id, treeId));
    if (!tree) { res.status(404).json({ error: "Tree not found" }); return; }
    effectiveGroveId = tree.groveId;
  }

  const endsAt = sql<Date>`(${treatmentsTable.appliedAt} + (${treatmentsTable.withholdingDays} || ' days')::interval)`;
  const conditions: SQL[] = [
    sql`${treatmentsTable.withholdingDays} > 0`,
    lte(treatmentsTable.appliedAt, windowEnd),
    sql`${endsAt} >= ${targetStart}`,
  ];
  if (effectiveGroveId) conditions.push(eq(treatmentsTable.groveId, effectiveGroveId));
  if (treeId) conditions.push(sql`(${treatmentsTable.treeIds} IS NULL OR ${treatmentsTable.treeIds} @> ARRAY[${treeId}]::integer[])`);

  const rows = await db.select({
    treatmentId: treatmentsTable.id,
    groveId: treatmentsTable.groveId,
    groveName: grovesTable.name,
    treeIds: treatmentsTable.treeIds,
    product: treatmentsTable.product,
    treatmentKind: treatmentsTable.treatmentKind,
    method: treatmentsTable.method,
    activeIngredient: treatmentsTable.activeIngredient,
    appliedAt: treatmentsTable.appliedAt,
    withholdingDays: treatmentsTable.withholdingDays,
    withholdingEndsAt: endsAt.as("withholding_ends_at"),
    daysRemaining: sql<number>`GREATEST(CEIL(EXTRACT(EPOCH FROM (${endsAt} - ${targetStart})) / 86400.0)::int, 0)`.as("days_remaining"),
  }).from(treatmentsTable)
    .leftJoin(grovesTable, eq(grovesTable.id, treatmentsTable.groveId))
    .where(and(...conditions))
    .orderBy(desc(treatmentsTable.appliedAt));

  res.json(rows.map((r) => ({ ...r, targetDate })));
});

router.get("/treatments", async (req, res) => {
  const query = ListTreatmentsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, treeId, treatmentKind, product, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(treatmentsTable.groveId, groveId));
  if (treeId) conditions.push(sql`${treatmentsTable.treeIds} @> ARRAY[${treeId}]::integer[]`);
  if (treatmentKind) conditions.push(eq(treatmentsTable.treatmentKind, treatmentKind));
  if (product) conditions.push(eq(treatmentsTable.product, product));
  if (fromDate) conditions.push(gte(treatmentsTable.appliedAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(treatmentsTable.appliedAt, end));
  }
  const rows = await db.select(selectShape).from(treatmentsTable)
    .leftJoin(usersTable, eq(usersTable.id, treatmentsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, treatmentsTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(treatmentsTable.appliedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/treatments", async (req, res) => {
  const body = CreateTreatmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { appliedAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(appliedAt ? { appliedAt: new Date(appliedAt) } : {}) };
  const [created] = await db.insert(treatmentsTable).values(insertValues as typeof treatmentsTable.$inferInsert).returning();
  // Maintain bidirectional link: if treatment references a find, set find.linkedTreatmentId.
  if (created && rest.linkedFindId) {
    await db.update(pestDiseaseFindsTable)
      .set({ linkedTreatmentId: created.id })
      .where(eq(pestDiseaseFindsTable.id, rest.linkedFindId));
  }
  req.log.info({ treatmentId: created?.id, product: created?.product, withholdingDays: created?.withholdingDays, linkedFindId: rest.linkedFindId ?? null }, "treatment logged");
  res.status(201).json(created);
});

router.patch("/treatments/:id", async (req, res) => {
  const params = UpdateTreatmentParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTreatmentBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { appliedAt, ...rest } = body.data;
  // Capture previous linkedFindId so we can clear stale back-references when it changes.
  const [prev] = await db.select({ linkedFindId: treatmentsTable.linkedFindId })
    .from(treatmentsTable).where(eq(treatmentsTable.id, params.data.id));
  const updateValues: Record<string, unknown> = { ...rest };
  if (appliedAt) updateValues["appliedAt"] = new Date(appliedAt);
  const [updated] = await db.update(treatmentsTable).set(updateValues).where(eq(treatmentsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  if (rest.linkedFindId !== undefined) {
    const prevFindId = prev?.linkedFindId ?? null;
    const nextFindId = rest.linkedFindId;
    if (prevFindId && prevFindId !== nextFindId) {
      await db.update(pestDiseaseFindsTable)
        .set({ linkedTreatmentId: null })
        .where(and(eq(pestDiseaseFindsTable.id, prevFindId), eq(pestDiseaseFindsTable.linkedTreatmentId, updated.id)));
    }
    if (nextFindId) {
      await db.update(pestDiseaseFindsTable)
        .set({ linkedTreatmentId: updated.id })
        .where(eq(pestDiseaseFindsTable.id, nextFindId));
    }
  }
  res.json(updated);
});

router.delete("/treatments/:id", async (req, res) => {
  const params = DeleteTreatmentParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(treatmentsTable).where(eq(treatmentsTable.id, params.data.id)).returning({ id: treatmentsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/treatments/:id", async (req, res) => {
  const params = GetTreatmentParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(treatmentsTable)
    .leftJoin(usersTable, eq(usersTable.id, treatmentsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, treatmentsTable.groveId))
    .where(eq(treatmentsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
