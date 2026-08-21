import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { irrigationEventsTable, usersTable, grovesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  ListIrrigationEventsQueryParams,
  CreateIrrigationEventBody,
  GetIrrigationEventParams,
  UpdateIrrigationEventParams,
  UpdateIrrigationEventBody,
  DeleteIrrigationEventParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const selectShape = {
  id: irrigationEventsTable.id,
  workerId: irrigationEventsTable.workerId,
  workerName: usersTable.name,
  groveId: irrigationEventsTable.groveId,
  groveName: grovesTable.name,
  occurredAt: irrigationEventsTable.occurredAt,
  volumeLitres: irrigationEventsTable.volumeLitres,
  method: irrigationEventsTable.method,
  durationMinutes: irrigationEventsTable.durationMinutes,
  notes: irrigationEventsTable.notes,
  createdAt: irrigationEventsTable.createdAt,
} as const;

router.get("/irrigation-events", async (req, res) => {
  const query = ListIrrigationEventsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, method, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(irrigationEventsTable.groveId, groveId));
  if (method) conditions.push(eq(irrigationEventsTable.method, method));
  if (fromDate) conditions.push(gte(irrigationEventsTable.occurredAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(irrigationEventsTable.occurredAt, end));
  }
  const rows = await db.select(selectShape).from(irrigationEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, irrigationEventsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, irrigationEventsTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(irrigationEventsTable.occurredAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/irrigation-events", async (req, res) => {
  const body = CreateIrrigationEventBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { occurredAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(occurredAt ? { occurredAt: new Date(occurredAt) } : {}) };
  const [created] = await db.insert(irrigationEventsTable).values(insertValues as typeof irrigationEventsTable.$inferInsert).returning();
  req.log.info({ irrigationId: created?.id, groveId: created?.groveId, volumeLitres: created?.volumeLitres }, "irrigation event logged");
  res.status(201).json(created);
});

router.patch("/irrigation-events/:id", async (req, res) => {
  const params = UpdateIrrigationEventParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateIrrigationEventBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { occurredAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (occurredAt) updateValues["occurredAt"] = new Date(occurredAt);
  const [updated] = await db.update(irrigationEventsTable).set(updateValues).where(eq(irrigationEventsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/irrigation-events/:id", async (req, res) => {
  const params = DeleteIrrigationEventParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(irrigationEventsTable).where(eq(irrigationEventsTable.id, params.data.id)).returning({ id: irrigationEventsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/irrigation-events/:id", async (req, res) => {
  const params = GetIrrigationEventParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(irrigationEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, irrigationEventsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, irrigationEventsTable.groveId))
    .where(eq(irrigationEventsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
