import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { managerFlagsTable, managerFlagEventsTable, usersTable } from "@workspace/db";
import { eq, and, desc, type SQL } from "drizzle-orm";
import { alias as pgAlias } from "drizzle-orm/pg-core";
import {
  ListManagerFlagsQueryParams,
  CreateManagerFlagBody,
  UpdateManagerFlagParams,
  UpdateManagerFlagBody,
  ListManagerFlagEventsParams,
  GetManagerFlagParams,
  DeleteManagerFlagParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const creator = pgAlias(usersTable, "creator");
const assignee = pgAlias(usersTable, "assignee");
const actor = pgAlias(usersTable, "actor");

const flagSelect = {
  id: managerFlagsTable.id,
  entityType: managerFlagsTable.entityType,
  entityId: managerFlagsTable.entityId,
  flagType: managerFlagsTable.flagType,
  severity: managerFlagsTable.severity,
  status: managerFlagsTable.status,
  message: managerFlagsTable.message,
  createdByUserId: managerFlagsTable.createdByUserId,
  createdByName: creator.name,
  assignedToUserId: managerFlagsTable.assignedToUserId,
  assignedToName: assignee.name,
  resolvedByUserId: managerFlagsTable.resolvedByUserId,
  resolvedAt: managerFlagsTable.resolvedAt,
  resolutionNotes: managerFlagsTable.resolutionNotes,
  createdAt: managerFlagsTable.createdAt,
  updatedAt: managerFlagsTable.updatedAt,
} as const;

router.get("/manager-flags", async (req, res) => {
  const query = ListManagerFlagsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { status, entityType, entityId, severity, limit } = query.data;
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(managerFlagsTable.status, status));
  if (entityType) conditions.push(eq(managerFlagsTable.entityType, entityType));
  if (entityId) conditions.push(eq(managerFlagsTable.entityId, entityId));
  if (severity) conditions.push(eq(managerFlagsTable.severity, severity));
  const rows = await db
    .select(flagSelect)
    .from(managerFlagsTable)
    .leftJoin(creator, eq(creator.id, managerFlagsTable.createdByUserId))
    .leftJoin(assignee, eq(assignee.id, managerFlagsTable.assignedToUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(managerFlagsTable.createdAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/manager-flags", async (req, res) => {
  const body = CreateManagerFlagBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body", details: body.error.issues });
    return;
  }
  const [created] = await db
    .insert(managerFlagsTable)
    .values(body.data as typeof managerFlagsTable.$inferInsert)
    .returning();
  if (created) {
    await db.insert(managerFlagEventsTable).values({
      flagId: created.id,
      eventType: "created",
      toStatus: created.status,
      actorUserId: created.createdByUserId ?? null,
      note: created.message,
    });
  }
  req.log.info(
    { flagId: created?.id, entityType: created?.entityType, entityId: created?.entityId },
    "manager flag raised",
  );
  res.status(201).json(created);
});

router.get("/manager-flags/:id", async (req, res) => {
  const params = GetManagerFlagParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select(flagSelect)
    .from(managerFlagsTable)
    .leftJoin(creator, eq(creator.id, managerFlagsTable.createdByUserId))
    .leftJoin(assignee, eq(assignee.id, managerFlagsTable.assignedToUserId))
    .where(eq(managerFlagsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/manager-flags/:id", async (req, res) => {
  const params = DeleteManagerFlagParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db
    .delete(managerFlagsTable)
    .where(eq(managerFlagsTable.id, params.data.id))
    .returning({ id: managerFlagsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.patch("/manager-flags/:id", async (req, res) => {
  const params = UpdateManagerFlagParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateManagerFlagBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined });
    return;
  }
  const [existing] = await db
    .select()
    .from(managerFlagsTable)
    .where(eq(managerFlagsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { actorUserId, ...patch } = body.data;
  const updateData: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.status === "resolved") {
    updateData["resolvedAt"] = new Date();
  }
  const [updated] = await db
    .update(managerFlagsTable)
    .set(updateData)
    .where(eq(managerFlagsTable.id, params.data.id))
    .returning();
  if (updated && patch.status && patch.status !== existing.status) {
    await db.insert(managerFlagEventsTable).values({
      flagId: updated.id,
      eventType: "status_change",
      fromStatus: existing.status,
      toStatus: updated.status,
      actorUserId: actorUserId ?? updated.resolvedByUserId ?? null,
      note: patch.resolutionNotes ?? null,
    });
  }
  res.json(updated);
});

router.get("/manager-flags/:id/events", async (req, res) => {
  const params = ListManagerFlagEventsParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select({
      id: managerFlagEventsTable.id,
      flagId: managerFlagEventsTable.flagId,
      eventType: managerFlagEventsTable.eventType,
      fromStatus: managerFlagEventsTable.fromStatus,
      toStatus: managerFlagEventsTable.toStatus,
      actorUserId: managerFlagEventsTable.actorUserId,
      actorName: actor.name,
      note: managerFlagEventsTable.note,
      createdAt: managerFlagEventsTable.createdAt,
    })
    .from(managerFlagEventsTable)
    .leftJoin(actor, eq(actor.id, managerFlagEventsTable.actorUserId))
    .where(eq(managerFlagEventsTable.flagId, params.data.id))
    .orderBy(desc(managerFlagEventsTable.createdAt));
  res.json(rows);
});

export default router;
