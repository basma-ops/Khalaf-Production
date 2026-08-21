import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resolvePrincipal, requireAuthenticated, type Principal } from "../lib/auth";
import { treeGeometryRecordsTable, usersTable, grovesTable, treesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  ListTreeGeometryRecordsQueryParams,
  CreateTreeGeometryRecordBody,
  GetTreeGeometryRecordParams,
  UpdateTreeGeometryRecordParams,
  UpdateTreeGeometryRecordBody,
  DeleteTreeGeometryRecordParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Missing or invalid session cookie" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required for this action" }); return null; }
  return principal;
}

const selectShape = {
  id: treeGeometryRecordsTable.id,
  treeId: treeGeometryRecordsTable.treeId,
  treeCode: treesTable.treeCode,
  groveId: treesTable.groveId,
  groveName: grovesTable.name,
  workerId: treeGeometryRecordsTable.workerId,
  workerName: usersTable.name,
  observedAt: treeGeometryRecordsTable.observedAt,
  trunkDiameterMm: treeGeometryRecordsTable.trunkDiameterMm,
  canopyDiameterM: treeGeometryRecordsTable.canopyDiameterM,
  treeHeightM: treeGeometryRecordsTable.treeHeightM,
  observedCrownAreaM2: treeGeometryRecordsTable.observedCrownAreaM2,
  photoIds: treeGeometryRecordsTable.photoIds,
  notes: treeGeometryRecordsTable.notes,
  createdAt: treeGeometryRecordsTable.createdAt,
} as const;

router.get("/tree-geometry-records", async (req, res) => {
  const query = ListTreeGeometryRecordsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { treeId, groveId, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (treeId) conditions.push(eq(treeGeometryRecordsTable.treeId, treeId));
  if (groveId) conditions.push(eq(treesTable.groveId, groveId));
  if (fromDate) conditions.push(gte(treeGeometryRecordsTable.observedAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(treeGeometryRecordsTable.observedAt, end));
  }
  const rows = await db.select(selectShape).from(treeGeometryRecordsTable)
    .leftJoin(usersTable, eq(usersTable.id, treeGeometryRecordsTable.workerId))
    .leftJoin(treesTable, eq(treesTable.id, treeGeometryRecordsTable.treeId))
    .leftJoin(grovesTable, eq(grovesTable.id, treesTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(treeGeometryRecordsTable.observedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/tree-geometry-records", async (req, res) => {
  // Field workers and managers may both record measurements.
  if (!(await requireAuthenticated(req, res))) return;
  const body = CreateTreeGeometryRecordBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { observedAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(observedAt ? { observedAt: new Date(observedAt) } : {}) };
  const [created] = await db.insert(treeGeometryRecordsTable).values(insertValues as typeof treeGeometryRecordsTable.$inferInsert).returning();
  req.log.info({ recordId: created?.id, treeId: created?.treeId }, "tree geometry record created");
  res.status(201).json(created);
});

router.patch("/tree-geometry-records/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = UpdateTreeGeometryRecordParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTreeGeometryRecordBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { observedAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (observedAt) updateValues["observedAt"] = new Date(observedAt);
  const [updated] = await db.update(treeGeometryRecordsTable).set(updateValues).where(eq(treeGeometryRecordsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/tree-geometry-records/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = DeleteTreeGeometryRecordParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(treeGeometryRecordsTable).where(eq(treeGeometryRecordsTable.id, params.data.id)).returning({ id: treeGeometryRecordsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/tree-geometry-records/:id", async (req, res) => {
  const params = GetTreeGeometryRecordParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(treeGeometryRecordsTable)
    .leftJoin(usersTable, eq(usersTable.id, treeGeometryRecordsTable.workerId))
    .leftJoin(treesTable, eq(treesTable.id, treeGeometryRecordsTable.treeId))
    .leftJoin(grovesTable, eq(grovesTable.id, treesTable.groveId))
    .where(eq(treeGeometryRecordsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
