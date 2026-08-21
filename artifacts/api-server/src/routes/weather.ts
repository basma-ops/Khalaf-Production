import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resolvePrincipal, requireAuthenticated, type Principal } from "../lib/auth";
import { weatherLogTable, usersTable, grovesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  ListWeatherLogQueryParams,
  CreateWeatherLogBody,
  GetWeatherLogParams,
  UpdateWeatherLogParams,
  UpdateWeatherLogBody,
  DeleteWeatherLogParams,
  GetWeatherSummaryQueryParams,
  GetLiveWeatherQueryParams,
} from "@workspace/api-zod";
import { fetchLiveWeather } from "../lib/open-meteo";

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Missing or invalid session cookie" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required for this action" }); return null; }
  return principal;
}

const selectShape = {
  id: weatherLogTable.id,
  groveId: weatherLogTable.groveId,
  groveName: grovesTable.name,
  observedDate: weatherLogTable.observedDate,
  rainfallMm: weatherLogTable.rainfallMm,
  tempMinC: weatherLogTable.tempMinC,
  tempMaxC: weatherLogTable.tempMaxC,
  humidityAvgPct: weatherLogTable.humidityAvgPct,
  leafWetnessHours: weatherLogTable.leafWetnessHours,
  source: weatherLogTable.source,
  workerId: weatherLogTable.workerId,
  workerName: usersTable.name,
  notes: weatherLogTable.notes,
  createdAt: weatherLogTable.createdAt,
} as const;

router.get("/weather-log", async (req, res) => {
  const query = ListWeatherLogQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(weatherLogTable.groveId, groveId));
  if (fromDate) conditions.push(gte(weatherLogTable.observedDate, fromDate));
  if (toDate) conditions.push(lte(weatherLogTable.observedDate, toDate));
  const rows = await db.select(selectShape).from(weatherLogTable)
    .leftJoin(usersTable, eq(usersTable.id, weatherLogTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, weatherLogTable.groveId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(weatherLogTable.observedDate))
    .limit(limit ?? 365);
  res.json(rows);
});

router.get("/weather/summary", async (req, res) => {
  const query = GetWeatherSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, year } = query.data;
  const targetYear = year ?? new Date().getFullYear();
  const yearStart = `${targetYear}-01-01`;
  const yearEnd = `${targetYear}-12-31`;
  const [agg] = await db.select({
    entryCount: sql<number>`count(*)::int`,
    cumulativeRainfallMm: sql<number | null>`sum(${weatherLogTable.rainfallMm})::float`,
    avgTempMinC: sql<number | null>`avg(${weatherLogTable.tempMinC})::float`,
    avgTempMaxC: sql<number | null>`avg(${weatherLogTable.tempMaxC})::float`,
    avgHumidityPct: sql<number | null>`avg(${weatherLogTable.humidityAvgPct})::float`,
    totalLeafWetnessHours: sql<number | null>`sum(${weatherLogTable.leafWetnessHours})::float`,
    firstObservedDate: sql<string | null>`min(${weatherLogTable.observedDate})::text`,
    lastObservedDate: sql<string | null>`max(${weatherLogTable.observedDate})::text`,
  }).from(weatherLogTable).where(and(
    eq(weatherLogTable.groveId, groveId),
    gte(weatherLogTable.observedDate, yearStart),
    lte(weatherLogTable.observedDate, yearEnd),
  ));

  // Long-term average rainfall: total rainfall across all prior years / number of distinct prior years.
  const [lt] = await db.select({
    totalRainfall: sql<number | null>`sum(${weatherLogTable.rainfallMm})::float`,
    yearCount: sql<number>`count(distinct extract(year from ${weatherLogTable.observedDate}))::int`,
  }).from(weatherLogTable).where(and(
    eq(weatherLogTable.groveId, groveId),
    lte(weatherLogTable.observedDate, `${targetYear - 1}-12-31`),
  ));
  const longTermYears = lt?.yearCount ?? 0;
  const longTermAvgRainfallMm = longTermYears > 0 && lt?.totalRainfall != null
    ? lt.totalRainfall / longTermYears
    : null;

  // Daily series for current year, ordered by date.
  const dayRows = await db.select({
    date: sql<string>`${weatherLogTable.observedDate}::text`,
    rainfallMm: weatherLogTable.rainfallMm,
  }).from(weatherLogTable).where(and(
    eq(weatherLogTable.groveId, groveId),
    gte(weatherLogTable.observedDate, yearStart),
    lte(weatherLogTable.observedDate, yearEnd),
  )).orderBy(weatherLogTable.observedDate);

  let cumulative = 0;
  let firstRainDate: string | null = null;
  const dailyCumulative = dayRows.map((r) => {
    const rain = r.rainfallMm ?? 0;
    cumulative += rain;
    if (firstRainDate == null && rain > 0) firstRainDate = r.date;
    return { date: r.date, cumulativeMm: cumulative };
  });

  // Long-term daily cumulative — average rainfall per day-of-year across prior years,
  // running-summed and sampled on the same dates as the current year's series.
  let longTermDailyCumulative: { date: string; cumulativeMm: number }[] = [];
  if (longTermYears > 0 && dailyCumulative.length > 0) {
    const priorRows = await db.select({
      doy: sql<number>`extract(doy from ${weatherLogTable.observedDate})::int`,
      avgRain: sql<number>`avg(coalesce(${weatherLogTable.rainfallMm}, 0))::float`,
    }).from(weatherLogTable).where(and(
      eq(weatherLogTable.groveId, groveId),
      lte(weatherLogTable.observedDate, `${targetYear - 1}-12-31`),
    )).groupBy(sql`extract(doy from ${weatherLogTable.observedDate})`);
    const avgByDoy = new Map<number, number>();
    for (const r of priorRows) avgByDoy.set(r.doy, r.avgRain);
    let runSum = 0;
    longTermDailyCumulative = dailyCumulative.map((d) => {
      const date = new Date(`${d.date}T00:00:00Z`);
      const start = Date.UTC(date.getUTCFullYear(), 0, 1);
      const doy = Math.floor((date.getTime() - start) / 86400000) + 1;
      runSum += avgByDoy.get(doy) ?? 0;
      return { date: d.date, cumulativeMm: runSum };
    });
  }

  res.json({
    groveId,
    year: targetYear,
    entryCount: agg?.entryCount ?? 0,
    cumulativeRainfallMm: agg?.cumulativeRainfallMm ?? null,
    avgTempMinC: agg?.avgTempMinC ?? null,
    avgTempMaxC: agg?.avgTempMaxC ?? null,
    avgHumidityPct: agg?.avgHumidityPct ?? null,
    totalLeafWetnessHours: agg?.totalLeafWetnessHours ?? null,
    longTermAvgRainfallMm,
    longTermYears,
    firstObservedDate: agg?.firstObservedDate ?? null,
    lastObservedDate: agg?.lastObservedDate ?? null,
    firstRainDate,
    dailyCumulative,
    longTermDailyCumulative,
  });
});

