import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  weatherLogTable,
  phenologyEventsTable,
  trapCountsTable,
  pestDiseaseFindsTable,
  treatmentsTable,
  activitiesTable,
  harvestSeasonsTable,
  harvestEventsTable,
  harvestMaturitySamplesTable,
  harvestBatchesTable,
  pressingRunsTable,
  oilBatchesTable,
  labResultsTable,
  bottlingRunsTable,
  heritageRulesTable,
  ruleEvidenceTable,
  grovesTable,
  usersTable,
} from "@workspace/db";
import { and, eq, gte, lt, lte, inArray, asc } from "drizzle-orm";
import { GetYearReportParams } from "@workspace/api-zod";
import { z } from "zod";
import { resolvePrincipal, type Principal } from "../lib/auth";

const ComplianceQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  groveId: z.coerce.number().int().positive().optional(),
  product: z.string().min(1).optional(),
  activeIngredient: z.string().min(1).optional(),
});

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Authentication required" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required" }); return null; }
  return principal;
}

router.get("/reports/year/:year", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const params = GetYearReportParams.safeParse({ year: Number(req.params["year"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid year" }); return; }
  const { year } = params.data;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearStartTs = new Date(`${year}-01-01T00:00:00Z`);
  const yearEndTs = new Date(`${year + 1}-01-01T00:00:00Z`);
  const priorStartTs = new Date(`${year - 1}-01-01T00:00:00Z`);

  const rainRows = await db.select().from(weatherLogTable);
  const monthlyCurrent = Array(12).fill(0) as number[];
  const monthlyOtherSum = Array(12).fill(0) as number[];
  const monthlyOtherYears = Array.from({ length: 12 }, () => new Set<number>());
  for (const r of rainRows) {
    if (r.rainfallMm == null) continue;
    const d = new Date(r.observedDate);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (y === year) {
      monthlyCurrent[m]! += r.rainfallMm;
    } else {
      monthlyOtherSum[m]! += r.rainfallMm;
      monthlyOtherYears[m]!.add(y);
    }
  }
  const rainfall = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    currentMm: Number(monthlyCurrent[i]!.toFixed(2)),
    longTermAvgMm: monthlyOtherYears[i]!.size > 0
      ? Number((monthlyOtherSum[i]! / monthlyOtherYears[i]!.size).toFixed(2))
      : null,
  }));

  const phenRows = await db
    .select()
    .from(phenologyEventsTable)
    .where(and(gte(phenologyEventsTable.observedAt, priorStartTs), lt(phenologyEventsTable.observedAt, yearEndTs)));
  const phenThis = new Map<string, Date>();
  const phenPrior = new Map<string, Date>();
  for (const p of phenRows) {
    const obs = p.observedAt;
    const target = obs >= yearStartTs ? phenThis : phenPrior;
    const cur = target.get(p.bbchStage);
    if (!cur || obs < cur) target.set(p.bbchStage, obs);
  }
  const stages = new Set([...phenThis.keys(), ...phenPrior.keys()]);
  const phenologyShifts = Array.from(stages).sort().map((bbchStage) => {
    const t = phenThis.get(bbchStage) ?? null;
    const p = phenPrior.get(bbchStage) ?? null;
    let shiftDays: number | null = null;
    if (t && p) {
      const tDoy = Math.floor((Date.UTC(year, t.getUTCMonth(), t.getUTCDate()) - Date.UTC(year, 0, 1)) / 86400000);
      const pDoy = Math.floor((Date.UTC(year - 1, p.getUTCMonth(), p.getUTCDate()) - Date.UTC(year - 1, 0, 1)) / 86400000);
      shiftDays = tDoy - pDoy;
    }
    return {
      bbchStage,
      thisYearFirstObserved: t ? t.toISOString().slice(0, 10) : null,
      priorYearFirstObserved: p ? p.toISOString().slice(0, 10) : null,
      shiftDays,
    };
  });

  const trapRows = await db
    .select()
    .from(trapCountsTable)
    .where(and(gte(trapCountsTable.countDate, yearStartTs), lt(trapCountsTable.countDate, yearEndTs)));
  const findRows = await db
    .select()
    .from(pestDiseaseFindsTable)
    .where(and(gte(pestDiseaseFindsTable.observedAt, yearStartTs), lt(pestDiseaseFindsTable.observedAt, yearEndTs)));
  const trapMonthly = Array(12).fill(0) as number[];
  const findMonthly = Array(12).fill(0) as number[];
  for (const t of trapRows) trapMonthly[t.countDate.getUTCMonth()]! += t.count;
  for (const f of findRows) findMonthly[f.observedAt.getUTCMonth()]! += 1;
  const pestPressure = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    trapCount: trapMonthly[i]!,
    scoutingFinds: findMonthly[i]!,
  }));

  const tx = await db
    .select()
    .from(treatmentsTable)
    .where(and(gte(treatmentsTable.appliedAt, yearStartTs), lt(treatmentsTable.appliedAt, yearEndTs)));
  const txByKind = new Map<string, number>();
  for (const t of tx) txByKind.set(t.treatmentKind, (txByKind.get(t.treatmentKind) ?? 0) + 1);

  const acts = await db
    .select()
    .from(activitiesTable)
    .where(and(gte(activitiesTable.performedAt, yearStartTs), lt(activitiesTable.performedAt, yearEndTs)));
  const actAgg = new Map<string, { count: number; duration: number }>();
  let pruningCount = 0;
  for (const a of acts) {
    const cur = actAgg.get(a.activityType) ?? { count: 0, duration: 0 };
    cur.count += 1;
    cur.duration += a.durationMinutes ?? 0;
    actAgg.set(a.activityType, cur);
    if (a.activityType === "pruning") pruningCount += 1;
  }
  const activityTotals = Array.from(actAgg.entries())
    .map(([activityType, v]) => ({
      activityType,
      count: v.count,
      totalDurationMinutes: v.duration > 0 ? v.duration : null,
    }))
    .sort((a, b) => b.count - a.count);

  const seasons = await db.select().from(harvestSeasonsTable).where(eq(harvestSeasonsTable.year, year));
  const season = seasons[0] ?? null;
  let harvestSummary = { seasonId: null as number | null, seasonName: null as string | null, totalKg: 0, meanJaen: null as number | null, meanPressingDelayHours: null as number | null };
  if (season) {
    const events = await db.select().from(harvestEventsTable).where(eq(harvestEventsTable.harvestSeasonId, season.id));
    let kg = 0;
    for (const e of events) kg += e.totalMeasuredWeightKg ?? e.totalEstimatedWeightKg ?? 0;
    const eventIds = events.map((e) => e.id);
    let jaenSum = 0; let jaenN = 0;
    if (eventIds.length) {
      const samples = await db
        .select({ jaenScore: harvestMaturitySamplesTable.jaenScore })
        .from(harvestMaturitySamplesTable)
        .where(inArray(harvestMaturitySamplesTable.harvestEventId, eventIds));
      for (const s of samples) {
        if (s.jaenScore != null) { jaenSum += s.jaenScore; jaenN += 1; }
      }
    }
    const batches = await db.select().from(harvestBatchesTable).where(eq(harvestBatchesTable.harvestSeasonId, season.id));
    const batchIds = batches.map((b) => b.id);
    let delaySum = 0; let delayN = 0;
    if (batchIds.length) {
      const runs = await db.select().from(pressingRunsTable).where(inArray(pressingRunsTable.harvestBatchId, batchIds));
      for (const r of runs) if (r.pressingDelayHours != null) { delaySum += r.pressingDelayHours; delayN += 1; }
    }
    harvestSummary = {
      seasonId: season.id,
      seasonName: season.name,
      totalKg: Number(kg.toFixed(2)),
      meanJaen: jaenN > 0 ? Number((jaenSum / jaenN).toFixed(2)) : null,
      meanPressingDelayHours: delayN > 0 ? Number((delaySum / delayN).toFixed(2)) : null,
    };
  }

  const labs = season
    ? await db.select().from(labResultsTable).where(eq(labResultsTable.harvestSeasonId, season.id))
    : [];
  const oilBatchIds = labs.map((l) => l.oilBatchId).filter((v): v is number => v != null);
  const oilBatches = oilBatchIds.length
    ? await db.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, oilBatchIds))
    : [];
  const oilBatchById = new Map(oilBatches.map((b) => [b.id, b]));
  function highlight(l: typeof labs[number]) {
    return {
      labResultId: l.id,
      oilBatchCode: l.oilBatchId ? oilBatchById.get(l.oilBatchId)?.oilBatchCode ?? null : null,
      sampleDate: l.sampleDate,
      acidity: l.acidity,
      peroxideValue: l.peroxideValue,
      totalPolyphenolsMgKg: l.totalPolyphenolsMgKg,
    };
  }
  const acidLabs = labs.filter((l) => l.acidity != null).sort((a, b) => (a.acidity! - b.acidity!));
  const polyLabs = labs.filter((l) => l.totalPolyphenolsMgKg != null).sort((a, b) => (b.totalPolyphenolsMgKg! - a.totalPolyphenolsMgKg!));
  const oilQuality = {
    bestAcidity: acidLabs[0] ? highlight(acidLabs[0]) : null,
    worstAcidity: acidLabs[acidLabs.length - 1] ? highlight(acidLabs[acidLabs.length - 1]!) : null,
    highestPolyphenols: polyLabs[0] ? highlight(polyLabs[0]) : null,
  };

  const allRuns = await db
    .select()
    .from(bottlingRunsTable)
    .where(and(gte(bottlingRunsTable.bottledAt, yearStart), lte(bottlingRunsTable.bottledAt, yearEnd)));
  let totalLiters = 0;
  const fmtAgg = new Map<string | null, { bottles: number; liters: number }>();
  for (const r of allRuns) {
    totalLiters += r.totalLitersBottled ?? 0;
    const k = r.format ?? null;
    const cur = fmtAgg.get(k) ?? { bottles: 0, liters: 0 };
    cur.bottles += r.bottlesProduced ?? 0;
    cur.liters += r.totalLitersBottled ?? 0;
    fmtAgg.set(k, cur);
  }
  const bottling = {
    runs: allRuns.length,
    totalLitersBottled: Number(totalLiters.toFixed(2)),
    formats: Array.from(fmtAgg.entries()).map(([format, v]) => ({
      format,
      bottles: v.bottles,
      liters: Number(v.liters.toFixed(2)),
    })),
  };

  const rules = await db.select().from(heritageRulesTable);
  const evRows = await db
    .select({ heritageRuleId: ruleEvidenceTable.heritageRuleId, createdAt: ruleEvidenceTable.createdAt })
    .from(ruleEvidenceTable)
    .where(and(gte(ruleEvidenceTable.createdAt, priorStartTs), lt(ruleEvidenceTable.createdAt, yearEndTs)));
  const ruleThis = new Map<number, number>();
  const rulePrior = new Map<number, number>();
  for (const r of evRows) {
    const map = r.createdAt >= yearStartTs ? ruleThis : rulePrior;
    map.set(r.heritageRuleId, (map.get(r.heritageRuleId) ?? 0) + 1);
  }
  const heritage = rules.map((r) => {
    const t = ruleThis.get(r.id) ?? 0;
    const p = rulePrior.get(r.id) ?? 0;
    return {
      heritageRuleId: r.id,
      ruleCode: r.ruleCode,
      ruleName: r.name,
      status: r.status,
      evidenceCountThisYear: t,
      evidenceCountPriorYear: p,
      deltaCount: t - p,
    };
  });

  res.json({
    year,
    rainfall,
    phenologyShifts,
    pestPressure,
    treatments: {
      count: tx.length,
      byKind: Array.from(txByKind.entries()).map(([treatmentKind, count]) => ({ treatmentKind, count })).sort((a, b) => b.count - a.count),
    },
    activityTotals,
    pruningCount,
    harvest: harvestSummary,
    oilQuality,
    bottling,
    heritage,
  });
});

