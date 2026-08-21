import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  grovesTable, treesTable, satelliteAlertsTable, tasksTable,
  heritageRulesTable, ruleEvidenceTable, harvestBatchesTable, labResultsTable,
  pestDiseaseFindsTable, weatherLogTable, bottlingRunsTable, phenologyEventsTable,
  harvestEventsTable, treatmentsTable,
} from "@workspace/db";
import { eq, and, count, desc, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { AiGroveQueryBody, GenerateMonitoringPlanBody, GenerateHarvestPlanBody, GenerateAiInsightsBody } from "@workspace/api-zod";
import { resolvePrincipal, type Principal } from "../lib/auth";
import { getAnthropic, DEFAULT_MODEL } from "../lib/anthropic";

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Missing or invalid session cookie" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required for this action" }); return null; }
  return principal;
}

const router: IRouter = Router();

router.post("/ai/query", async (req, res) => {
  const body = AiGroveQueryBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { question } = body.data;
  const q = question.toLowerCase();

  let answer = "";
  const dataPoints: string[] = [];

  if (q.includes("attention") || q.includes("grove") || q.includes("needs")) {
    const groves = await db.select().from(grovesTable);
    const groveAlerts = await Promise.all(groves.map(async (g) => {
      const [alerts] = await db.select({ count: count(satelliteAlertsTable.id) }).from(satelliteAlertsTable).where(and(eq(satelliteAlertsTable.groveId, g.id), eq(satelliteAlertsTable.status, "open")));
      return { grove: g, alertCount: Number(alerts?.count ?? 0) };
    }));
    groveAlerts.sort((a, b) => b.alertCount - a.alertCount);
    const top = groveAlerts[0];
    if (top && top.alertCount > 0) {
      answer = `Grove "${top.grove.name}" (${top.grove.groveCode}) requires immediate attention with ${top.alertCount} open satellite alert${top.alertCount > 1 ? "s" : ""}. Field verification is recommended.`;
      for (const ga of groveAlerts.slice(0, 3)) {
        dataPoints.push(`${ga.grove.name}: ${ga.alertCount} open alerts`);
      }
    } else {
      answer = "All groves are currently clear of critical satellite alerts. Routine monitoring is recommended.";
    }
  } else if (q.includes("ancient") || q.includes("old")) {
    const ancientTrees = await db.select().from(treesTable).where(eq(treesTable.ancientStatus, "confirmed_ancient")).limit(5);
    const alerts = await db.select().from(satelliteAlertsTable).where(eq(satelliteAlertsTable.status, "open"));
    const treeIds = new Set(ancientTrees.map(t => t.id));
    const alertsOnAncient = alerts.filter(a => a.treeId && treeIds.has(a.treeId));
    answer = `There are ${ancientTrees.length} confirmed ancient trees. ${alertsOnAncient.length} have open satellite stress signals requiring field verification.`;
    for (const t of ancientTrees) {
      dataPoints.push(`Tree ${t.treeCode}: ${t.ancientStatus}, health index ${t.currentHealthIndex?.toFixed(2) ?? "unknown"}`);
    }
  } else if (q.includes("baal") || q.includes("ba'al") || q.includes("rainfed")) {
    const rules = await db.select().from(heritageRulesTable).where(eq(heritageRulesTable.ruleCode, "BAAL_RAINFED"));
    const rule = rules[0];
    if (rule) {
      const [evCount] = await db.select({ count: count(ruleEvidenceTable.id) }).from(ruleEvidenceTable).where(eq(ruleEvidenceTable.heritageRuleId, rule.id));
      answer = `The Ba'al Rainfed Discipline heritage rule currently has status: "${rule.status}" with ${evCount?.count ?? 0} evidence records. ${rule.scientificHypothesis ?? ""}`;
      dataPoints.push(`Rule status: ${rule.status}`, `Climate risk: ${rule.climateRisk ?? "unknown"}`);
    } else {
      answer = "No data found for the Ba'al Rainfed Discipline rule.";
    }
  } else if (q.includes("lab") || q.includes("batch") || q.includes("pending")) {
    const batches = await db.select().from(harvestBatchesTable);
    const labResults = await db.select().from(labResultsTable);
    const batchesWithNoLab = batches.filter(b => !labResults.some(lr => lr.harvestBatchId === b.id));
    answer = `There are ${batches.length} harvest batches total. ${batchesWithNoLab.length} batches are pending lab analysis.`;
    for (const b of batchesWithNoLab.slice(0, 3)) {
      dataPoints.push(`Batch ${b.batchCode}: ${b.status}, ~${b.totalEstimatedWeightKg ?? "?"} kg`);
    }
  } else {
    const [groveCount] = await db.select({ count: count(grovesTable.id) }).from(grovesTable);
    const [treeCount] = await db.select({ count: count(treesTable.id) }).from(treesTable);
    const [alertCount] = await db.select({ count: count(satelliteAlertsTable.id) }).from(satelliteAlertsTable).where(eq(satelliteAlertsTable.status, "open"));
    answer = `The grove system has ${groveCount?.count ?? 0} groves and ${treeCount?.count ?? 0} trees under satellite monitoring. There are currently ${alertCount?.count ?? 0} open satellite stress signals requiring attention.`;
    dataPoints.push(`Total groves: ${groveCount?.count ?? 0}`, `Total trees: ${treeCount?.count ?? 0}`, `Open alerts: ${alertCount?.count ?? 0}`);
  }

  res.json({ answer, dataPoints: dataPoints.map(d => ({ label: d })), generatedAt: new Date().toISOString() });
});

