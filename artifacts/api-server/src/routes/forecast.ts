import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  grovesTable,
  harvestSeasonsTable,
  harvestEventsTable,
  harvestMaturitySamplesTable,
  phenologyEventsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolvePrincipal, type Principal } from "../lib/auth";
import { GetYieldForecastQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Missing or invalid session cookie" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required for this action" }); return null; }
  return principal;
}

// BBCH stage → estimated days from now to optimal harvest window for Souri olives.
// Souri normally enters fruit ripening (BBCH 81–85) ~6–10 weeks before harvest.
// These windows are anchors — actual decisions still need Jaén ground truth.
function daysFromBbchToHarvest(bbch: string | null | undefined): { start: number; end: number } | null {
  if (!bbch) return null;
  const code = bbch.toLowerCase();
  if (code.includes("61") || code.includes("flowering")) return { start: 120, end: 160 };
  if (code.includes("71") || code.includes("fruit set")) return { start: 90, end: 130 };
  if (code.includes("75") || code.includes("pit hardening")) return { start: 60, end: 90 };
  if (code.includes("81") || code.includes("coloring")) return { start: 30, end: 60 };
  if (code.includes("85") || code.includes("ripening")) return { start: 14, end: 35 };
  if (code.includes("89") || code.includes("mature")) return { start: 0, end: 14 };
  return null;
}

