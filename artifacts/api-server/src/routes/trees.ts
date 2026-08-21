import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  treesTable,
  grovesTable,
  treeSatelliteObservationsTable,
  fieldVisitsTable,
  tasksTable,
  harvestEventsTable,
  mediaTable,
  photoAnalysisResultsTable,
} from "@workspace/db";
import { eq, and, like, inArray, SQL, desc, sql } from "drizzle-orm";
import {
  ListTreesQueryParams,
  CreateTreeBody,
  GetTreeParams,
  UpdateTreeParams,
  UpdateTreeBody,
  GetTreeTimelineParams,
  GetTreeObservationsParams,
  GetTreesMapDataQueryParams,
} from "@workspace/api-zod";
import { toPublicMediaUrl } from "../lib/photoLibrary";

const router: IRouter = Router();

router.get("/trees", async (req, res) => {
  const query = ListTreesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { groveId, treeType, ancientStatus, verificationStatus, currentAlertStatus, search, limit, offset } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(treesTable.groveId, groveId));
  if (treeType) conditions.push(eq(treesTable.treeType, treeType));
  if (ancientStatus) conditions.push(eq(treesTable.ancientStatus, ancientStatus));
  if (verificationStatus) conditions.push(eq(treesTable.verificationStatus, verificationStatus));
  if (currentAlertStatus) conditions.push(eq(treesTable.currentAlertStatus, currentAlertStatus));
  if (search) conditions.push(like(treesTable.treeCode, `%${search}%`));
  const trees = await db.select({
    id: treesTable.id,
    treeCode: treesTable.treeCode,
    groveId: treesTable.groveId,
    groveName: grovesTable.name,
    treeType: treesTable.treeType,
    variety: treesTable.variety,
    ancientStatus: treesTable.ancientStatus,
    estimatedAgeClass: treesTable.estimatedAgeClass,
    currentHealthIndex: treesTable.currentHealthIndex,
    currentAlertStatus: treesTable.currentAlertStatus,
    verificationStatus: treesTable.verificationStatus,
    centroidLat: treesTable.centroidLat,
    centroidLon: treesTable.centroidLon,
    crownAreaM2: treesTable.crownAreaM2,
    fieldTag: treesTable.fieldTag,
  }).from(treesTable)
    .leftJoin(grovesTable, eq(treesTable.groveId, grovesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .limit(limit ?? 100)
    .offset(offset ?? 0);

  const treeIds = trees.map((t) => t.id);
  type PhotoAgg = {
    photoCount: number;
    lastPhotoAt: Date | null;
    lastPhotoThumbnailUrl: string | null;
    pendingPhotoReviewCount: number;
    needsFieldVerificationCount: number;
  };
  const aggByTree = new Map<number, PhotoAgg>();
  if (treeIds.length > 0) {
    // Single window-function query: per tree, return total photoCount,
    // the latest photo timestamp (coalesce of EXIF capturedAt and
    // uploadedAt), and the thumbnail/file URL of THAT same latest row
    // so the displayed thumbnail is always consistent with the
    // displayed "last photo" date. Pushing first-row-per-tree into SQL
    // (rn = 1) avoids streaming every media row to the app.
    const photoStats = await db.execute<{
      tree_id: number;
      photo_count: number;
      last_photo_at: Date | null;
      thumbnail_url: string | null;
      file_url: string | null;
    }>(sql`
      SELECT tree_id, photo_count, last_photo_at, thumbnail_url, file_url
      FROM (
        SELECT
          ${mediaTable.treeId} AS tree_id,
          count(*) OVER (PARTITION BY ${mediaTable.treeId})::int AS photo_count,
          max(coalesce(${mediaTable.capturedAt}, ${mediaTable.uploadedAt}))
            OVER (PARTITION BY ${mediaTable.treeId}) AS last_photo_at,
          ${mediaTable.thumbnailUrl} AS thumbnail_url,
          ${mediaTable.fileUrl} AS file_url,
          row_number() OVER (
            PARTITION BY ${mediaTable.treeId}
            ORDER BY coalesce(${mediaTable.capturedAt}, ${mediaTable.uploadedAt}) DESC NULLS LAST,
                     ${mediaTable.id} DESC
          ) AS rn
        FROM ${mediaTable}
        WHERE ${inArray(mediaTable.treeId, treeIds)}
      ) sub
      WHERE rn = 1
    `);

    // Analysis review state aggregates: how many results are still in
    // the manager review queue, and how many remain "needs field
    // verification" (excluding rejected ones, which the manager has
    // already dispositioned).
    const reviewStats = await db
      .select({
        treeId: photoAnalysisResultsTable.treeId,
        pendingPhotoReviewCount: sql<number>`count(*) filter (where ${photoAnalysisResultsTable.reviewStatus} = 'pending')::int`,
        needsFieldVerificationCount: sql<number>`count(*) filter (where ${photoAnalysisResultsTable.needsFieldVerification} = 'yes' and ${photoAnalysisResultsTable.reviewStatus} <> 'rejected')::int`,
      })
      .from(photoAnalysisResultsTable)
      .where(inArray(photoAnalysisResultsTable.treeId, treeIds))
      .groupBy(photoAnalysisResultsTable.treeId);

    for (const s of photoStats.rows) {
      if (s.tree_id == null) continue;
      aggByTree.set(s.tree_id, {
        photoCount: Number(s.photo_count ?? 0),
        lastPhotoAt: s.last_photo_at ?? null,
        lastPhotoThumbnailUrl: toPublicMediaUrl(s.thumbnail_url ?? s.file_url ?? null),
        pendingPhotoReviewCount: 0,
        needsFieldVerificationCount: 0,
      });
    }
    for (const r of reviewStats) {
      if (r.treeId == null) continue;
      const existing = aggByTree.get(r.treeId) ?? {
        photoCount: 0,
        lastPhotoAt: null,
        lastPhotoThumbnailUrl: null,
        pendingPhotoReviewCount: 0,
        needsFieldVerificationCount: 0,
      };
      existing.pendingPhotoReviewCount = Number(r.pendingPhotoReviewCount ?? 0);
      existing.needsFieldVerificationCount = Number(r.needsFieldVerificationCount ?? 0);
      aggByTree.set(r.treeId, existing);
    }
  }

  const enriched = trees.map((t) => {
    const a = aggByTree.get(t.id);
    return {
      ...t,
      photoCount: a?.photoCount ?? 0,
      lastPhotoAt: a?.lastPhotoAt ?? null,
      lastPhotoThumbnailUrl: a?.lastPhotoThumbnailUrl ?? null,
      pendingPhotoReviewCount: a?.pendingPhotoReviewCount ?? 0,
      needsFieldVerificationCount: a?.needsFieldVerificationCount ?? 0,
    };
  });
  const total = enriched.length;
  res.json({ trees: enriched, total, limit: limit ?? 100, offset: offset ?? 0 });
});

router.post("/trees", async (req, res) => {
  const principal = await (await import("../lib/auth")).resolvePrincipal(req);
  if (!principal || principal.kind !== "manager") {
    res.status(403).json({ error: "Manager session required" });
    return;
  }
  const body = CreateTreeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [tree] = await db.insert(treesTable).values(body.data).returning();
  res.status(201).json(tree);
});

router.get("/trees/map-data", async (req, res) => {
  const query = GetTreesMapDataQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { groveId } = query.data;
  const conditions: SQL[] = [];
  if (groveId) conditions.push(eq(treesTable.groveId, groveId));
  const trees = await db.select({
    id: treesTable.id,
    treeCode: treesTable.treeCode,
    groveId: treesTable.groveId,
    centroidLat: treesTable.centroidLat,
    centroidLon: treesTable.centroidLon,
    currentHealthIndex: treesTable.currentHealthIndex,
    currentAlertStatus: treesTable.currentAlertStatus,
    ancientStatus: treesTable.ancientStatus,
    verificationStatus: treesTable.verificationStatus,
  }).from(treesTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(trees);
});

router.get("/trees/:id", async (req, res) => {
  const params = GetTreeParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [tree] = await db.select().from(treesTable).where(eq(treesTable.id, params.data.id));
  if (!tree) { res.status(404).json({ error: "Not found" }); return; }
  const [grove] = await db.select({ groveCode: grovesTable.groveCode, name: grovesTable.name }).from(grovesTable).where(eq(grovesTable.id, tree.groveId));
  res.json({ ...tree, grove });
});

router.patch("/trees/:id", async (req, res) => {
  const principal = await (await import("../lib/auth")).resolvePrincipal(req);
  if (!principal || principal.kind !== "manager") {
    res.status(403).json({ error: "Manager session required" });
    return;
  }
  const params = UpdateTreeParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateTreeBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(treesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(treesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/trees/:id", async (req, res) => {
  const principal = await (await import("../lib/auth")).resolvePrincipal(req);
  if (!principal || principal.kind !== "manager") {
    res.status(403).json({ error: "Manager session required" });
    return;
  }
  const params = GetTreeParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = params.data.id;
  // Detach media so foreign-key references don't block delete; the photos
  // stay in the library but are no longer associated with the removed tree.
  await db.update(mediaTable).set({ treeId: null }).where(eq(mediaTable.treeId, id));
  const deleted = await db.delete(treesTable).where(eq(treesTable.id, id)).returning({ id: treesTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.get("/trees/:id/timeline", async (req, res) => {
  const params = GetTreeTimelineParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = params.data.id;
  const observations = await db.select().from(treeSatelliteObservationsTable).where(eq(treeSatelliteObservationsTable.treeId, id)).orderBy(desc(treeSatelliteObservationsTable.observationDate)).limit(20);
  const visits = await db.select().from(fieldVisitsTable).where(eq(fieldVisitsTable.treeId, id)).orderBy(desc(fieldVisitsTable.visitDate)).limit(20);
  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.treeId as any, id)).orderBy(desc(tasksTable.createdAt)).limit(10);
  const harvestEvents = await db.select().from(harvestEventsTable).where(eq(harvestEventsTable.treeId, id)).orderBy(desc(harvestEventsTable.harvestDate)).limit(10);
  res.json({ observations, fieldVisits: visits, tasks, harvestEvents });
});

router.get("/trees/:id/observations", async (req, res) => {
  const params = GetTreeObservationsParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const observations = await db.select().from(treeSatelliteObservationsTable).where(eq(treeSatelliteObservationsTable.treeId, params.data.id)).orderBy(desc(treeSatelliteObservationsTable.observationDate));
  res.json(observations);
});

export default router;
