import {
  db,
  mediaTable,
  treesTable,
  grovesTable,
  photoAnalysisJobsTable,
  photoAnalysisResultsTable,
  photoBatchesTable,
  photoBatchItemsTable,
  type PhotoAnalysisJob,
  type PhotoAnalysisResult,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, type SQL } from "drizzle-orm";
import {
  runLocalHeuristic,
  analyzeWithVisionModel,
  isVisionConfigured,
  type AnalysisContext,
  type AnalysisProvider,
  type VisionAnalysis,
} from "@workspace/photo-analysis";
import { downloadObjectBytes } from "./photoLibrary";

export interface AnalysisResultRichShape extends Record<string, unknown> {
  id: number;
  jobId: number;
  mediaId: number;
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function pickContextFromPurpose(purpose: string | null | undefined): AnalysisContext {
  switch (purpose) {
    case "pre_harvest":
      return "harvest_pre_tree";
    case "box":
      return "harvest_box";
    case "pest":
    case "disease":
      return "pest_or_disease_check";
    case "pruning_before":
    case "pruning_after":
      return "pruning_assessment";
    case "damage":
      return "damage_or_anomaly";
    default:
      return "general_tree_review";
  }
}

function resolveProvider(requested: AnalysisProvider | "auto" | undefined): AnalysisProvider {
  if (!requested || requested === "auto") {
    return isVisionConfigured() ? "external_vision_model" : "local_heuristic";
  }
  return requested;
}

/**
 * Insert a queued job + persist its result. If `bytes` is provided we use it directly;
 * otherwise we re-download from object storage.
 */
export async function runAnalysisForMedia(args: {
  mediaId: number;
  provider?: AnalysisProvider | "auto";
  context?: AnalysisContext;
  batchId?: number | null;
  preFetchedBytes?: Buffer | null;
  force?: boolean;
}): Promise<{ job: PhotoAnalysisJob; result: PhotoAnalysisResult | null }> {
  const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, args.mediaId));
  if (!media) throw new Error(`Media ${args.mediaId} not found`);

  // If a successful result already exists and we're not forcing, return it.
  if (!args.force) {
    const [existingResult] = await db
      .select()
      .from(photoAnalysisResultsTable)
      .where(eq(photoAnalysisResultsTable.mediaId, args.mediaId))
      .orderBy(desc(photoAnalysisResultsTable.createdAt))
      .limit(1);
    if (existingResult) {
      const [existingJob] = await db
        .select()
        .from(photoAnalysisJobsTable)
        .where(eq(photoAnalysisJobsTable.id, existingResult.jobId));
      if (existingJob && existingJob.status === "succeeded") {
        return { job: existingJob, result: existingResult };
      }
    }
  }

  const provider = resolveProvider(args.provider);
  const context = args.context ?? pickContextFromPurpose(media.purpose);

  const [job] = await db
    .insert(photoAnalysisJobsTable)
    .values({
      mediaId: media.id,
      batchId: args.batchId ?? null,
      provider,
      context,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const buffer = args.preFetchedBytes ?? (await downloadObjectBytes(media.fileUrl));
    const heuristic = await runLocalHeuristic(buffer);

    let visionAnalysis: VisionAnalysis | null = null;
    let raw: unknown = null;
    if (provider === "external_vision_model") {
      try {
        const treeRow =
          media.treeId != null
            ? await db.select({ code: treesTable.treeCode }).from(treesTable).where(eq(treesTable.id, media.treeId)).limit(1)
            : [];
        const groveRow =
          media.groveId != null
            ? await db.select({ name: grovesTable.name }).from(grovesTable).where(eq(grovesTable.id, media.groveId)).limit(1)
            : [];
        const result = await analyzeWithVisionModel({
          imageBuffer: buffer,
          contentType: media.contentType ?? "image/jpeg",
          context,
          hints: {
            treeCode: treeRow[0]?.code,
            groveName: groveRow[0]?.name,
            purpose: media.purpose ?? undefined,
          },
        });
        visionAnalysis = result.analysis;
        raw = result.raw;
      } catch (err) {
        // Soft fallback to heuristic-only result, log error in job notes.
        await db
          .update(photoAnalysisJobsTable)
          .set({
            errorMessage: `vision_model_failed: ${(err as Error).message}`.slice(0, 500),
          })
          .where(eq(photoAnalysisJobsTable.id, job.id));
      }
    } else if (provider === "manual_only") {
      visionAnalysis = null;
    }

    const [result] = await db
      .insert(photoAnalysisResultsTable)
      .values({
        jobId: job.id,
        mediaId: media.id,
        treeId: media.treeId,
        groveId: media.groveId,
        provider,
        context,
        imageQuality: heuristic.imageQuality,
        blurScore: heuristic.blurScore,
        brightnessScore: heuristic.brightnessScore,
        widthPx: heuristic.widthPx,
        heightPx: heuristic.heightPx,
        canopyDensity: visionAnalysis?.canopyDensity ?? null,
        canopyGreennessScore: visionAnalysis?.canopyGreennessScore ?? null,
        yellowingSignal: visionAnalysis?.yellowingSignal ?? null,
        droughtStressVisualSignal: visionAnalysis?.droughtStressVisualSignal ?? null,
        pruningNeedSignal: visionAnalysis?.pruningNeedSignal ?? null,
        fruitMaturityVisualEstimate: visionAnalysis?.fruitMaturityVisualEstimate ?? null,
        fruitDamageSignal: visionAnalysis?.fruitDamageSignal ?? null,
        understoryVisualSignal: visionAnalysis?.understoryVisualSignal ?? null,
        trunkConditionSignal: visionAnalysis?.trunkConditionSignal ?? null,
        rootExposureSignal: visionAnalysis?.rootExposureSignal ?? null,
        terraceConditionSignal: visionAnalysis?.terraceConditionSignal ?? null,
        possiblePestOrDiseaseCues: visionAnalysis?.possiblePestOrDiseaseCues ?? [],
        summary:
          visionAnalysis?.summary ??
          (provider === "manual_only"
            ? "Manual-only mode — awaiting field worker / manager notes."
            : "Local image-quality check only. No vision model was used; treat any concerns from this image as requiring field verification."),
        limitations:
          visionAnalysis?.limitations ??
          (provider === "manual_only"
            ? "No automated visual analysis was performed."
            : "A single photo and basic image-quality heuristics cannot confirm pest, disease, drought, or maturity. Field verification required for any action."),
        recommendedFollowUp: visionAnalysis?.recommendedFollowUp ?? null,
        recommendedTaskType: visionAnalysis?.recommendedTaskType ?? null,
        confidenceScore: visionAnalysis?.confidenceScore ?? null,
        needsFieldVerification: visionAnalysis?.needsFieldVerification ?? "yes",
        rawJson: raw as never,
      })
      .returning();

    const [finalJob] = await db
      .update(photoAnalysisJobsTable)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(photoAnalysisJobsTable.id, job.id))
      .returning();

    if (args.batchId) {
      await db
        .update(photoBatchesTable)
        .set({
          analyzedItems: sql`${photoBatchesTable.analyzedItems} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(photoBatchesTable.id, args.batchId));
    }

    return { job: finalJob, result };
  } catch (err) {
    const [failedJob] = await db
      .update(photoAnalysisJobsTable)
      .set({
        status: "failed",
        errorMessage: ((err as Error).message ?? "unknown").slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(photoAnalysisJobsTable.id, job.id))
      .returning();
    return { job: failedJob, result: null };
  }
}

export async function enrichResults(rows: PhotoAnalysisResult[]) {
  if (rows.length === 0) return [];
  const mediaIds = Array.from(new Set(rows.map((r) => r.mediaId)));
  const treeIds = Array.from(new Set(rows.map((r) => r.treeId).filter((v): v is number => v != null)));
  const groveIds = Array.from(new Set(rows.map((r) => r.groveId).filter((v): v is number => v != null)));

  const [mediaRows, trees, groves] = await Promise.all([
    db.select().from(mediaTable).where(inArray(mediaTable.id, mediaIds)),
    treeIds.length
      ? db.select({ id: treesTable.id, code: treesTable.treeCode }).from(treesTable).where(inArray(treesTable.id, treeIds))
      : Promise.resolve([] as { id: number; code: string }[]),
    groveIds.length
      ? db.select({ id: grovesTable.id, name: grovesTable.name }).from(grovesTable).where(inArray(grovesTable.id, groveIds))
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);

  const { enrichMediaRows } = await import("./photoLibrary");
  const enrichedMedia = await enrichMediaRows(mediaRows);
  const mediaMap = new Map(enrichedMedia.map((m) => [m.id, m]));
  const treeMap = new Map(trees.map((t) => [t.id, t.code]));
  const groveMap = new Map(groves.map((g) => [g.id, g.name]));

  return rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    mediaId: r.mediaId,
    media: mediaMap.get(r.mediaId) ?? null,
    treeId: r.treeId,
    treeCode: r.treeId != null ? treeMap.get(r.treeId) ?? null : null,
    groveId: r.groveId,
    groveName: r.groveId != null ? groveMap.get(r.groveId) ?? null : null,
    provider: r.provider,
    context: r.context,
    imageQuality: r.imageQuality,
    blurScore: r.blurScore,
    brightnessScore: r.brightnessScore,
    widthPx: r.widthPx,
    heightPx: r.heightPx,
    canopyDensity: r.canopyDensity,
    canopyGreennessScore: r.canopyGreennessScore,
    yellowingSignal: r.yellowingSignal,
    droughtStressVisualSignal: r.droughtStressVisualSignal,
    pruningNeedSignal: r.pruningNeedSignal,
    fruitMaturityVisualEstimate: r.fruitMaturityVisualEstimate,
    fruitDamageSignal: r.fruitDamageSignal,
    understoryVisualSignal: r.understoryVisualSignal,
    trunkConditionSignal: r.trunkConditionSignal,
    rootExposureSignal: r.rootExposureSignal,
    terraceConditionSignal: r.terraceConditionSignal,
    possiblePestOrDiseaseCues: (r.possiblePestOrDiseaseCues as never) ?? [],
    summary: r.summary,
    limitations: r.limitations,
    recommendedFollowUp: r.recommendedFollowUp,
    recommendedTaskType: r.recommendedTaskType,
    confidenceScore: r.confidenceScore,
    needsFieldVerification: r.needsFieldVerification,
    reviewStatus: r.reviewStatus,
    reviewedByUserId: r.reviewedByUserId,
    reviewedAt: toIso(r.reviewedAt),
    reviewNotes: r.reviewNotes,
    createdTaskId: r.createdTaskId,
    linkedHeritageRuleId: r.linkedHeritageRuleId,
    linkedRuleEvidenceId: r.linkedRuleEvidenceId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function recountBatch(batchId: number): Promise<void> {
  // Maintain counts on parent batch
  const items = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(photoBatchItemsTable)
    .where(eq(photoBatchItemsTable.batchId, batchId));
  const total = items[0]?.count ?? 0;

  const analyzed = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(photoAnalysisJobsTable)
    .where(and(eq(photoAnalysisJobsTable.batchId, batchId), eq(photoAnalysisJobsTable.status, "succeeded")));

  await db
    .update(photoBatchesTable)
    .set({
      totalItems: total,
      analyzedItems: analyzed[0]?.count ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(photoBatchesTable.id, batchId));
}

export { isVisionConfigured };
