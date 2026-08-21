import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pestDiseaseFindsTable, usersTable, grovesTable, treesTable, tasksTable, harvestEventsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, inArray, sql, type SQL } from "drizzle-orm";
import { resolvePrincipal } from "../lib/auth";

async function requireWorkerOrManager(req: Request, res: Response): Promise<boolean> {
  const p = await resolvePrincipal(req);
  if (!p) { res.status(401).json({ error: "Missing or invalid session cookie" }); return false; }
  if (p.kind !== "manager" && p.kind !== "worker") { res.status(403).json({ error: "Worker or manager role required" }); return false; }
  return true;
}
import {
  ListPestDiseaseFindsQueryParams,
  CreatePestDiseaseFindBody,
  GetPestDiseaseFindParams,
  UpdatePestDiseaseFindParams,
  UpdatePestDiseaseFindBody,
  DeletePestDiseaseFindParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const selectShape = {
  id: pestDiseaseFindsTable.id,
  workerId: pestDiseaseFindsTable.workerId,
  workerName: usersTable.name,
  groveId: pestDiseaseFindsTable.groveId,
  groveName: grovesTable.name,
  treeId: pestDiseaseFindsTable.treeId,
  treeCode: treesTable.treeCode,
  speciesCode: pestDiseaseFindsTable.speciesCode,
  severity: pestDiseaseFindsTable.severity,
  percentAffected: pestDiseaseFindsTable.percentAffected,
  recommendedAction: pestDiseaseFindsTable.recommendedAction,
  notes: pestDiseaseFindsTable.notes,
  photoIds: pestDiseaseFindsTable.photoIds,
  linkedTreatmentId: pestDiseaseFindsTable.linkedTreatmentId,
  observedAt: pestDiseaseFindsTable.observedAt,
  createdAt: pestDiseaseFindsTable.createdAt,
} as const;

router.get("/pest-disease-finds", async (req, res) => {
  const query = ListPestDiseaseFindsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query", details: query.error.issues }); return; }
  const { groveId, treeId, speciesCode, severity, fromDate, toDate, limit } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(pestDiseaseFindsTable.groveId, groveId));
  if (treeId) conditions.push(eq(pestDiseaseFindsTable.treeId, treeId));
  if (speciesCode) conditions.push(eq(pestDiseaseFindsTable.speciesCode, speciesCode));
  if (severity) conditions.push(eq(pestDiseaseFindsTable.severity, severity));
  if (fromDate) conditions.push(gte(pestDiseaseFindsTable.observedAt, new Date(fromDate)));
  if (toDate) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
    const end = isDateOnly ? new Date(toDate + "T23:59:59.999Z") : new Date(toDate);
    conditions.push(lte(pestDiseaseFindsTable.observedAt, end));
  }
  const rows = await db.select(selectShape).from(pestDiseaseFindsTable)
    .leftJoin(usersTable, eq(usersTable.id, pestDiseaseFindsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, pestDiseaseFindsTable.groveId))
    .leftJoin(treesTable, eq(treesTable.id, pestDiseaseFindsTable.treeId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(pestDiseaseFindsTable.observedAt))
    .limit(limit ?? 200);
  res.json(rows);
});

