import { Router, type IRouter, type Request, type Response } from "express";
import { resolvePrincipal, type Principal } from "../lib/auth";
import {
  FinalizePhotoUploadBody,
  ListPhotosQueryParams,
  GetTreePhotoTimelineParams,
  RelinkPhotosBody,
  SweepPendingPhotosBody,
  BulkLinkPhotosBody,
} from "@workspace/api-zod";
import {
  db,
  mediaTable,
  photoAnalysisResultsTable,
  photoBatchesTable,
  photoBatchItemsTable,
  type Media,
  type PhotoAnalysisResult,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  enrichMediaRows,
  ingestUploadedPhoto,
  listLibraryMedia,
  PENDING_RELINK_MAP,
  syncLegacyHarvestFieldsForMedia,
  sweepAbandonedPendingPhotos,
  autoMatchUnlinkedPhotosByGps,
  bulkLinkPhotos,
} from "../lib/photoLibrary";
import { runAnalysisForMedia, enrichResults, recountBatch } from "../lib/photoAnalysis";

const router: IRouter = Router();

async function withLatestAnalysis(items: Awaited<ReturnType<typeof enrichMediaRows>>) {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const results = await db
    .select()
    .from(photoAnalysisResultsTable)
    .where(inArray(photoAnalysisResultsTable.mediaId, ids))
    .orderBy(desc(photoAnalysisResultsTable.createdAt));
  // Pick the most recent per mediaId
  const latestByMedia = new Map<number, PhotoAnalysisResult>();
  for (const r of results) {
    if (!latestByMedia.has(r.mediaId)) latestByMedia.set(r.mediaId, r);
  }
  const enriched = await enrichResults(Array.from(latestByMedia.values()));
  const byMedia = new Map(enriched.map((e) => [e.mediaId, e]));
  return items.map((i) => ({ ...i, latestAnalysis: byMedia.get(i.id) ?? null }));
}