router.post("/ai/monitoring-plan", async (req, res) => {
  const body = GenerateMonitoringPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { groveId } = body.data;
  let groveName = "all groves";
  if (groveId) {
    const [g] = await db.select().from(grovesTable).where(eq(grovesTable.id, groveId));
    if (g) groveName = g.name;
  }
  const [alertCount] = await db.select({ count: count(satelliteAlertsTable.id) }).from(satelliteAlertsTable).where(eq(satelliteAlertsTable.status, "open"));
  res.json({
    title: `Satellite Monitoring Plan — ${groveName}`,
    generatedAt: new Date().toISOString(),
    summary: `Based on current satellite data, ${alertCount?.count ?? 0} stress signals require field verification. Priority should be given to trees with low NDVI values and anomaly flags.`,
    tasks: [
      { priority: "high", action: "Field-verify all open critical satellite stress signals", frequency: "Immediately" },
      { priority: "medium", action: "Inspect canopy density anomalies in ancient trees", frequency: "Weekly" },
      { priority: "medium", action: "Monitor NDVI trends across all groves", frequency: "Per imagery acquisition" },
      { priority: "low", action: "Update heritage rule evidence after each field visit", frequency: "Monthly" },
    ],
  });
});

router.post("/ai/harvest-plan", async (req, res) => {
  const body = GenerateHarvestPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const groves = await db.select().from(grovesTable);
  const [treeCount] = await db.select({ count: count(treesTable.id) }).from(treesTable);
  res.json({
    title: "Harvest Season Plan — Khalaf Olive Groves",
    generatedAt: new Date().toISOString(),
    summary: `Planning for ${groves.length} grove(s) covering ${treeCount?.count ?? 0} trees. Souri variety optimal harvest window is typically November–January.`,
    recommendations: [
      { grove: "All groves", action: "Assess fruit maturity index before harvesting", timing: "2 weeks before planned start" },
      { grove: "Ancient trees", action: "Prioritize gentle hand-picking to preserve branch structure", timing: "During harvest" },
      { grove: "All groves", action: "Press within 6–12 hours of harvest for maximum polyphenol retention", timing: "Day of harvest" },
      { grove: "All groves", action: "Submit lab samples within 48 hours of pressing", timing: "After pressing" },
    ],
  });
});