router.get("/weather/live", async (req, res) => {
  const query = GetLiveWeatherQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId } = query.data;
  const [grove] = await db.select().from(grovesTable).where(eq(grovesTable.id, groveId));
  if (!grove) { res.status(404).json({ error: "Grove not found" }); return; }
  if (grove.centroidLat == null || grove.centroidLon == null) {
    res.status(404).json({ error: "Grove has no centroid coordinates" }); return;
  }
  try {
    const w = await fetchLiveWeather(grove.centroidLat, grove.centroidLon);
    res.json({
      groveId: grove.id,
      groveName: grove.name,
      lat: grove.centroidLat,
      lon: grove.centroidLon,
      source: w.source,
      fetchedAt: w.fetchedAt,
      cacheExpiresAt: w.cacheExpiresAt,
      current: w.current,
      forecast: w.forecast,
    });
  } catch (err) {
    req.log.warn({ err: (err as Error).message, groveId }, "live weather fetch failed");
    res.status(502).json({ error: "Live weather provider unavailable" });
  }
});

router.post("/weather-log", async (req, res) => {
  // Field workers and managers may both log weather observations.
  if (!(await requireAuthenticated(req, res))) return;
  const body = CreateWeatherLogBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  try {
    const [created] = await db.insert(weatherLogTable)
      .values(body.data as typeof weatherLogTable.$inferInsert).returning();
    req.log.info({ weatherId: created?.id, groveId: created?.groveId, date: created?.observedDate }, "weather log entry created");
    res.status(201).json(created);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "23505") {
      res.status(409).json({ error: "An entry already exists for this grove and date" });
      return;
    }
    throw err;
  }
});

router.patch("/weather-log/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = UpdateWeatherLogParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateWeatherLogBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const updateValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.data)) {
    if (v !== undefined) updateValues[k] = v;
  }
  const [updated] = await db.update(weatherLogTable).set(updateValues).where(eq(weatherLogTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/weather-log/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = DeleteWeatherLogParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(weatherLogTable).where(eq(weatherLogTable.id, params.data.id)).returning({ id: weatherLogTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/weather-log/:id", async (req, res) => {
  const params = GetWeatherLogParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(weatherLogTable)
    .leftJoin(usersTable, eq(usersTable.id, weatherLogTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, weatherLogTable.groveId))
    .where(eq(weatherLogTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
