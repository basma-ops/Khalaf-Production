import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { treeSatelliteObservationsTable, satelliteAlertsTable, imageryAcquisitionsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListSatelliteObservationsQueryParams,
  CreateSatelliteObservationBody,
  ListImageryAcquisitionsResponseItem,
  CreateImageryAcquisitionBody,
  ListSatelliteAlertsQueryParams,
  CreateSatelliteAlertBody,
  GetSatelliteAlertParams,
  UpdateSatelliteAlertParams,
  UpdateSatelliteAlertBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/satellite-observations", async (req, res) => {
  const query = ListSatelliteObservationsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { treeId, acquisitionId } = query.data;
  const conditions: SQL[] = [];
  if (treeId) conditions.push(eq(treeSatelliteObservationsTable.treeId, treeId));
  if (acquisitionId) conditions.push(eq(treeSatelliteObservationsTable.imageryAcquisitionId, acquisitionId));
  const obs = await db.select().from(treeSatelliteObservationsTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(obs);
});

router.post("/satellite-observations", async (req, res) => {
  const body = CreateSatelliteObservationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [obs] = await db.insert(treeSatelliteObservationsTable).values(body.data as any).returning();
  res.status(201).json(obs);
});

router.get("/imagery-acquisitions", async (_req, res) => {
  const imagery = await db.select().from(imageryAcquisitionsTable);
  res.json(imagery);
});

router.post("/imagery-acquisitions", async (req, res) => {
  const body = CreateImageryAcquisitionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [imagery] = await db.insert(imageryAcquisitionsTable).values(body.data as any).returning();
  res.status(201).json(imagery);
});

router.get("/satellite-alerts", async (req, res) => {
  const query = ListSatelliteAlertsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { groveId, treeId, severity, status, alertType } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(satelliteAlertsTable.groveId, groveId));
  if (treeId) conditions.push(eq(satelliteAlertsTable.treeId as any, treeId));
  if (severity) conditions.push(eq(satelliteAlertsTable.severity, severity));
  if (status) conditions.push(eq(satelliteAlertsTable.status, status));
  if (alertType) conditions.push(eq(satelliteAlertsTable.alertType, alertType));
  const alerts = await db.select().from(satelliteAlertsTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(alerts);
});

router.post("/satellite-alerts", async (req, res) => {
  const body = CreateSatelliteAlertBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [alert] = await db.insert(satelliteAlertsTable).values(body.data).returning();
  res.status(201).json(alert);
});

router.get("/satellite-alerts/:id", async (req, res) => {
  const params = GetSatelliteAlertParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [alert] = await db.select().from(satelliteAlertsTable).where(eq(satelliteAlertsTable.id, params.data.id));
  if (!alert) { res.status(404).json({ error: "Not found" }); return; }
  res.json(alert);
});

router.patch("/satellite-alerts/:id", async (req, res) => {
  const params = UpdateSatelliteAlertParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateSatelliteAlertBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const updateData: Record<string, unknown> = { ...body.data };
  if (body.data.status === "resolved") updateData["resolvedAt"] = new Date();
  const [updated] = await db.update(satelliteAlertsTable).set(updateData).where(eq(satelliteAlertsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