// Species-aware default product class + EU/IFOAM-typical withholding (PHI) days.
// Conservative — chosen so the auto-task NEVER schedules a treatment that lands
// inside an already-planned harvest window.
// Per-species treatment plan + auto-task severity threshold.
// `triggerSeverities` is the configurable threshold set per pest — auto-task
// is only created when the find's severity is in this set. Conservative
// defaults: vector/yield-impacting pests trigger from medium, sporadic
// nuisances only from high, cultural-only pests never auto-trigger.
type ProductPlan = {
  productClass: string;
  withholdingDays: number;
  triggerSeverities: ReadonlyArray<"low" | "medium" | "high">;
};
const PRODUCT_PLAN_BY_SPECIES: Record<string, ProductPlan> = {
  olive_fly:           { productClass: "spinosad_bait",    withholdingDays: 7,  triggerSeverities: ["medium", "high"] },
  bactrocera_oleae:    { productClass: "spinosad_bait",    withholdingDays: 7,  triggerSeverities: ["medium", "high"] },
  olive_moth:          { productClass: "btk_bacillus",     withholdingDays: 3,  triggerSeverities: ["medium", "high"] },
  prays_oleae:         { productClass: "btk_bacillus",     withholdingDays: 3,  triggerSeverities: ["medium", "high"] },
  peacock_spot:        { productClass: "copper_hydroxide", withholdingDays: 21, triggerSeverities: ["medium", "high"] },
  spilocaea_oleagina:  { productClass: "copper_hydroxide", withholdingDays: 21, triggerSeverities: ["medium", "high"] },
  anthracnose:         { productClass: "copper_hydroxide", withholdingDays: 21, triggerSeverities: ["high"] },
  verticillium_wilt:   { productClass: "cultural_only",    withholdingDays: 0,  triggerSeverities: [] },
};
const DEFAULT_PLAN: ProductPlan = { productClass: "spinosad_bait", withholdingDays: 14, triggerSeverities: ["high"] };
function planFor(species: string): ProductPlan {
  return PRODUCT_PLAN_BY_SPECIES[species.toLowerCase()] ?? DEFAULT_PLAN;
}
function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