// Field workers and managers may both upload photos. Uploads flow into the
// analysis pipeline and are surfaced in the manager bulk-review queue, where
// managers can confirm or reject them — so there's no need to gate ingestion
// by role beyond authentication.
router.post("/photo-library/finalize-upload", async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Missing or invalid session cookie" });
    return;
  }
  const parsed = FinalizePhotoUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  if (principal.kind !== "manager" && principal.kind !== "worker") {
    res.status(403).json({ error: "Only field workers or managers may upload photos" });
    return;
  }
  if (parsed.data.batchId != null) {
    const [batch] = await db
      .select({ id: photoBatchesTable.id })
      .from(photoBatchesTable)
      .where(eq(photoBatchesTable.id, parsed.data.batchId))
      .limit(1);
    if (!batch) {
      res.status(404).json({ error: `Photo batch ${parsed.data.batchId} not found` });
      return;
    }
  }
  try {
    const body = parsed.data;
    const { mediaRow, buffer } = await ingestUploadedPhoto({
      objectPath: body.objectPath,
      originalFileName: body.originalFileName,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
      purpose: body.purpose,
      treeId: body.treeId ?? null,
      groveId: body.groveId ?? null,
      zone: body.zone ?? null,
      photoSide: body.photoSide ?? null,
      reportType: body.reportType ?? null,
      caption: body.caption ?? null,
      uploadedByUserId: principal.userId,
      linkedEntityType: body.linkedEntityType ?? null,
      linkedEntityId: body.linkedEntityId ?? null,
    });

    // If this upload belongs to a photo batch, record it as an item and bump
    // the batch's totalItems counter so the batch view reflects reality.
    if (body.batchId != null) {
      const [batch] = await db
        .select({ id: photoBatchesTable.id })
        .from(photoBatchesTable)
        .where(eq(photoBatchesTable.id, body.batchId))
        .limit(1);
      if (batch) {
        await db
          .insert(photoBatchItemsTable)
          .values({ batchId: batch.id, mediaId: mediaRow.id, orderIndex: 0 });
        await db
          .update(photoBatchesTable)
          .set({ totalItems: sql`${photoBatchesTable.totalItems} + 1`, updatedAt: new Date() })
          .where(eq(photoBatchesTable.id, batch.id));
      }
    }

    // Backward-compat: keep legacy harvest_events.pre_harvest_tree_photo_url
    // and harvest_boxes.photo_url in sync when the upload is already linked
    // to its parent (no relink needed).
    await syncLegacyHarvestFieldsForMedia([mediaRow.id]);

    // Always record an analysis job + result row, even for manual_only
    // uploads. The result row in that case captures only the local image-
    // quality heuristic (blur/brightness/dimensions) plus a "manual-only"
    // summary, so the photo timeline always has an analysis record to
    // attach reviewer notes to and the batch counters stay consistent.
    const provider = body.analysisProvider ?? "auto";
    const context = body.analysisContext;
    const job = await runAnalysisForMedia({
      mediaId: mediaRow.id,
      provider,
      context: context ?? undefined,
      batchId: body.batchId ?? null,
      preFetchedBytes: buffer.length > 0 ? buffer : null,
    });
    const enrichedResult = job.result ? (await enrichResults([job.result]))[0] ?? null : null;
    const analysis = {
      job: {
        ...job.job,
        createdAt: job.job.createdAt.toISOString(),
        startedAt: job.job.startedAt?.toISOString() ?? null,
        completedAt: job.job.completedAt?.toISOString() ?? null,
      },
      result: enrichedResult,
    };

    if (body.batchId != null) {
      // Recount keeps the analyzedItems counter accurate even if the analysis
      // was skipped/failed/etc.
      await recountBatch(body.batchId);
    }

    const [enrichedMedia] = await withLatestAnalysis(await enrichMediaRows([mediaRow]));
    res.status(201).json({ media: enrichedMedia, analysis });
  } catch (err) {
    req.log.error({ err }, "Failed to finalize upload");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Allowed reconciliation transitions for capture-first flows. Source state
// must be the matching "_pending" sentinel — this is the only way the
// relink endpoint can rewrite linkedEntityType/Id, preventing arbitrary
// reassignment of already-linked media (IDOR / data-integrity safeguard).
// Sourced from `PENDING_RELINK_MAP` so the sweeper and the relink endpoint
// can never drift apart.
const RELINK_TRANSITIONS: Record<string, string> = PENDING_RELINK_MAP;

router.post("/photo-library/photos/relink", async (req: Request, res: Response) => {
  // Workers reconcile their own captured-then-finalized photos to the
  // newly-created field-visit / harvest-event / harvest-box / task. Like
  // finalize-upload this must be a worker session — the relink rewrites
  // ownership-style fields (linkedEntityType/Id) and so cannot be exposed
  // unauthenticated.
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Missing or invalid session cookie" });
    return;
  }
  if (principal.kind !== "worker") {
    res.status(403).json({ error: "Only field workers may relink uploads" });
    return;
  }
  const parsed = RelinkPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const { mediaIds, linkedEntityType, linkedEntityId } = parsed.data;
  const expectedSource = RELINK_TRANSITIONS[linkedEntityType];
  if (!expectedSource) {
    res.status(400).json({
      error: `Unsupported linkedEntityType "${linkedEntityType}". Allowed: ${Object.keys(RELINK_TRANSITIONS).join(", ")}`,
    });
    return;
  }
  if (mediaIds.length === 0) {
    res.json({ updated: 0, requested: 0, failedIds: [] });
    return;
  }
  // IDOR gate: workers can only relink their own uploads.
  const updated = await db
    .update(mediaTable)
    .set({ linkedEntityType, linkedEntityId })
    .where(
      and(
        inArray(mediaTable.id, mediaIds),
        eq(mediaTable.linkedEntityType, expectedSource),
        eq(mediaTable.uploadedByUserId, principal.userId),
      ),
    )
    .returning({ id: mediaTable.id });
  const updatedIds = updated.map((r) => r.id);
  // Mirror to legacy harvest columns now that the parent id is finalized.
  await syncLegacyHarvestFieldsForMedia(updatedIds);
  const updatedSet = new Set(updatedIds);
  const failedIds = mediaIds.filter((id) => !updatedSet.has(id));
  res.json({ updated: updated.length, requested: mediaIds.length, failedIds });
});

// Manager-only helper.
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

// Manager-only: estate-wide photo metadata + latest analysis.
router.get("/photo-library/photos", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const parsed = ListPhotosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const rows = await listLibraryMedia({
    treeId: parsed.data.treeId ?? undefined,
    groveId: parsed.data.groveId ?? undefined,
    purpose: parsed.data.purpose ?? undefined,
    matchStatus: parsed.data.matchStatus ?? undefined,
    unlinked: parsed.data.unlinked ?? undefined,
    limit: parsed.data.limit ?? 100,
  });
  const enriched = await enrichMediaRows(rows);
  const withAnalysis = await withLatestAnalysis(enriched);
  res.json(withAnalysis);
});

