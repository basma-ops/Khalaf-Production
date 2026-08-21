import { Router, type IRouter, type Request, type Response } from "express";
import { resolvePrincipal, type Principal } from "../lib/auth";
import {
  RunPhotoAnalysisBody,
  ListAnalysisResultsQueryParams,
  GetAnalysisResultParams,
  GetPhotoAnalysisJobParams,
  ReviewAnalysisResultParams,
  ReviewAnalysisResultBody,
  CreateTaskFromAnalysisParams,
  CreateTaskFromAnalysisBody,
  LinkAnalysisToHeritageRuleParams,
  LinkAnalysisToHeritageRuleBody,
  CreatePhotoBatchBody,
  GetPhotoBatchParams,
  AddPhotoToBatchParams,
  AddPhotoToBatchBody,
  ExportBatchResultsParams,
  ExportBatchResultsQueryParams,
} from "@workspace/api-zod";
import {
  db,
  mediaTable,
  photoAnalysisJobsTable,
  photoAnalysisResultsTable,
  photoBatchesTable,
  photoBatchItemsTable,
  tasksTable,
  ruleEvidenceTable,
  treesTable,
  grovesTable,
  type PhotoAnalysisResult,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, type SQL } from "drizzle-orm";
import { runAnalysisForMedia, enrichResults, recountBatch } from "../lib/photoAnalysis";

const router: IRouter = Router();

// Require a manager principal; writes 401/403 and returns null on fail.
async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Missing or invalid session cookie" });
    return null;
  }
  if (principal.kind !== "manager") {
    res.status(403).json({ error: "Manager role required for this action" });
    return null;
  }
  return principal;
}

