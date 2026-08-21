import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import {
  sensorStreamsTable,
  sensorReadingsTable,
  treesTable,
  grovesTable,
} from "@workspace/db";
import { and, eq, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  ListSensorStreamsQueryParams,
  CreateSensorStreamBody,
  GetSensorStreamParams,
  UpdateSensorStreamParams,
  UpdateSensorStreamBody,
  DeleteSensorStreamParams,
  RotateSensorStreamTokenParams,
  ListSensorReadingsParams,
  IngestSensorReadingsParams,
  IngestSensorReadingsQueryParams,
  IngestSensorReadingsBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { resolvePrincipal, type Principal } from "../lib/auth";

// Local schema: the generated `ListSensorReadingsQueryParams` declares
// `from`/`to` as `zod.date()`, but Express delivers query strings — so we
// coerce strings to Date here.
const ListReadingsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

const router: IRouter = Router();

const SUPPORTED_KINDS: Array<{ kind: string; unit: string; description: string; valueShape: "numeric" | "event" }> = [
  { kind: "weather_station_rainfall_mm", unit: "mm", description: "Rainfall depth per sample interval", valueShape: "numeric" },
  { kind: "weather_station_temp_c", unit: "°C", description: "Air temperature", valueShape: "numeric" },
  { kind: "soil_moisture_pct", unit: "%", description: "Volumetric soil moisture", valueShape: "numeric" },
  { kind: "trap_count", unit: "count", description: "Insect trap catch count", valueShape: "numeric" },
  { kind: "dendrometer_um", unit: "µm", description: "Trunk circumference change", valueShape: "numeric" },
  { kind: "tree_camera_image_event", unit: "event", description: "Camera triggered an image capture", valueShape: "event" },
];

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Authentication required" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required" }); return null; }
  return principal;
}

async function attachedEntityLabel(
  type: string | null,
  id: number | null,
): Promise<string | null> {
  if (!type || id == null) return null;
  if (type === "tree") {
    const [t] = await db.select({ code: treesTable.treeCode }).from(treesTable).where(eq(treesTable.id, id)).limit(1);
    return t?.code ?? `Tree #${id}`;
  }
  if (type === "grove") {
    const [g] = await db.select({ name: grovesTable.name }).from(grovesTable).where(eq(grovesTable.id, id)).limit(1);
    return g?.name ?? `Grove #${id}`;
  }
  return null;
}

type StreamRow = typeof sensorStreamsTable.$inferSelect;

async function summarizeStream(s: StreamRow): Promise<Record<string, unknown>> {
  const [last] = await db
    .select({ observedAt: sensorReadingsTable.observedAt, valueNumeric: sensorReadingsTable.valueNumeric })
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.streamId, s.id))
    .orderBy(desc(sensorReadingsTable.observedAt))
    .limit(1);
  const label = await attachedEntityLabel(s.attachedEntityType, s.attachedEntityId);
  const staleAfterMs = s.sampleIntervalSeconds * 2 * 1000;
  const isStale = s.lastSeenAt
    ? Date.now() - new Date(s.lastSeenAt).getTime() > staleAfterMs
    : true;
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    attachedEntityType: s.attachedEntityType,
    attachedEntityId: s.attachedEntityId,
    attachedEntityLabel: label,
    unit: s.unit,
    sampleIntervalSeconds: s.sampleIntervalSeconds,
    source: s.source,
    status: s.status,
    calibrationJson: s.calibrationJson ?? null,
    lastSeenAt: s.lastSeenAt,
    lastValueNumeric: last?.valueNumeric ?? null,
    lastObservedAt: last?.observedAt ?? null,
    isStale,
    createdAt: s.createdAt,
  };
}

router.get("/sensors/kinds", async (_req, res) => {
  res.json(SUPPORTED_KINDS);
});

router.get("/sensors/streams", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const query = ListSensorStreamsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { kind, attachedEntityType, attachedEntityId } = query.data;
  const conditions: SQL[] = [];
  if (kind) conditions.push(eq(sensorStreamsTable.kind, kind));
  if (attachedEntityType) conditions.push(eq(sensorStreamsTable.attachedEntityType, attachedEntityType));
  if (attachedEntityId != null) conditions.push(eq(sensorStreamsTable.attachedEntityId, attachedEntityId));

  const rows = await db.select().from(sensorStreamsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sensorStreamsTable.createdAt))
    .limit(500);
  const summaries = await Promise.all(rows.map(summarizeStream));
  res.json(summaries);
});