async function loadComplianceRows(q: {
  from?: Date; to?: Date; groveId?: number; product?: string; activeIngredient?: string;
}) {
  const conds = [] as ReturnType<typeof eq>[];
  if (q.from) conds.push(gte(treatmentsTable.appliedAt, q.from));
  if (q.to) conds.push(lt(treatmentsTable.appliedAt, q.to));
  if (q.groveId != null) conds.push(eq(treatmentsTable.groveId, q.groveId));
  if (q.product) conds.push(eq(treatmentsTable.product, q.product));
  if (q.activeIngredient) conds.push(eq(treatmentsTable.activeIngredient, q.activeIngredient));
  const rows = await db
    .select()
    .from(treatmentsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(treatmentsTable.appliedAt));
  const groves = await db.select().from(grovesTable);
  const groveById = new Map(groves.map((g) => [g.id, g]));
  const workerIds = Array.from(new Set(rows.map((r) => r.workerId)));
  const workers = workerIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, workerIds))
    : [];
  const workerById = new Map(workers.map((w) => [w.id, w]));
  return rows.map((r) => ({
    id: r.id,
    appliedAt: r.appliedAt.toISOString(),
    groveId: r.groveId,
    groveName: groveById.get(r.groveId)?.name ?? null,
    treatmentKind: r.treatmentKind,
    product: r.product,
    activeIngredient: r.activeIngredient,
    rate: r.rate,
    rateUnit: r.rateUnit,
    method: r.method,
    areaHectares: r.areaHectares,
    treesAffectedCount: r.treesAffectedCount,
    withholdingDays: r.withholdingDays,
    weatherConditions: r.weatherConditions,
    applicatorWorkerId: r.workerId,
    applicatorName: workerById.get(r.workerId)?.name ?? null,
    notes: r.notes,
  }));
}