// Manager-only: sweep abandoned "*_pending" photos older than the configured
// TTL. Workers tag uploads with a "<entity>_pending" sentinel before the
// parent record (visit, harvest event, harvest box, task) exists; the relink
// endpoint rewrites that sentinel after the parent is created. Anything that
// stays pending past the TTL is treated as abandoned (worker dropped the
// form, app crashed, etc.) and removed from object storage + the DB. A
// background scheduler also calls this same path; the endpoint is for manual
// / on-demand invocation by managers (e.g. dashboard "clean up now" button).
router.post("/photo-library/sweep-pending", async (req: Request, res: Response) => {
  const principal = await requireManager(req, res);
  if (!principal) return;
  const parsed = SweepPendingPhotosBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await sweepAbandonedPendingPhotos({
      ttlHours: parsed.data.ttlHours ?? null,
      dryRun: parsed.data.dryRun ?? false,
      triggeredByUserId: principal.userId,
      log: req.log,
    });
    res.json({
      ttlHours: result.ttlHours,
      cutoff: result.cutoff.toISOString(),
      dryRun: result.dryRun,
      scanned: result.scanned,
      deletedMediaIds: result.deletedMediaIds,
      storageDeletedCount: result.storageDeletedCount,
      storageFailedCount: result.storageFailedCount,
    });
  } catch (err) {
    req.log.error({ err }, "Pending photo sweep failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Manager-only: re-run GPS auto-match across previously-uploaded photos
// that have GPS data but no treeId. Body shape:
//   { dryRun?: boolean, limit?: number }
// Returns the matches it would have / did make.
router.post("/photo-library/auto-match-by-gps", async (req: Request, res: Response) => {
  const principal = await requireManager(req, res);
  if (!principal) return;
  const body = (req.body ?? {}) as { dryRun?: unknown; limit?: unknown };
  const dryRun = body.dryRun === true;
  const limitRaw = typeof body.limit === "number" ? body.limit : undefined;
  try {
    const result = await autoMatchUnlinkedPhotosByGps({
      dryRun,
      limit: limitRaw,
      triggeredByUserId: principal.userId,
      log: req.log,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Photo GPS auto-match backfill failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Manager-only manual recovery: bulk-link a set of photos to a tree (and/or
// grove). Used by the photo library "Unlinked — no GPS" rescue flow for
// WhatsApp-stripped JPEGs and other photos auto-match could never resolve.
router.post("/photo-library/photos/bulk-link", async (req: Request, res: Response) => {
  const principal = await requireManager(req, res);
  if (!principal) return;
  const parsed = BulkLinkPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.treeId == null && parsed.data.groveId == null) {
    res.status(400).json({ error: "Provide treeId, groveId, or both" });
    return;
  }
  try {
    const result = await bulkLinkPhotos({
      mediaIds: parsed.data.mediaIds,
      treeId: parsed.data.treeId ?? null,
      groveId: parsed.data.groveId ?? null,
      triggeredByUserId: principal.userId,
      log: req.log,
    });
    // Keep legacy harvest mirror cols consistent if any of the updated rows
    // were attached to a harvest event/box (rare here but cheap to call).
    await syncLegacyHarvestFieldsForMedia(result.updatedIds);
    const enriched = await enrichMediaRows(result.updated);
    res.json({
      updated: enriched.length,
      requested: parsed.data.mediaIds.length,
      failedIds: result.failedIds,
      photos: enriched,
    });
  } catch (err) {
    req.log.error({ err }, "Photo bulk-link failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Manager-only: per-tree photo timeline (review surface).
router.get("/photo-library/trees/:treeId/timeline", async (req: Request, res: Response) => {
  if (!(await requireManager(req, res))) return;
  const parsed = GetTreePhotoTimelineParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid path param" });
    return;
  }
  const treeId = parsed.data.treeId;
  const rows = await db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.treeId, treeId))
    .orderBy(desc(mediaTable.uploadedAt))
    .limit(200);
  const enriched = await enrichMediaRows(rows);
  const withAnalysis = await withLatestAnalysis(enriched);
  res.json(withAnalysis);
});

export default router;