// ─── /ai/insights — grounded manager insights via Anthropic ────────────────

const InsightSchema = z.object({
  headline: z.string(),
  body: z.string(),
  severity: z.enum(["info", "watch", "action_recommended"]),
  suggestedTaskType: z.string().nullable().optional(),
  citations: z.array(
    z.object({
      recordType: z.enum([
        "satellite_alert", "pest_find", "lab_result", "weather_log",
        "bottling_run", "phenology_event", "harvest_event", "treatment",
      ]),
      recordId: z.number().int(),
      summary: z.string(),
    }),
  ).min(1),
});
const ModelOutputSchema = z.object({
  summary: z.string(),
  insights: z.array(InsightSchema).max(8),
  limitations: z.string(),
});

router.post("/ai/insights", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const body = GenerateAiInsightsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { groveId, focus, lookbackDays } = body.data;
  const lookback = lookbackDays ?? 14;
  const since = new Date(Date.now() - lookback * 24 * 3600 * 1000);
  const sinceISO = since.toISOString().slice(0, 10);

  const anthropic = getAnthropic();
  if (!anthropic) { res.status(503).json({ error: "AI provider not configured" }); return; }

  // Gather a grounded recent-records window. Cap each table at a small N to keep tokens tight.
  const groveFilter = groveId ? eq(satelliteAlertsTable.groveId, groveId) : undefined;
  const [alerts, pestFinds, labs, weather, bottlings, phenologies, harvests, treatments, groves] = await Promise.all([
    db.select({
      id: satelliteAlertsTable.id, severity: satelliteAlertsTable.severity,
      alertType: satelliteAlertsTable.alertType, status: satelliteAlertsTable.status,
      groveId: satelliteAlertsTable.groveId, treeId: satelliteAlertsTable.treeId,
      createdAt: satelliteAlertsTable.createdAt, evidence: satelliteAlertsTable.evidence,
    }).from(satelliteAlertsTable)
      .where(and(gte(satelliteAlertsTable.createdAt, since), ...(groveFilter ? [groveFilter] : [])))
      .orderBy(desc(satelliteAlertsTable.createdAt)).limit(15),
    db.select({
      id: pestDiseaseFindsTable.id, species: pestDiseaseFindsTable.speciesCode,
      severity: pestDiseaseFindsTable.severity, groveId: pestDiseaseFindsTable.groveId,
      treeId: pestDiseaseFindsTable.treeId, observedAt: pestDiseaseFindsTable.observedAt,
      percentAffected: pestDiseaseFindsTable.percentAffected,
    }).from(pestDiseaseFindsTable)
      .where(and(gte(pestDiseaseFindsTable.observedAt, since), ...(groveId ? [eq(pestDiseaseFindsTable.groveId, groveId)] : [])))
      .orderBy(desc(pestDiseaseFindsTable.observedAt)).limit(15),
    db.select({
      id: labResultsTable.id, sampleDate: labResultsTable.sampleDate,
      acidity: labResultsTable.acidity,
      totalPolyphenolsMgKg: labResultsTable.totalPolyphenolsMgKg,
      peroxideValue: labResultsTable.peroxideValue,
      attributionLevel: labResultsTable.attributionLevel,
    }).from(labResultsTable).orderBy(desc(labResultsTable.createdAt)).limit(10),
    db.select({
      id: weatherLogTable.id, groveId: weatherLogTable.groveId,
      observedDate: weatherLogTable.observedDate, rainfallMm: weatherLogTable.rainfallMm,
      tempMinC: weatherLogTable.tempMinC, tempMaxC: weatherLogTable.tempMaxC,
      humidityAvgPct: weatherLogTable.humidityAvgPct,
    }).from(weatherLogTable)
      .where(and(gte(weatherLogTable.observedDate, sinceISO), ...(groveId ? [eq(weatherLogTable.groveId, groveId)] : [])))
      .orderBy(desc(weatherLogTable.observedDate)).limit(20),
    db.select({
      id: bottlingRunsTable.id, runCode: bottlingRunsTable.runCode,
      lotCode: bottlingRunsTable.lotCode, bottledAt: bottlingRunsTable.bottledAt,
      bottlesProduced: bottlingRunsTable.bottlesProduced,
      totalLitersBottled: bottlingRunsTable.totalLitersBottled,
    }).from(bottlingRunsTable).orderBy(desc(bottlingRunsTable.bottledAt)).limit(5),
    db.select({
      id: phenologyEventsTable.id, groveId: phenologyEventsTable.groveId,
      bbchStage: phenologyEventsTable.bbchStage, observedAt: phenologyEventsTable.observedAt,
    }).from(phenologyEventsTable)
      .where(and(gte(phenologyEventsTable.observedAt, since), ...(groveId ? [eq(phenologyEventsTable.groveId, groveId)] : [])))
      .orderBy(desc(phenologyEventsTable.observedAt)).limit(10),
    db.select({
      id: harvestEventsTable.id, groveId: harvestEventsTable.groveId,
      harvestDate: harvestEventsTable.harvestDate, status: harvestEventsTable.status,
      totalMeasuredWeightKg: harvestEventsTable.totalMeasuredWeightKg,
      totalEstimatedWeightKg: harvestEventsTable.totalEstimatedWeightKg,
    }).from(harvestEventsTable)
      .where(and(gte(harvestEventsTable.harvestDate, sinceISO), ...(groveId ? [eq(harvestEventsTable.groveId, groveId)] : [])))
      .orderBy(desc(harvestEventsTable.harvestDate)).limit(15),
    db.select({
      id: treatmentsTable.id, groveId: treatmentsTable.groveId,
      product: treatmentsTable.product, appliedAt: treatmentsTable.appliedAt,
      withholdingDays: treatmentsTable.withholdingDays,
    }).from(treatmentsTable)
      .where(and(gte(treatmentsTable.appliedAt, since), ...(groveId ? [eq(treatmentsTable.groveId, groveId)] : [])))
      .orderBy(desc(treatmentsTable.appliedAt)).limit(10),
    db.select().from(grovesTable),
  ]);

  const groveById = new Map(groves.map((g) => [g.id, g.name]));
  const groveLabel = groveId ? (groveById.get(groveId) ?? `Grove #${groveId}`) : "the entire estate";

  const recordCounts = {
    satellite_alerts: alerts.length,
    pest_finds: pestFinds.length,
    lab_results: labs.length,
    weather_logs: weather.length,
    bottling_runs: bottlings.length,
    phenology_events: phenologies.length,
    harvest_events: harvests.length,
    treatments: treatments.length,
  };

  const corpus = {
    scope: { grove: groveLabel, lookbackDays: lookback, focus: focus ?? "general" },
    satellite_alerts: alerts.map((a) => ({ ...a, groveName: groveById.get(a.groveId) })),
    pest_finds: pestFinds.map((p) => ({ ...p, groveName: groveById.get(p.groveId) })),
    lab_results: labs,
    weather_logs: weather.map((w) => ({ ...w, groveName: groveById.get(w.groveId) })),
    bottling_runs: bottlings,
    phenology_events: phenologies.map((p) => ({ ...p, groveName: groveById.get(p.groveId) })),
    harvest_events: harvests.map((h) => ({ ...h, groveName: groveById.get(h.groveId) })),
    treatments: treatments.map((t) => ({ ...t, groveName: t.groveId ? groveById.get(t.groveId) : null })),
  };

  const systemPrompt =
    "You are a grove operations analyst for a small Souri olive estate. " +
    "You MUST ground every observation in the provided records and cite them by recordType + recordId. " +
    "Use cautious language only ('possible signal', 'consistent with', 'warrants review'). " +
    "NEVER claim a confirmed pest/disease, never claim a quality outcome, never recommend a specific product or dose. " +
    "Reply with a single JSON object matching the schema. Do not include markdown or commentary outside the JSON.";

  const userPrompt = [
    `Focus area: ${focus ?? "general"}.`,
    `Scope: ${groveLabel} over the last ${lookback} day(s).`,
    "Output JSON schema:",
    `{
  "summary": "1-3 sentence neutral overview of what the recent records show.",
  "insights": [
    { "headline": "...", "body": "...", "severity": "info|watch|action_recommended",
      "suggestedTaskType": "pest_check|grove_inspection|tree_inspection|harvest_check|other|null",
      "citations": [{ "recordType": "satellite_alert|pest_find|lab_result|weather_log|bottling_run|phenology_event|harvest_event|treatment", "recordId": 0, "summary": "what this record contributes" }]
    }
  ],
  "limitations": "Required: state what could NOT be assessed, e.g. no in-person inspection, sparse weather data, no recent lab results, etc."
}`,
    "Rules: max 5 insights; every insight must have at least one citation; if there is nothing actionable, return summary + empty insights + limitations.",
    "Records (JSON):",
    JSON.stringify(corpus),
  ].join("\n\n");

  try {
    const completion = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = completion.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n").trim();
    // Strip an accidental fenced code block.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: unknown;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      req.log.warn({ err: (e as Error).message, snippet: cleaned.slice(0, 200) }, "anthropic returned non-JSON");
      res.status(502).json({ error: "AI returned malformed JSON" }); return;
    }
    const validated = ModelOutputSchema.safeParse(parsed);
    if (!validated.success) {
      req.log.warn({ issues: validated.error.issues, snippet: cleaned.slice(0, 200) }, "anthropic JSON did not match schema");
      res.status(502).json({ error: "AI response did not match schema", details: validated.error.issues }); return;
    }
    // Grounding check: every cited (recordType, recordId) must exist in the corpus we showed the model.
    const corpusIds: Record<string, Set<number>> = {
      satellite_alert: new Set(alerts.map((r) => r.id)),
      pest_find: new Set(pestFinds.map((r) => r.id)),
      lab_result: new Set(labs.map((r) => r.id)),
      weather_log: new Set(weather.map((r) => r.id)),
      bottling_run: new Set(bottlings.map((r) => r.id)),
      phenology_event: new Set(phenologies.map((r) => r.id)),
      harvest_event: new Set(harvests.map((r) => r.id)),
      treatment: new Set(treatments.map((r) => r.id)),
    };
    const cleanedInsights = validated.data.insights
      .map((it) => ({
        ...it,
        citations: it.citations.filter((c) => corpusIds[c.recordType]?.has(c.recordId)),
      }))
      .filter((it) => it.citations.length > 0);
    res.json({
      summary: validated.data.summary,
      insights: cleanedInsights,
      limitations: validated.data.limitations,
      generatedAt: new Date().toISOString(),
      model: DEFAULT_MODEL,
      recordCounts,
    });
  } catch (err) {
    req.log.error({ err: (err as Error).message }, "anthropic call failed");
    res.status(502).json({ error: "AI provider call failed" });
  }
});

router.post("/ai/import/groves", async (req, res) => {
  res.json({ imported: 0, failed: 0, message: "Import endpoint ready. Submit CSV data." });
});
router.post("/ai/import/trees", async (req, res) => {
  res.json({ imported: 0, failed: 0, message: "Import endpoint ready. Submit CSV data." });
});
router.post("/ai/import/satellite-observations", async (req, res) => {
  res.json({ imported: 0, failed: 0, message: "Import endpoint ready." });
});
router.post("/ai/import/satellite-alerts", async (req, res) => {
  res.json({ imported: 0, failed: 0, message: "Import endpoint ready." });
});
router.post("/ai/import/imagery-acquisitions", async (req, res) => {
  res.json({ imported: 0, failed: 0, message: "Import endpoint ready." });
});
router.post("/ai/import/upload", async (req, res) => {
  res.json({ fileId: "upload-placeholder", message: "Upload received." });
});

export default router;