function parseComplianceQuery(q: unknown) {
  const parsed = ComplianceQuerySchema.safeParse(q);
  if (!parsed.success) return null;
  const d = parsed.data;
  // Half-open interval: [from 00:00, to+1day 00:00)
  let toDate: Date | undefined;
  if (d.to) {
    const t = new Date(`${d.to}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    toDate = t;
  }
  return {
    from: d.from ? new Date(`${d.from}T00:00:00Z`) : undefined,
    to: toDate,
    groveId: d.groveId,
    product: d.product,
    activeIngredient: d.activeIngredient,
  };
}

router.get("/reports/compliance", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const q = parseComplianceQuery(req.query);
  if (!q) { res.status(400).json({ error: "Invalid query" }); return; }
  const rows = await loadComplianceRows(q);
  res.json(rows);
});

router.get("/reports/compliance.csv", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const q = parseComplianceQuery(req.query);
  if (!q) { res.status(400).json({ error: "Invalid query" }); return; }
  const rows = await loadComplianceRows(q);
  const headers = [
    "id", "appliedAt", "groveId", "groveName", "treatmentKind", "product",
    "activeIngredient", "rate", "rateUnit", "method", "areaHectares",
    "treesAffectedCount", "withholdingDays", "weatherConditions",
    "applicatorWorkerId", "applicatorName", "notes",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    let s = String(v);
    // Neutralize CSV/spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(",")),
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="compliance-treatments.csv"`);
  res.send(csv);
});