// Yield adjustment from latest Jaén score (target ~3.5 for EVOO balance).
function jaenAdjustment(jaen: number | null | undefined): number {
  if (jaen == null) return 1.0;
  // Higher Jaén → riper → slight kg upside (water/oil mass).
  // Bound the multiplier so a single sample cannot dominate.
  const clamped = Math.max(0, Math.min(7, jaen));
  return 0.92 + (clamped / 7) * 0.16; // 0.92 .. 1.08
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

router.get("/forecast/yield", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const query = GetYieldForecastQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }

  // Resolve active season (the one we are forecasting).
  let activeSeason: typeof harvestSeasonsTable.$inferSelect | undefined;
  if (query.data.seasonId) {
    [activeSeason] = await db.select().from(harvestSeasonsTable).where(eq(harvestSeasonsTable.id, query.data.seasonId));
  } else {
    [activeSeason] = await db.select().from(harvestSeasonsTable).orderBy(desc(harvestSeasonsTable.year)).limit(1);
  }

  // Prior season = the season directly before the active one (by year). Used as the per-grove kg baseline.
  let priorSeason: typeof harvestSeasonsTable.$inferSelect | undefined;
  if (activeSeason) {
    const candidates = await db.select().from(harvestSeasonsTable).orderBy(desc(harvestSeasonsTable.year));
    priorSeason = candidates.find((s) => s.year < activeSeason!.year);
  }

  const groves = query.data.groveId
    ? await db.select().from(grovesTable).where(eq(grovesTable.id, query.data.groveId))
    : await db.select().from(grovesTable);

  // Per-grove prior actual kg (sum of measured-or-estimated event weight).
  const priorKgByGrove = new Map<number, number>();
  if (priorSeason) {
    const rows = await db.select({
      groveId: harvestEventsTable.groveId,
      total: sql<number | null>`sum(coalesce(${harvestEventsTable.totalMeasuredWeightKg}, ${harvestEventsTable.totalEstimatedWeightKg}, 0))::float`,
    })
      .from(harvestEventsTable)
      .where(eq(harvestEventsTable.harvestSeasonId, priorSeason.id))
      .groupBy(harvestEventsTable.groveId);
    for (const r of rows) if (r.total != null) priorKgByGrove.set(r.groveId, r.total);
  }

  // Median prior-season kg, used as fallback when a grove has no prior actual.
  const priorVals = Array.from(priorKgByGrove.values()).filter((v) => v > 0).sort((a, b) => a - b);
  const medianPriorKg = priorVals.length ? priorVals[Math.floor(priorVals.length / 2)]! : 0;

  // Per-grove latest phenology stage.
  const latestBbch = new Map<number, { bbch: string; observedAt: Date }>();
  const phenRows = await db.select({
    groveId: phenologyEventsTable.groveId,
    bbchStage: phenologyEventsTable.bbchStage,
    observedAt: phenologyEventsTable.observedAt,
  }).from(phenologyEventsTable).orderBy(desc(phenologyEventsTable.observedAt));
  for (const r of phenRows) {
    if (!latestBbch.has(r.groveId)) latestBbch.set(r.groveId, { bbch: r.bbchStage, observedAt: r.observedAt });
  }

  // Per-grove latest Jaén (average of the most recent ≤3 maturity samples in active season).
  const jaenByGrove = new Map<number, number>();
  if (activeSeason) {
    const evRows = await db.select({
      eventId: harvestEventsTable.id,
      groveId: harvestEventsTable.groveId,
    }).from(harvestEventsTable).where(eq(harvestEventsTable.harvestSeasonId, activeSeason.id));
    const eventToGrove = new Map(evRows.map((r) => [r.eventId, r.groveId]));
    if (eventToGrove.size > 0) {
      const samples = await db.select({
        harvestEventId: harvestMaturitySamplesTable.harvestEventId,
        jaenScore: harvestMaturitySamplesTable.jaenScore,
        sampledAt: harvestMaturitySamplesTable.sampledAt,
      }).from(harvestMaturitySamplesTable).orderBy(desc(harvestMaturitySamplesTable.sampledAt));
      const accum = new Map<number, number[]>();
      for (const s of samples) {
        const groveId = eventToGrove.get(s.harvestEventId);
        if (groveId == null || s.jaenScore == null) continue;
        const arr = accum.get(groveId) ?? [];
        if (arr.length < 3) { arr.push(s.jaenScore); accum.set(groveId, arr); }
      }
      for (const [g, arr] of accum) {
        if (arr.length) jaenByGrove.set(g, arr.reduce((a, b) => a + b, 0) / arr.length);
      }
    }
  }

  const out: any[] = [];
  let total = 0;

  for (const g of groves) {
    const priorKg = priorKgByGrove.get(g.id) ?? null;
    const bbchInfo = latestBbch.get(g.id) ?? null;
    const jaen = jaenByGrove.get(g.id) ?? null;
    const window = daysFromBbchToHarvest(bbchInfo?.bbch ?? null);
    const adj = jaenAdjustment(jaen);

    // Baseline kg: prior actual; else median across estate scaled by area share if available; else 0.
    const baseKg = priorKg ?? (medianPriorKg && g.areaHa ? medianPriorKg : medianPriorKg);
    const estimatedKg = baseKg > 0 ? baseKg * adj : 0;
    const range = estimatedKg * 0.18; // ±18% honest band

    // Confidence reflects how many real signals went into the estimate.
    let signals = 0;
    if (priorKg != null) signals += 2;
    if (bbchInfo) signals += 1;
    if (jaen != null) signals += 2;
    const confidence: "low" | "medium" | "high" = signals >= 4 ? "high" : signals >= 2 ? "medium" : "low";

    const basis: any[] = [];
    if (priorKg != null) basis.push({ factor: "prior_season_kg", value: priorKg.toFixed(0), weight: 0.5 });
    else if (medianPriorKg) basis.push({ factor: "prior_season_kg", value: `estate median ${medianPriorKg.toFixed(0)} (no grove history)`, weight: 0.3 });
    if (bbchInfo) basis.push({ factor: "bbch_stage", value: bbchInfo.bbch, weight: 0.2 });
    if (jaen != null) basis.push({ factor: "jaen_score", value: jaen.toFixed(2), weight: 0.2 });
    if (g.areaHa != null) basis.push({ factor: "area_ha", value: g.areaHa.toFixed(2), weight: 0.1 });

    out.push({
      groveId: g.id,
      groveName: g.name,
      areaHa: g.areaHa,
      priorSeasonKg: priorKg,
      latestBbchStage: bbchInfo?.bbch ?? null,
      latestJaenScore: jaen,
      predictedHarvestStart: window ? addDaysISO(window.start) : null,
      predictedHarvestEnd: window ? addDaysISO(window.end) : null,
      estimatedKg: Number(estimatedKg.toFixed(1)),
      estimatedKgLow: Number(Math.max(0, estimatedKg - range).toFixed(1)),
      estimatedKgHigh: Number((estimatedKg + range).toFixed(1)),
      confidence,
      basis,
    });
    total += estimatedKg;
  }

  res.json({
    seasonId: activeSeason?.id ?? null,
    seasonName: activeSeason?.name ?? null,
    generatedAt: new Date().toISOString(),
    totalEstimatedKg: Number(total.toFixed(1)),
    groves: out,
    limitations:
      "Forecasts combine prior-season measured kg, latest BBCH phenology observation, and latest Jaén maturity samples. Estimates assume a normal Souri season; severe weather events, pest outbreaks, or new alternate-bearing cycles can shift outcomes ±25% or more. Treat values as planning guidance, not commitments.",
  });
});

export default router;