router.post("/photo-analysis/analyze", async (req: Request, res: Response) => {
  // Re-running / forcing analysis is a manager action (the field worker
  // pipeline already runs analysis at upload time via finalize-upload).
  if (!(await requireManager(req, res))) return;
  const parsed = RunPhotoAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  try {
    const { mediaId, provider, context, batchId, force } = parsed.data;
    const { job, result } = await runAnalysisForMedia({
      mediaId,
      provider: provider ?? undefined,
      context: context ?? undefined,
      batchId: batchId ?? null,
      force: force ?? false,
    });
    const enriched = result ? (await enrichResults([result]))[0] ?? null : null;
    res.json({
      job: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
      },
      result: enriched,
    });
  } catch (err) {
    req.log.error({ err }, "analyze failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Manager-only: full analysis output (model summary, metrics, GPS, review state).
router.get("/photo-analysis/results", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const parsed = ListAnalysisResultsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { reviewStatus, needsFieldVerification, treeId, groveId, batchId, purpose, confidenceMin, limit } = parsed.data;
  const conditions: SQL[] = [];
  if (reviewStatus) conditions.push(eq(photoAnalysisResultsTable.reviewStatus, reviewStatus));
  if (needsFieldVerification)
    conditions.push(eq(photoAnalysisResultsTable.needsFieldVerification, needsFieldVerification));
  if (treeId != null) conditions.push(eq(photoAnalysisResultsTable.treeId, treeId));
  if (groveId != null) conditions.push(eq(photoAnalysisResultsTable.groveId, groveId));
  if (confidenceMin != null) {
    conditions.push(sql`${photoAnalysisResultsTable.confidenceScore} >= ${confidenceMin}`);
  }
  if (purpose) {
    // Filter by Media.purpose (e.g. pre_harvest, box, pest, …) by joining
    // through the mediaIds matching that purpose.
    const matched = await db
      .select({ id: mediaTable.id })
      .from(mediaTable)
      .where(eq(mediaTable.purpose, purpose));
    const matchedIds = matched.map((m) => m.id);
    if (matchedIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(photoAnalysisResultsTable.mediaId, matchedIds));
  }
  if (batchId != null) {
    const jobs = await db
      .select({ id: photoAnalysisJobsTable.id })
      .from(photoAnalysisJobsTable)
      .where(eq(photoAnalysisJobsTable.batchId, batchId));
    const jobIds = jobs.map((j) => j.id);
    if (jobIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(photoAnalysisResultsTable.jobId, jobIds));
  }
  const rows = await db
    .select()
    .from(photoAnalysisResultsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(photoAnalysisResultsTable.createdAt))
    .limit(limit ?? 100);
  res.json(await enrichResults(rows));
});

// Manager-only: poll a single analysis job's status (queued/running/succeeded/failed).
router.get("/photo-analysis/jobs/:id", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const parsed = GetPhotoAnalysisJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db
    .select()
    .from(photoAnalysisJobsTable)
    .where(eq(photoAnalysisJobsTable.id, parsed.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  });
});

// Manager-only: detail view of a single analysis result.
router.get("/photo-analysis/results/:id", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const parsed = GetAnalysisResultParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(photoAnalysisResultsTable).where(eq(photoAnalysisResultsTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [enriched] = await enrichResults([row]);
  res.json(enriched);
});

router.post("/photo-analysis/results/:id/review", async (req: Request, res: Response) => {
  // Manager review is the only audited path for confirming an
  // auto-analysis. The reviewer identity must come from the server-side
  // session, never from the request body, so a worker (or unauthenticated
  // caller) cannot mark a cautious signal as "confirmed" or "rejected".
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Missing or invalid session cookie" });
    return;
  }
  if (principal.kind !== "manager") {
    res.status(403).json({ error: "Only managers may review analysis results" });
    return;
  }
  const params = ReviewAnalysisResultParams.safeParse(req.params);
  const body = ReviewAnalysisResultBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(photoAnalysisResultsTable)
    .set({
      reviewStatus: body.data.reviewStatus,
      reviewNotes: body.data.reviewNotes ?? null,
      reviewedByUserId: principal.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(photoAnalysisResultsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [enriched] = await enrichResults([updated]);
  res.json(enriched);
});

router.post("/photo-analysis/results/:id/create-task", async (req: Request, res: Response) => {
  // Creating a follow-up task from a cautious "possible signal" is a
  // manager action — workers see suggested tasks via the dashboard but
  // do not author them.
  if (!(await requireManager(req, res))) return;
  const params = CreateTaskFromAnalysisParams.safeParse(req.params);
  const body = CreateTaskFromAnalysisBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [result] = await db
    .select()
    .from(photoAnalysisResultsTable)
    .where(eq(photoAnalysisResultsTable.id, params.data.id));
  if (!result) {
    res.status(404).json({ error: "Result not found" });
    return;
  }
  const desc = body.data.description
    ? `${body.data.description}\n\n— Auto-derived from photo analysis result #${result.id}.`
    : `Auto-derived from photo analysis result #${result.id}.\n\nSummary: ${result.summary ?? "(none)"}\nLimitations: ${result.limitations ?? "(none)"}`;
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: body.data.title,
      description: desc,
      taskType: body.data.taskType,
      priority: body.data.priority,
      status: "open",
      assignedToUserId: body.data.assignedToUserId ?? null,
      treeId: body.data.treeId ?? result.treeId,
      groveId: body.data.groveId ?? result.groveId,
      dueDate: body.data.dueDate ? body.data.dueDate.toISOString().slice(0, 10) : null,
    })
    .returning();
  await db
    .update(photoAnalysisResultsTable)
    .set({ createdTaskId: task.id, updatedAt: new Date() })
    .where(eq(photoAnalysisResultsTable.id, result.id));
  res.status(201).json({
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  });
});

router.post("/photo-analysis/results/:id/link-rule", async (req: Request, res: Response) => {
  // Linking analysis evidence to a heritage rule is part of the audit
  // trail; only managers may write evidence rows.
  if (!(await requireManager(req, res))) return;
  const params = LinkAnalysisToHeritageRuleParams.safeParse(req.params);
  const body = LinkAnalysisToHeritageRuleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [result] = await db
    .select()
    .from(photoAnalysisResultsTable)
    .where(eq(photoAnalysisResultsTable.id, params.data.id));
  if (!result) {
    res.status(404).json({ error: "Result not found" });
    return;
  }
  if (result.reviewStatus !== "confirmed") {
    res.status(409).json({
      error:
        "Heritage rule linking is only allowed after a manager has confirmed this analysis. Current review status: " +
        result.reviewStatus,
    });
    return;
  }

  // ---- Derive metric/value/scope/confidence from the STORED result ----
  // The client may not pass any of these — they must come from the
  // analysis the model produced so the rule_evidence audit row reflects
  // the actual signal that was reviewed and confirmed.
  const cuesArr =
    (result.possiblePestOrDiseaseCues as Array<{ cue: string; severity: string }>) ?? [];

  // Pick metricName from whichever signal field is the strongest evidence.
  // Order matters: pest/disease cues are the most specific.
  let metricName = "visual_photo_signal";
  if (cuesArr.length > 0) metricName = "pest_or_disease_cue";
  else if (result.fruitDamageSignal) metricName = "fruit_damage";
  else if (result.fruitMaturityVisualEstimate) metricName = "fruit_maturity";
  else if (result.pruningNeedSignal) metricName = "pruning_need";
  else if (result.droughtStressVisualSignal) metricName = "drought_stress_visual";
  else if (result.yellowingSignal) metricName = "canopy_yellowing";
  else if (result.canopyDensity) metricName = "canopy_density";
  else if (result.canopyGreennessScore != null) metricName = "canopy_greenness";
  else if (result.trunkConditionSignal) metricName = "trunk_condition";
  else if (result.rootExposureSignal) metricName = "root_exposure";
  else if (result.terraceConditionSignal) metricName = "terrace_condition";
  else if (result.understoryVisualSignal) metricName = "understory_signal";

  // Composite metricValue summarises all populated signals so the row is
  // useful even when more than one cue is present.
  const cuesText = cuesArr.length ? cuesArr.map((c) => `${c.cue}=${c.severity}`).join(", ") : "";
  const metricValueParts: string[] = [];
  if (result.canopyDensity) metricValueParts.push(`canopy=${result.canopyDensity}`);
  if (result.canopyGreennessScore != null)
    metricValueParts.push(`greenness=${result.canopyGreennessScore.toFixed(2)}`);
  if (result.yellowingSignal) metricValueParts.push(`yellowing=${result.yellowingSignal}`);
  if (result.droughtStressVisualSignal)
    metricValueParts.push(`drought=${result.droughtStressVisualSignal}`);
  if (result.fruitMaturityVisualEstimate)
    metricValueParts.push(`maturity=${result.fruitMaturityVisualEstimate}`);
  if (result.fruitDamageSignal) metricValueParts.push(`fruit_damage=${result.fruitDamageSignal}`);
  if (result.pruningNeedSignal) metricValueParts.push(`pruning_need=${result.pruningNeedSignal}`);
  if (result.trunkConditionSignal) metricValueParts.push(`trunk=${result.trunkConditionSignal}`);
  if (result.rootExposureSignal) metricValueParts.push(`roots=${result.rootExposureSignal}`);
  if (result.terraceConditionSignal)
    metricValueParts.push(`terrace=${result.terraceConditionSignal}`);
  if (result.understoryVisualSignal)
    metricValueParts.push(`understory=${result.understoryVisualSignal}`);
  if (cuesArr.length) metricValueParts.push(`cues=${cuesText}`);
  const metricValue =
    metricValueParts.join("; ") || (result.summary?.slice(0, 80) ?? "see notes");

  // Confidence is derived from the model's own confidenceScore (0..1).
  // Mapping: >=0.7 high, >=0.4 medium, >0 low, null/0 unknown.
  let confidenceLevel: "low" | "medium" | "high" | "unknown" = "unknown";
  if (result.confidenceScore != null) {
    if (result.confidenceScore >= 0.7) confidenceLevel = "high";
    else if (result.confidenceScore >= 0.4) confidenceLevel = "medium";
    else if (result.confidenceScore > 0) confidenceLevel = "low";
  }

  // Scope: use the linked entity (field-visit / harvest-event) when the
  // photo was reconciled to one. rule_evidence has dedicated columns for
  // those, so we populate them too in addition to grove/tree from the
  // result.
  const [media] = await db
    .select({
      linkedEntityType: mediaTable.linkedEntityType,
      linkedEntityId: mediaTable.linkedEntityId,
    })
    .from(mediaTable)
    .where(eq(mediaTable.id, result.mediaId))
    .limit(1);
  const fieldVisitId =
    media?.linkedEntityType === "field_visit" ? media.linkedEntityId : null;
  const harvestEventId =
    media?.linkedEntityType === "harvest_event" ? media.linkedEntityId : null;

  // The optional `evidence` body field is only used as a human
  // interpretation override — it never overrides metric/value/confidence.
  const interpretation = (
    body.data.evidence ??
    `Photo analysis #${result.id} (provider=${result.provider}, context=${result.context}). ` +
      `Summary: ${result.summary ?? "n/a"}. ` +
      `Cues: ${cuesText || "none"}. ` +
      `Image quality: ${result.imageQuality ?? "n/a"}. ` +
      `Limitations: ${result.limitations ?? "n/a"}.`
  ).slice(0, 500);

  const [evidenceRow] = await db
    .insert(ruleEvidenceTable)
    .values({
      heritageRuleId: body.data.heritageRuleId,
      groveId: result.groveId,
      treeId: result.treeId,
      fieldVisitId,
      harvestEventId,
      metricName,
      metricValue,
      interpretation,
      confidenceLevel,
    })
    .returning();
  const [updated] = await db
    .update(photoAnalysisResultsTable)
    .set({
      linkedHeritageRuleId: body.data.heritageRuleId,
      linkedRuleEvidenceId: evidenceRow.id,
      updatedAt: new Date(),
    })
    .where(eq(photoAnalysisResultsTable.id, result.id))
    .returning();
  const [enriched] = await enrichResults([updated]);
  res.status(201).json(enriched);
});

// Manager-only: photo batches are an internal review/test surface.
router.get("/photo-analysis/batches", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const batches = await db.select().from(photoBatchesTable).orderBy(desc(photoBatchesTable.createdAt));
  if (batches.length === 0) {
    res.json([]);
    return;
  }
  // Per-batch counts
  const counts = await db
    .select({
      jobId: photoAnalysisJobsTable.id,
      batchId: photoAnalysisJobsTable.batchId,
      reviewStatus: photoAnalysisResultsTable.reviewStatus,
    })
    .from(photoAnalysisJobsTable)
    .leftJoin(photoAnalysisResultsTable, eq(photoAnalysisResultsTable.jobId, photoAnalysisJobsTable.id))
    .where(inArray(photoAnalysisJobsTable.batchId, batches.map((b) => b.id)));
  const aggregate = new Map<number, { confirmed: number; rejected: number; needsVerification: number; pending: number }>();
  for (const c of counts) {
    if (c.batchId == null) continue;
    const a = aggregate.get(c.batchId) ?? { confirmed: 0, rejected: 0, needsVerification: 0, pending: 0 };
    if (c.reviewStatus === "confirmed") a.confirmed++;
    else if (c.reviewStatus === "rejected") a.rejected++;
    else if (c.reviewStatus === "needs_verification") a.needsVerification++;
    else if (c.reviewStatus === "pending") a.pending++;
    aggregate.set(c.batchId, a);
  }
  res.json(
    batches.map((b) => {
      const a = aggregate.get(b.id) ?? { confirmed: 0, rejected: 0, needsVerification: 0, pending: 0 };
      return {
        ...b,
        confirmedCount: a.confirmed,
        rejectedCount: a.rejected,
        needsVerificationCount: a.needsVerification,
        pendingCount: a.pending,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      };
    }),
  );
});

router.post("/photo-analysis/batches", async (req: Request, res: Response) => {
  // Batches exist for manager-led test/QA review of photo cohorts.
  if (!(await requireManager(req, res))) return;
  const body = CreatePhotoBatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [row] = await db
    .insert(photoBatchesTable)
    .values({
      name: body.data.name,
      context: body.data.context ?? "general_tree_review",
      notes: body.data.notes ?? null,
      createdByUserId: body.data.createdByUserId ?? null,
    })
    .returning();
  res.status(201).json({
    ...row,
    confirmedCount: 0,
    rejectedCount: 0,
    needsVerificationCount: 0,
    pendingCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// Manager-only.
router.get("/photo-analysis/batches/:id", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const params = GetPhotoBatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [batch] = await db.select().from(photoBatchesTable).where(eq(photoBatchesTable.id, params.data.id));
  if (!batch) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const items = await db
    .select({ result: photoAnalysisResultsTable })
    .from(photoAnalysisJobsTable)
    .innerJoin(photoAnalysisResultsTable, eq(photoAnalysisResultsTable.jobId, photoAnalysisJobsTable.id))
    .where(eq(photoAnalysisJobsTable.batchId, batch.id))
    .orderBy(desc(photoAnalysisResultsTable.createdAt));
  const enriched = await enrichResults(items.map((i) => i.result));
  // Aggregate counts
  const counts = enriched.reduce(
    (acc, r) => {
      if (r.reviewStatus === "confirmed") acc.confirmed++;
      else if (r.reviewStatus === "rejected") acc.rejected++;
      else if (r.reviewStatus === "needs_verification") acc.needsVerification++;
      else acc.pending++;
      return acc;
    },
    { confirmed: 0, rejected: 0, needsVerification: 0, pending: 0 },
  );
  res.json({
    batch: {
      ...batch,
      confirmedCount: counts.confirmed,
      rejectedCount: counts.rejected,
      needsVerificationCount: counts.needsVerification,
      pendingCount: counts.pending,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    },
    items: enriched,
  });
});

router.post("/photo-analysis/batches/:id/add-item", async (req: Request, res: Response) => {
  // Adding a previously-uploaded photo to a manager batch (and triggering
  // its analysis) is a manager-side action.
  if (!(await requireManager(req, res))) return;
  const params = AddPhotoToBatchParams.safeParse(req.params);
  const body = AddPhotoToBatchBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [batch] = await db.select().from(photoBatchesTable).where(eq(photoBatchesTable.id, params.data.id));
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  await db
    .insert(photoBatchItemsTable)
    .values({ batchId: batch.id, mediaId: body.data.mediaId, orderIndex: body.data.orderIndex ?? 0 });
  await db
    .update(photoBatchesTable)
    .set({ totalItems: sql`${photoBatchesTable.totalItems} + 1`, updatedAt: new Date() })
    .where(eq(photoBatchesTable.id, batch.id));
  const { job, result } = await runAnalysisForMedia({
    mediaId: body.data.mediaId,
    provider: body.data.provider ?? "auto",
    context: batch.context as never,
    batchId: batch.id,
    force: false,
  });
  const enriched = result ? (await enrichResults([result]))[0] ?? null : null;
  res.status(201).json({
    job: {
      ...job,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    },
    result: enriched,
  });
  await recountBatch(batch.id);
});

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

// Manager-only: CSV export of full batch results.
router.get("/photo-analysis/batches/:id/export", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const params = ExportBatchResultsParams.safeParse(req.params);
  const query = ExportBatchResultsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const items = await db
    .select({ result: photoAnalysisResultsTable })
    .from(photoAnalysisJobsTable)
    .innerJoin(photoAnalysisResultsTable, eq(photoAnalysisResultsTable.jobId, photoAnalysisJobsTable.id))
    .where(eq(photoAnalysisJobsTable.batchId, params.data.id));
  const enriched = await enrichResults(items.map((i) => i.result));
  if ((query.data.format ?? "json") === "csv") {
    const header = [
      "id",
      "mediaId",
      "fileName",
      "treeCode",
      "groveName",
      "provider",
      "context",
      "imageQuality",
      "blurScore",
      "brightnessScore",
      "summary",
      "limitations",
      "needsFieldVerification",
      "reviewStatus",
      "possibleCues",
      "confidenceScore",
      "createdAt",
    ];
    const lines = [toCsvRow(header)];
    for (const r of enriched) {
      const cues = (r.possiblePestOrDiseaseCues as Array<{ cue: string; severity: string }>) ?? [];
      lines.push(
        toCsvRow([
          r.id,
          r.mediaId,
          r.media?.originalFileName ?? "",
          r.treeCode ?? "",
          r.groveName ?? "",
          r.provider,
          r.context,
          r.imageQuality ?? "",
          r.blurScore != null ? r.blurScore.toFixed(3) : "",
          r.brightnessScore != null ? r.brightnessScore.toFixed(3) : "",
          r.summary ?? "",
          r.limitations ?? "",
          r.needsFieldVerification,
          r.reviewStatus,
          cues.map((c) => `${c.cue}=${c.severity}`).join("; "),
          r.confidenceScore ?? "",
          r.createdAt,
        ]),
      );
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="batch-${params.data.id}.csv"`);
    res.send(lines.join("\n"));
    return;
  }
  res.json(enriched);
});

export default router;