router.get("/heritage-rules/:id/evidence-summary", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const yearRaw = req.query["year"];
  const year = yearRaw ? Number(yearRaw) : null;

  const conds = [eq(ruleEvidenceTable.heritageRuleId, id)];
  if (year != null && Number.isFinite(year)) {
    conds.push(gte(ruleEvidenceTable.createdAt, new Date(`${year}-01-01T00:00:00Z`)));
    conds.push(lt(ruleEvidenceTable.createdAt, new Date(`${year + 1}-01-01T00:00:00Z`)));
  }
  const rows = await db.select().from(ruleEvidenceTable).where(and(...conds));

  const kindCounts = new Map<string, number>();
  const monthCounts = Array(12).fill(0) as number[];
  for (const r of rows) {
    const kind =
      r.satelliteObservationId != null ? "satellite" :
      r.fieldVisitId != null ? "fieldVisit" :
      r.harvestEventId != null ? "harvestEvent" :
      r.harvestBatchId != null ? "harvestBatch" :
      r.labResultId != null ? "labResult" :
      r.treeId != null ? "tree" :
      r.groveId != null ? "grove" : "other";
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    if (year != null) monthCounts[r.createdAt.getUTCMonth()]! += 1;
  }

  res.json({
    heritageRuleId: id,
    year: year != null && Number.isFinite(year) ? year : null,
    totalCount: rows.length,
    byKind: Array.from(kindCounts.entries()).map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: monthCounts[i]! })),
  });
});

export default router;