router.post("/sensors/streams", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const body = CreateSensorStreamBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const known = SUPPORTED_KINDS.find((k) => k.kind === body.data.kind);
  if (!known) { res.status(400).json({ error: `Unknown sensor kind: ${body.data.kind}` }); return; }
  const token = newToken();
  const insert = {
    name: body.data.name ?? null,
    kind: body.data.kind,
    attachedEntityType: body.data.attachedEntityType ?? null,
    attachedEntityId: body.data.attachedEntityId ?? null,
    unit: body.data.unit,
    sampleIntervalSeconds: body.data.sampleIntervalSeconds,
    source: body.data.source ?? "manual",
    calibrationJson: body.data.calibrationJson ?? null,
    status: body.data.status ?? "active",
    apiTokenHash: hashToken(token),
  };
  const [created] = await db.insert(sensorStreamsTable).values(insert).returning();
  if (!created) { res.status(500).json({ error: "Insert failed" }); return; }
  req.log.info({ streamId: created.id, kind: created.kind }, "sensor stream created");
  const summary = await summarizeStream(created);
  res.status(201).json({ ...summary, apiToken: token });
});

router.get("/sensors/streams/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = GetSensorStreamParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(sensorStreamsTable).where(eq(sensorStreamsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await summarizeStream(row));
});

router.patch("/sensors/streams/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = UpdateSensorStreamParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateSensorStreamBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const updateValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.data)) {
    if (v !== undefined) updateValues[k] = v;
  }
  if (Object.keys(updateValues).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [updated] = await db.update(sensorStreamsTable).set(updateValues).where(eq(sensorStreamsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await summarizeStream(updated));
});

router.delete("/sensors/streams/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = DeleteSensorStreamParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(sensorReadingsTable).where(eq(sensorReadingsTable.streamId, params.data.id));
  const result = await db.delete(sensorStreamsTable).where(eq(sensorStreamsTable.id, params.data.id)).returning({ id: sensorStreamsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.post("/sensors/streams/:id/rotate-token", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = RotateSensorStreamTokenParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const token = newToken();
  const [updated] = await db.update(sensorStreamsTable)
    .set({ apiTokenHash: hashToken(token) })
    .where(eq(sensorStreamsTable.id, params.data.id))
    .returning({ id: sensorStreamsTable.id });
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  req.log.info({ streamId: updated.id }, "sensor stream token rotated");
  res.json({ streamId: updated.id, apiToken: token });
});

router.get("/sensors/streams/:id/readings", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = ListSensorReadingsParams.safeParse({ id: Number(req.params["id"]) });
  const query = ListReadingsQuery.safeParse(req.query);
  if (!params.success || !query.success) { res.status(400).json({ error: "Invalid request", details: !query.success ? query.error.issues : undefined }); return; }
  const { from, to, limit } = query.data;
  const conditions: SQL[] = [eq(sensorReadingsTable.streamId, params.data.id)];
  if (from) conditions.push(gte(sensorReadingsTable.observedAt, from));
  if (to) conditions.push(lte(sensorReadingsTable.observedAt, to));
  const rows = await db.select().from(sensorReadingsTable)
    .where(and(...conditions))
    .orderBy(desc(sensorReadingsTable.observedAt))
    .limit(limit);
  res.json(rows);
});

function extractToken(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m && m[1]) return m[1].trim();
  }
  const q = req.query["token"];
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

router.post("/sensors/streams/:id/readings", async (req, res) => {
  const params = IngestSensorReadingsParams.safeParse({ id: Number(req.params["id"]) });
  const queryParse = IngestSensorReadingsQueryParams.safeParse(req.query);
  if (!params.success || !queryParse.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Missing API token" }); return; }
  const [stream] = await db.select().from(sensorStreamsTable).where(eq(sensorStreamsTable.id, params.data.id));
  if (!stream) { res.status(404).json({ error: "Not found" }); return; }
  const expected = Buffer.from(stream.apiTokenHash);
  const provided = Buffer.from(hashToken(token));
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    res.status(401).json({ error: "Invalid API token" });
    return;
  }
  if (stream.status !== "active") { res.status(409).json({ error: `Stream is ${stream.status}` }); return; }

  const body = IngestSensorReadingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const readings = "readings" in body.data ? body.data.readings : [body.data];
  if (readings.length === 0) { res.status(400).json({ error: "No readings provided" }); return; }
  if (readings.length > 1000) { res.status(413).json({ error: "Batch too large (max 1000)" }); return; }

  const rows = readings.map((r) => ({
    streamId: stream.id,
    observedAt: r.observedAt,
    valueNumeric: r.valueNumeric ?? null,
    valueJson: r.valueJson ?? null,
    qualityFlag: r.qualityFlag ?? "ok",
  }));
  await db.insert(sensorReadingsTable).values(rows);
  const lastSeenAt = new Date();
  await db.update(sensorStreamsTable)
    .set({ lastSeenAt })
    .where(eq(sensorStreamsTable.id, stream.id));
  req.log.info({ streamId: stream.id, count: rows.length }, "sensor readings ingested");
  res.status(201).json({ inserted: rows.length, lastSeenAt });
});


export default router;
