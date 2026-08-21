import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  UpdateTaskBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks", async (req, res) => {
  const query = ListTasksQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { status, priority, taskType, assignedToUserId, groveId, treeId } = query.data;
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (priority) conditions.push(eq(tasksTable.priority, priority));
  if (taskType) conditions.push(eq(tasksTable.taskType, taskType));
  if (assignedToUserId) conditions.push(eq(tasksTable.assignedToUserId as any, assignedToUserId));
  if (groveId) conditions.push(eq(tasksTable.groveId as any, groveId));
  if (treeId) conditions.push(eq(tasksTable.treeId as any, treeId));
  const tasks = await db.select().from(tasksTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [task] = await db.insert(tasksTable).values(body.data as any).returning();
  res.status(201).json(task);
});

router.get("/tasks/:id", async (req, res) => {
  const params = GetTaskParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  res.json(task);
});

router.patch("/tasks/:id", async (req, res) => {
  const params = UpdateTaskParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const updateData: Record<string, unknown> = { ...body.data, updatedAt: new Date() };
  if (body.data.status === "completed") updateData["completedAt"] = new Date();
  const [updated] = await db.update(tasksTable).set(updateData).where(eq(tasksTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/tasks/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ success: true });
});

export default router;
