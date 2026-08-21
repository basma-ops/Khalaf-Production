import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resolvePrincipal, type Principal } from "../lib/auth";
import { soilTestsTable, grovesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  ListSoilTestsQueryParams,
  CreateSoilTestBody,
  GetSoilTestParams,
  UpdateSoilTestParams,
  UpdateSoilTestBody,
  DeleteSoilTestParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Missing or invalid session cookie" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required for this action" }); return null; }
  return principal;
}

const selectShape = {
  id: soilTestsTable.id,
  groveId: soilTestsTable.groveId,
  groveName: grovesTable.name,
  sampledAt: soilTestsTable.sampledAt,
  ph: soilTestsTable.ph,
  ec: soilTestsTable.ec,
  organicMatterPct: soilTestsTable.organicMatterPct,
  nitrogenPpm: soilTestsTable.nitrogenPpm,
  phosphorusPpm: soilTestsTable.phosphorusPpm,
  potassiumPpm: soilTestsTable.potassiumPpm,
  labName: soilTestsTable.labName,
  reportPhotoId: soilTestsTable.reportPhotoId,
  notes: soilTestsTable.notes,
  createdAt: soilTestsTable.createdAt,
} as const;

router.get("/soil-tests", async (req, res) => {
  const query = ListSoilTestsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(soilTestsTable.groveId, groveId));
  if (fromDate) conditions.push(gte(soilTestsTable.sampledAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(soilTestsTable.sampledAt, end));
  }
  const rows = await db.select(selectShape).from(soilTestsTable)
    .leftJoin(grovesTable, eq(grovesTable.id, soilTestsTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(soilTestsTable.sampledAt))
    .limit(limit ?? 200);
  res.json(rows);
});

router.post("/soil-tests", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const body = CreateSoilTestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { sampledAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(sampledAt ? { sampledAt: new Date(sampledAt) } : {}) };
  const [created] = await db.insert(soilTestsTable).values(insertValues as typeof soilTestsTable.$inferInsert).returning();
  req.log.info({ soilTestId: created?.id, groveId: created?.groveId }, "soil test created");
  res.status(201).json(created);
});

router.patch("/soil-tests/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = UpdateSoilTestParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateSoilTestBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { sampledAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (sampledAt) updateValues["sampledAt"] = new Date(sampledAt);
  const [updated] = await db.update(soilTestsTable).set(updateValues).where(eq(soilTestsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/soil-tests/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = DeleteSoilTestParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(soilTestsTable).where(eq(soilTestsTable.id, params.data.id)).returning({ id: soilTestsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/soil-tests/:id", async (req, res) => {
  const params = GetSoilTestParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(soilTestsTable)
    .leftJoin(grovesTable, eq(grovesTable.id, soilTestsTable.groveId))
    .where(eq(soilTestsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
