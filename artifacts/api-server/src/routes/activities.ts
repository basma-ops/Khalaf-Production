import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { activitiesTable, usersTable, grovesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  ListActivitiesQueryParams,
  CreateActivityBody,
  GetActivityParams,
  UpdateActivityParams,
  UpdateActivityBody,
  DeleteActivityParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/activities", async (req, res) => {
  const query = ListActivitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query", details: query.error.issues });
    return;
  }
  const { groveId, treeId, workerId, activityType, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(activitiesTable.groveId, groveId));
  if (treeId) conditions.push(sql`${activitiesTable.treeIds} @> ARRAY[${treeId}]::integer[]`);
  if (workerId) conditions.push(eq(activitiesTable.workerId, workerId));
  if (activityType) conditions.push(eq(activitiesTable.activityType, activityType));
  if (fromDate) conditions.push(gte(activitiesTable.performedAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(activitiesTable.performedAt, end));
  }
  const rows = await db
    .select({
      id: activitiesTable.id,
      workerId: activitiesTable.workerId,
      workerName: usersTable.name,
      groveId: activitiesTable.groveId,
      groveName: grovesTable.name,
      treeIds: activitiesTable.treeIds,
      photoIds: activitiesTable.photoIds,
      taskId: activitiesTable.taskId,
      activityType: activitiesTable.activityType,
      performedAt: activitiesTable.performedAt,
      durationMinutes: activitiesTable.durationMinutes,
      treesAffectedCount: activitiesTable.treesAffectedCount,
      areaHectares: activitiesTable.areaHectares,
      materialsUsed: activitiesTable.materialsUsed,
      gpsLat: activitiesTable.gpsLat,
      gpsLon: activitiesTable.gpsLon,
      notes: activitiesTable.notes,
      createdAt: activitiesTable.createdAt,
    })
    .from(activitiesTable)
    .leftJoin(usersTable, eq(usersTable.id, activitiesTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, activitiesTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(activitiesTable.performedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/activities", async (req, res) => {
  const body = CreateActivityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body", details: body.error.issues });
    return;
  }
  const { performedAt, ...rest } = body.data;
  const insertValues = {
    ...rest,
    ...(performedAt ? { performedAt: new Date(performedAt) } : {}),
  };
  const [created] = await db
    .insert(activitiesTable)
    .values(insertValues as typeof activitiesTable.$inferInsert)
    .returning();
  req.log.info(
    { activityId: created?.id, type: created?.activityType, groveId: created?.groveId },
    "activity created",
  );
  res.status(201).json(created);
});

router.patch("/activities/:id", async (req, res) => {
  const params = UpdateActivityParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateActivityBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined });
    return;
  }
  const { performedAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (performedAt) updateValues["performedAt"] = new Date(performedAt);
  const [updated] = await db
    .update(activitiesTable)
    .set(updateValues)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/activities/:id", async (req, res) => {
  const params = DeleteActivityParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(activitiesTable).where(eq(activitiesTable.id, params.data.id)).returning({ id: activitiesTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/activities/:id", async (req, res) => {
  const params = GetActivityParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

export default router;
