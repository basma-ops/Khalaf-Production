import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trapsTable, trapCountsTable, usersTable, grovesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, isNull, sql, type SQL } from "drizzle-orm";
import {
  ListTrapsQueryParams,
  CreateTrapBody,
  GetTrapParams,
  UpdateTrapParams,
  UpdateTrapBody,
  DeleteTrapParams,
  ListTrapCountsQueryParams,
  CreateTrapCountBody,
  GetTrapCountParams,
  UpdateTrapCountParams,
  UpdateTrapCountBody,
  DeleteTrapCountParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/traps", async (req, res) => {
  const query = ListTrapsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, kind, activeOnly, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(trapsTable.groveId, groveId));
  if (kind) conditions.push(eq(trapsTable.kind, kind));
  if (activeOnly) conditions.push(isNull(trapsTable.retiredAt));

  const latestCounts = db.$with("latest_counts").as(
    db.select({
      trapId: trapCountsTable.trapId,
      count: sql<number>`(array_agg(${trapCountsTable.count} ORDER BY ${trapCountsTable.countDate} DESC))[1]`.as("latest_count"),
      countDate: sql<Date>`max(${trapCountsTable.countDate})`.as("latest_count_date"),
    }).from(trapCountsTable).groupBy(trapCountsTable.trapId),
  );

  const rows = await db.with(latestCounts)
    .select({
      id: trapsTable.id,
      groveId: trapsTable.groveId,
      groveName: grovesTable.name,
      code: trapsTable.code,
      kind: trapsTable.kind,
      targetSpecies: trapsTable.targetSpecies,
      locationLat: trapsTable.locationLat,
      locationLon: trapsTable.locationLon,
      locationDescription: trapsTable.locationDescription,
      installedAt: trapsTable.installedAt,
      retiredAt: trapsTable.retiredAt,
      notes: trapsTable.notes,
      latestCount: latestCounts.count,
      latestCountDate: latestCounts.countDate,
      createdAt: trapsTable.createdAt,
    }).from(trapsTable)
    .leftJoin(grovesTable, eq(grovesTable.id, trapsTable.groveId))
    .leftJoin(latestCounts, eq(latestCounts.trapId, trapsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(trapsTable.installedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/traps", async (req, res) => {
  const body = CreateTrapBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { installedAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(installedAt ? { installedAt: new Date(installedAt) } : {}) };
  const [created] = await db.insert(trapsTable).values(insertValues as typeof trapsTable.$inferInsert).returning();
  req.log.info({ trapId: created?.id, code: created?.code, kind: created?.kind }, "trap created");
  res.status(201).json(created);
});

router.patch("/traps/:id", async (req, res) => {
  const params = UpdateTrapParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTrapBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { retiredAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (retiredAt !== undefined) updateValues["retiredAt"] = retiredAt ? new Date(retiredAt) : null;
  const [updated] = await db.update(trapsTable).set(updateValues).where(eq(trapsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/traps/:id", async (req, res) => {
  const params = DeleteTrapParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(trapsTable).where(eq(trapsTable.id, params.data.id)).returning({ id: trapsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/traps/:id", async (req, res) => {
  const params = GetTrapParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(trapsTable).where(eq(trapsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── Trap counts ───────────────────────────────────────────────────────────

const countSelect = {
  id: trapCountsTable.id,
  trapId: trapCountsTable.trapId,
  trapCode: trapsTable.code,
  trapKind: trapsTable.kind,
  groveId: trapsTable.groveId,
  groveName: grovesTable.name,
  workerId: trapCountsTable.workerId,
  workerName: usersTable.name,
  count: trapCountsTable.count,
  countDate: trapCountsTable.countDate,
  photoIds: trapCountsTable.photoIds,
  source: trapCountsTable.source,
  notes: trapCountsTable.notes,
  createdAt: trapCountsTable.createdAt,
} as const;

router.get("/trap-counts", async (req, res) => {
  const query = ListTrapCountsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { trapId, groveId, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (trapId) conditions.push(eq(trapCountsTable.trapId, trapId));
  if (groveId) conditions.push(eq(trapsTable.groveId, groveId));
  if (fromDate) conditions.push(gte(trapCountsTable.countDate, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(trapCountsTable.countDate, end));
  }
  const rows = await db.select(countSelect).from(trapCountsTable)
    .leftJoin(trapsTable, eq(trapsTable.id, trapCountsTable.trapId))
    .leftJoin(grovesTable, eq(grovesTable.id, trapsTable.groveId))
    .leftJoin(usersTable, eq(usersTable.id, trapCountsTable.workerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(trapCountsTable.countDate))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/trap-counts", async (req, res) => {
  const body = CreateTrapCountBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { countDate, ...rest } = body.data;
  const insertValues = { ...rest, ...(countDate ? { countDate: new Date(countDate) } : {}) };
  const [created] = await db.insert(trapCountsTable).values(insertValues as typeof trapCountsTable.$inferInsert).returning();
  req.log.info({ trapCountId: created?.id, trapId: created?.trapId, count: created?.count }, "trap count logged");
  res.status(201).json(created);
});

router.patch("/trap-counts/:id", async (req, res) => {
  const params = UpdateTrapCountParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTrapCountBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { countDate, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (countDate) updateValues["countDate"] = new Date(countDate);
  const [updated] = await db.update(trapCountsTable).set(updateValues).where(eq(trapCountsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/trap-counts/:id", async (req, res) => {
  const params = DeleteTrapCountParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(trapCountsTable).where(eq(trapCountsTable.id, params.data.id)).returning({ id: trapCountsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/trap-counts/:id", async (req, res) => {
  const params = GetTrapCountParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(countSelect).from(trapCountsTable)
    .leftJoin(trapsTable, eq(trapsTable.id, trapCountsTable.trapId))
    .leftJoin(grovesTable, eq(grovesTable.id, trapsTable.groveId))
    .leftJoin(usersTable, eq(usersTable.id, trapCountsTable.workerId))
    .where(eq(trapCountsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