router.post("/pest-disease-finds", async (req, res) => {
  if (!(await requireWorkerOrManager(req, res))) return;
  const body = CreatePestDiseaseFindBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const { observedAt, ...rest } = body.data;
  const insertValues = { ...rest, ...(observedAt ? { observedAt: new Date(observedAt) } : {}) };
  const [created] = await db.insert(pestDiseaseFindsTable).values(insertValues as typeof pestDiseaseFindsTable.$inferInsert).returning();
  req.log.info({ findId: created?.id, species: created?.speciesCode, severity: created?.severity }, "pest/disease find created");

  // Auto-create a draft treatment task when severity meets the per-pest configured threshold.
  // Severity in DB is free-text; normalize common variants ("severe"→high, "trace"→low,
  // "mod*"→medium) so threshold comparison works on the full observed domain.
  function normalizeSeverity(s: string): "low" | "medium" | "high" | null {
    const v = s.trim().toLowerCase();
    if (v === "high" || v === "severe" || v === "critical") return "high";
    if (v === "medium" || v === "moderate" || v.startsWith("mod")) return "medium";
    if (v === "low" || v === "trace" || v === "minor") return "low";
    return null;
  }
  let autoTask: typeof tasksTable.$inferSelect | null = null;
  const plan = created ? planFor(created.speciesCode) : null;
  const normalizedSeverity = created ? normalizeSeverity(created.severity) : null;
  const severityTriggers = plan?.triggerSeverities ?? [];
  if (created && plan && normalizedSeverity && severityTriggers.includes(normalizedSeverity)) {
    try {
      const now = new Date();
      // Earliest sensible application = today (or +1 for high severity bias toward urgency).
      const baseStart = normalizedSeverity === "high" ? 0 : 1;
      let suggestedApply = addDaysISO(now, baseStart);
      let suggestedApplyDate = new Date(suggestedApply + "T00:00:00Z");
      let withholdingUntil = addDaysISO(suggestedApplyDate, plan.withholdingDays);
      let collisionNote = "";

      // Pull upcoming planned/not_started/in_progress harvest events in this grove, next 90 days.
      // Cancelled or completed events must not influence the suggested treatment date.
      if (created.groveId) {
        const horizon = new Date(now); horizon.setUTCDate(horizon.getUTCDate() + 90);
        const horizonStr = horizon.toISOString().slice(0, 10);
        const ACTIONABLE_STATUSES = ["planned", "not_started", "scheduled", "in_progress"] as const;
        const events = await db.select({
          id: harvestEventsTable.id,
          harvestDate: harvestEventsTable.harvestDate,
        }).from(harvestEventsTable).where(and(
          eq(harvestEventsTable.groveId, created.groveId),
          gte(harvestEventsTable.harvestDate, suggestedApply),
          lte(harvestEventsTable.harvestDate, horizonStr),
          inArray(harvestEventsTable.status, ACTIONABLE_STATUSES as unknown as string[]),
        ));
        const sortedEvents = events
          .filter((e) => e.harvestDate)
          .sort((a, b) => a.harvestDate.localeCompare(b.harvestDate));
        const earliest = sortedEvents[0];
        if (earliest) {
          // If withholdingUntil > earliest harvest date, pull suggested apply earlier so PHI ends ≥1 day before harvest.
          if (withholdingUntil >= earliest.harvestDate) {
            const earliestDate = new Date(earliest.harvestDate + "T00:00:00Z");
            const newApplyDate = new Date(earliestDate);
            newApplyDate.setUTCDate(newApplyDate.getUTCDate() - plan.withholdingDays - 1);
            // Don't suggest a date in the past — if PHI cannot clear, flag as cultural-only / manual review.
            if (newApplyDate.getTime() >= now.getTime() - 24 * 3600 * 1000) {
              suggestedApply = newApplyDate.toISOString().slice(0, 10);
              suggestedApplyDate = newApplyDate;
              withholdingUntil = addDaysISO(suggestedApplyDate, plan.withholdingDays);
              collisionNote = `Shifted earlier to clear PHI before harvest on ${earliest.harvestDate} (event #${earliest.id}).`;
            } else {
              collisionNote = `BLOCKED: PHI of ${plan.withholdingDays}d cannot clear before harvest on ${earliest.harvestDate} (event #${earliest.id}). No safe chemical application date — task left without due date for manual review (consider cultural-only intervention or post-harvest scheduling).`;
              suggestedApply = "";
              withholdingUntil = "";
            }
          }
        }
      }

      const priority = (normalizedSeverity === "high" || (collisionNote && collisionNote.startsWith("BLOCKED"))) ? "high" : "medium";
      const title = `Treatment proposal: ${created.speciesCode} (${created.severity})`;
      const notes = [
        `Auto-generated from pest/disease find #${created.id}.`,
        `Suggested product class: ${plan.productClass}; PHI ${plan.withholdingDays}d.`,
        suggestedApply ? `Suggested apply date: ${suggestedApply}.` : "",
        withholdingUntil ? `Earliest safe harvest after PHI: ${withholdingUntil}.` : "",
        collisionNote,
        "Manager must confirm product, dose, and worker assignment before scheduling.",
      ].filter(Boolean).join(" ");

      const insert: typeof tasksTable.$inferInsert = {
        title,
        description: created.recommendedAction ?? null,
        taskType: "treatment",
        priority,
        status: "open",
        groveId: created.groveId ?? null,
        treeId: created.treeId ?? null,
        dueDate: suggestedApply || null,
        withholdingUntil: withholdingUntil || null,
        notes,
      };
      const [taskRow] = await db.insert(tasksTable).values(insert).returning();
      autoTask = taskRow ?? null;
      if (taskRow) {
        req.log.info({ taskId: taskRow.id, findId: created.id, withholdingUntil }, "auto-task created from pest/disease find");
      }
    } catch (err) {
      req.log.warn({ err: (err as Error).message, findId: created.id }, "auto-task creation failed");
    }
  }

  res.status(201).json({ ...created, autoTask });
});

router.patch("/pest-disease-finds/:id", async (req, res) => {
  const params = UpdatePestDiseaseFindParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdatePestDiseaseFindBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid", details: !body.success ? body.error.issues : undefined }); return; }
  const { observedAt, ...rest } = body.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (observedAt) updateValues["observedAt"] = new Date(observedAt);
  const [updated] = await db.update(pestDiseaseFindsTable).set(updateValues).where(eq(pestDiseaseFindsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/pest-disease-finds/:id", async (req, res) => {
  const params = DeletePestDiseaseFindParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(pestDiseaseFindsTable).where(eq(pestDiseaseFindsTable.id, params.data.id)).returning({ id: pestDiseaseFindsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/pest-disease-finds/:id", async (req, res) => {
  const params = GetPestDiseaseFindParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(selectShape).from(pestDiseaseFindsTable)
    .leftJoin(usersTable, eq(usersTable.id, pestDiseaseFindsTable.workerId))
    .leftJoin(grovesTable, eq(grovesTable.id, pestDiseaseFindsTable.groveId))
    .leftJoin(treesTable, eq(treesTable.id, pestDiseaseFindsTable.treeId))
    .where(eq(pestDiseaseFindsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
