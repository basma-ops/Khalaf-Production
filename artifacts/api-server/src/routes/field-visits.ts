import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { fieldVisitsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListFieldVisitsQueryParams,
  CreateFieldVisitBody,
  GetFieldVisitParams,
  UpdateFieldVisitParams,
  UpdateFieldVisitBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/field-visits", async (req, res) => {
  const query = ListFieldVisitsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { groveId, treeId, workerId, taskId } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(fieldVisitsTable.groveId, groveId));
  if (treeId) conditions.push(eq(fieldVisitsTable.treeId as any, treeId));
  if (workerId) conditions.push(eq(fieldVisitsTable.workerId, workerId));
  if (taskId) conditions.push(eq(fieldVisitsTable.taskId as any, taskId));
  const visits = await db.select().from(fieldVisitsTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(visits);
});

router.post("/field-visits", async (req, res) => {
  const body = CreateFieldVisitBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [visit] = await db.insert(fieldVisitsTable).values(body.data).returning();
  res.status(201).json(visit);
});

router.get("/field-visits/:id", async (req, res) => {
  const params = GetFieldVisitParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [visit] = await db.select().from(fieldVisitsTable).where(eq(fieldVisitsTable.id, params.data.id));
  if (!visit) { res.status(404).json({ error: "Not found" }); return; }
  res.json(visit);
});

router.patch("/field-visits/:id", async (req, res) => {
  const params = UpdateFieldVisitParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateFieldVisitBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(fieldVisitsTable).set(body.data).where(eq(fieldVisitsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
