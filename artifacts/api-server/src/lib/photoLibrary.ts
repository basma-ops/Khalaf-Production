import {
  db,
  mediaTable,
  treesTable,
  grovesTable,
  usersTable,
  harvestEventsTable,
  harvestBoxesTable,
  auditEventsTable,
  photoBatchItemsTable,
  photoAnalysisJobsTable,
  photoAnalysisResultsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, lt, isNotNull, sql, type SQL } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { runLocalHeuristic } from "@workspace/photo-analysis";
import exifr from "exifr";
import type { Logger } from "pino";

/**
 * Pull GPS + capture timestamp out of a HEIC/HEIF buffer without going through
 * sharp. Sharp's HEIF decoder requires libheif compiled with a HEVC plugin,
 * which the prebuilt Replit binary does not ship; calling `sharp().toBuffer()`
 * on an iPhone HEIC there throws "Support for this compression format has not
 * been built in". exifr parses the HEIC container directly, so we use it
 * standalone for the auto-match backfill where decoding the pixels is
 * unnecessary.
 */
async function extractHeicGpsAndDate(
  buffer: Buffer,
): Promise<{ gpsLat: number | null; gpsLon: number | null; capturedAt: Date | null }> {
  const parsed = (await exifr.parse(buffer, {
    gps: true,
    tiff: true,
    xmp: true,
    ifd0: true,
    exif: true,
  } as unknown as Parameters<typeof exifr.parse>[1])) as
    | {
        latitude?: unknown;
        longitude?: unknown;
        DateTimeOriginal?: unknown;
        CreateDate?: unknown;
        DateTime?: unknown;
      }
    | undefined;
  let gpsLat: number | null = null;
  let gpsLon: number | null = null;
  let capturedAt: Date | null = null;
  if (parsed) {
    if (typeof parsed.latitude === "number" && Number.isFinite(parsed.latitude)) {
      gpsLat = parsed.latitude;
    }
    if (typeof parsed.longitude === "number" && Number.isFinite(parsed.longitude)) {
      gpsLon = parsed.longitude;
    }
    const dt = parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.DateTime;
    if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
      capturedAt = dt;
    } else if (typeof dt === "string") {
      const d = new Date(dt);
      if (!Number.isNaN(d.getTime())) capturedAt = d;
    }
  }
  return { gpsLat, gpsLon, capturedAt };
}

const objectStorageService = new ObjectStorageService();

/**
 * Convert an internal `/objects/...` path (used everywhere in the DB) into the
 * publicly-served URL prefix `/api/storage/objects/...` so `<img src=…>` works
 * directly in the manager/field UIs (proxy strips no path segments).
 *
 * Already-public URLs (`/api/storage/...`, `http(s)://`, data URIs) are returned
 * unchanged so older media rows or external uploads still work.
 */
export function toPublicMediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  return value;
}

/**
 * Download an object from storage by its `/objects/...` path and return its bytes.
 */
export async function downloadObjectBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Upload a buffer (e.g. a generated thumbnail) to a derived path under PRIVATE_OBJECT_DIR
 * and return the normalized `/objects/...` path.
 */
export async function uploadDerivedObject(
  baseObjectPath: string,
  suffix: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const { objectStorageClient } = await import("./objectStorage");
  if (!baseObjectPath.startsWith("/objects/")) return null;
  const id = baseObjectPath.slice("/objects/".length);
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) return null;
  const fullPath = `${privateDir.replace(/\/$/, "")}/${suffix}/${id}.jpg`;
  const trimmed = fullPath.replace(/^\//, "");
  const slash = trimmed.indexOf("/");
  const bucketName = trimmed.slice(0, slash);
  const objectName = trimmed.slice(slash + 1);
  const bucket = objectStorageClient.bucket(bucketName);
  await bucket.file(objectName).save(buffer, { contentType, resumable: false });
  return `/objects/${suffix}/${id}.jpg`;
}

export type MediaRow = typeof mediaTable.$inferSelect;

/**
 * Photo→tree GPS auto-match radius. Olive trees in our groves are typically
 * 6–10 m apart, so ~25 m gives a comfortable margin for consumer-phone GPS
 * accuracy (~5–15 m) without wandering onto a neighbouring tree.
 *
 * Override at runtime with `PHOTO_GPS_MATCH_RADIUS_M` (positive number).
 */
export const DEFAULT_PHOTO_GPS_MATCH_RADIUS_M = 25;

function resolvePhotoGpsMatchRadius(): number {
  const raw = process.env["PHOTO_GPS_MATCH_RADIUS_M"]?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_PHOTO_GPS_MATCH_RADIUS_M;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Find the closest mapped tree (by `centroidLat`/`centroidLon`) to a given
 * GPS coordinate, within `maxMeters`. Returns `null` if no tree is within
 * range or none have GPS data.
 *
 * Uses a small lat/lon bounding-box prefilter (cheap, index-friendly) and
 * then computes precise haversine distance on the candidates. Ties are
 * resolved by lower id (deterministic).
 */
export async function findNearestTreeByGps(
  lat: number,
  lon: number,
  maxMeters: number = resolvePhotoGpsMatchRadius(),
): Promise<{ id: number; groveId: number; distanceMeters: number } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // 1° lat ≈ 111 320 m; 1° lon ≈ 111 320 m * cos(lat).
  const latPad = maxMeters / 111_320;
  const lonPad = maxMeters / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

  const candidates = await db
    .select({
      id: treesTable.id,
      groveId: treesTable.groveId,
      lat: treesTable.centroidLat,
      lon: treesTable.centroidLon,
    })
    .from(treesTable)
    .where(
      and(
        isNotNull(treesTable.centroidLat),
        isNotNull(treesTable.centroidLon),
        // Bounding-box prefilter — keeps us O(neighbours) rather than O(estate).
        sql`${treesTable.centroidLat} BETWEEN ${lat - latPad} AND ${lat + latPad}`,
        sql`${treesTable.centroidLon} BETWEEN ${lon - lonPad} AND ${lon + lonPad}`,
      ),
    );

  let best: { id: number; groveId: number; distanceMeters: number } | null = null;
  for (const t of candidates) {
    if (t.lat == null || t.lon == null) continue;
    const d = haversineMeters(lat, lon, t.lat, t.lon);
    if (d > maxMeters) continue;
    if (!best || d < best.distanceMeters || (d === best.distanceMeters && t.id < best.id)) {
      best = { id: t.id, groveId: t.groveId, distanceMeters: d };
    }
  }
  return best;
}

/**
 * Photo auto-link diagnostic states recorded on every ingestion. Surfaced
 * to the manager Photo Library so triage of unlinked uploads doesn't
 * require inspecting the raw EXIF.
 *
 *  - `linked_explicit`     — the upload payload supplied a treeId.
 *  - `linked_gps`          — EXIF GPS resolved to a tree within the radius.
 *  - `unlinked_no_gps`     — EXIF had no usable lat/lon (HEIC w/o GPS,
 *                            WhatsApp-stripped JPEGs, screenshots, …).
 *  - `unlinked_no_match`   — GPS present but no tree within the radius.
 *  - `unlinked_exif_error` — sharp/exif/exifr blew up before we could decide.
 */
export const PHOTO_MATCH_STATUSES = [
  "linked_explicit",
  "linked_gps",
  "unlinked_no_gps",
  "unlinked_no_match",
  "unlinked_exif_error",
] as const;
export type PhotoMatchStatus = (typeof PHOTO_MATCH_STATUSES)[number];

export interface PhotoLibraryItemShape {
  id: number;
  entityType: string;
  entityId: number;
  fileUrl: string;
  thumbnailUrl: string | null;
  purpose: string;
  treeId: number | null;
  treeCode: string | null;
  groveId: number | null;
  groveName: string | null;
  zone: string | null;
  capturedAt: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  originalFileName: string | null;
  contentType: string | null;
  fileSizeBytes: number | null;
  widthPx: number | null;
  heightPx: number | null;
  caption: string | null;
  photoSide: string | null;
  reportType: string | null;
  uploadedAt: string;
  uploadedByUserId: number | null;
  uploadedByName: string | null;
  linkedEntityType: string | null;
  linkedEntityId: number | null;
}

export async function enrichMediaRows(rows: MediaRow[]): Promise<PhotoLibraryItemShape[]> {
  if (rows.length === 0) return [];
  const treeIds = Array.from(new Set(rows.map((r) => r.treeId).filter((v): v is number => v != null)));
  const groveIds = Array.from(new Set(rows.map((r) => r.groveId).filter((v): v is number => v != null)));
  const userIds = Array.from(new Set(rows.map((r) => r.uploadedByUserId).filter((v): v is number => v != null)));

  const [trees, groves, users] = await Promise.all([
    treeIds.length > 0
      ? db.select({ id: treesTable.id, code: treesTable.treeCode }).from(treesTable).where(inArray(treesTable.id, treeIds))
      : Promise.resolve([] as { id: number; code: string }[]),
    groveIds.length > 0
      ? db.select({ id: grovesTable.id, name: grovesTable.name }).from(grovesTable).where(inArray(grovesTable.id, groveIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    userIds.length > 0
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);

  const treeMap = new Map(trees.map((t) => [t.id, t.code]));
  const groveMap = new Map(groves.map((g) => [g.id, g.name]));
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    matchStatus: r.matchStatus ?? null,
    entityType: r.entityType,
    entityId: r.entityId,
    fileUrl: toPublicMediaUrl(r.fileUrl) ?? r.fileUrl,
    thumbnailUrl: toPublicMediaUrl(r.thumbnailUrl),
    purpose: r.purpose ?? "general",
    treeId: r.treeId,
    treeCode: r.treeId != null ? treeMap.get(r.treeId) ?? null : null,
    groveId: r.groveId,
    groveName: r.groveId != null ? groveMap.get(r.groveId) ?? null : null,
    zone: r.zone,
    photoSide: r.photoSide,
    reportType: r.reportType,
    capturedAt: r.capturedAt ? r.capturedAt.toISOString() : null,
    gpsLat: r.gpsLat,
    gpsLon: r.gpsLon,
    originalFileName: r.originalFileName,
    contentType: r.contentType,
    fileSizeBytes: r.fileSizeBytes,
    widthPx: r.widthPx,
    heightPx: r.heightPx,
    caption: r.caption,
    uploadedAt: r.uploadedAt.toISOString(),
    uploadedByUserId: r.uploadedByUserId,
    uploadedByName: r.uploadedByUserId != null ? userMap.get(r.uploadedByUserId) ?? null : null,
    linkedEntityType: r.linkedEntityType,
    linkedEntityId: r.linkedEntityId,
  }));
}

/**
 * Persist initial Media row + run sharp/exif heuristic and update with EXIF + thumbnail.
 * Returns the enriched media row (without analysis).
 */
export async function ingestUploadedPhoto(args: {
  objectPath: string;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  purpose: string;
  treeId: number | null;
  groveId: number | null;
  zone: string | null;
  photoSide: string | null;
  reportType: string | null;
  caption: string | null;
  uploadedByUserId: number | null;
  linkedEntityType: string | null;
  linkedEntityId: number | null;
}): Promise<{
  mediaRow: MediaRow;
  buffer: Buffer;
  heuristic: {
    thumbnailBuffer: Buffer | null;
    gpsLat: number | null;
    gpsLon: number | null;
    capturedAt: Date | null;
    widthPx: number | null;
    heightPx: number | null;
  } | null;
}> {
  // Determine entityType/entityId for back-compat with the legacy Media model
  let entityType = args.linkedEntityType ?? "library";
  let entityId = args.linkedEntityId ?? 0;
  if (entityId === 0 && args.treeId) {
    entityType = "tree";
    entityId = args.treeId;
  } else if (entityId === 0 && args.groveId) {
    entityType = "grove";
    entityId = args.groveId;
  }

  // Initial match status: explicit treeId from the caller is the strongest
  // possible signal. Everything else is decided after the EXIF probe below.
  const initialMatchStatus: PhotoMatchStatus | null =
    args.treeId != null ? "linked_explicit" : null;

  // Insert minimal row first so we always have an id even if heuristic fails
  const [initialRow] = await db
    .insert(mediaTable)
    .values({
      entityType,
      entityId,
      fileUrl: args.objectPath,
      caption: args.caption,
      uploadedByUserId: args.uploadedByUserId,
      treeId: args.treeId,
      groveId: args.groveId,
      zone: args.zone,
      photoSide: args.photoSide,
      reportType: args.reportType,
      purpose: args.purpose,
      originalFileName: args.originalFileName,
      contentType: args.contentType,
      fileSizeBytes: args.fileSizeBytes,
      linkedEntityType: args.linkedEntityType,
      linkedEntityId: args.linkedEntityId,
      matchStatus: initialMatchStatus,
    })
    .returning();

  let buffer: Buffer;
  try {
    buffer = await downloadObjectBytes(args.objectPath);
  } catch {
    // Storage fetch failed → we can't probe EXIF. Mark the upload so the
    // manager can see why it never auto-linked (only if not already
    // linked_explicit, which wins).
    if (initialMatchStatus == null) {
      const [withStatus] = await db
        .update(mediaTable)
        .set({ matchStatus: "unlinked_exif_error" satisfies PhotoMatchStatus })
        .where(eq(mediaTable.id, initialRow.id))
        .returning();
      return { mediaRow: withStatus ?? initialRow, buffer: Buffer.alloc(0), heuristic: null };
    }
    return { mediaRow: initialRow, buffer: Buffer.alloc(0), heuristic: null };
  }

  // Try the full local heuristic first (thumbnail + EXIF + dims via sharp).
  // For HEIC/HEIF in this environment sharp's HEIF decoder is unavailable
  // (libheif missing HEVC plugin), so we fall back to a thumbnail-less
  // exifr-only path that still recovers GPS + capture timestamp so the
  // upload can auto-link to a tree.
  type HeuristicShape = {
    thumbnailBuffer: Buffer | null;
    gpsLat: number | null;
    gpsLon: number | null;
    capturedAt: Date | null;
    widthPx: number | null;
    heightPx: number | null;
  };
  let heuristic: HeuristicShape | null = null;
  try {
    const h = await runLocalHeuristic(buffer);
    heuristic = {
      thumbnailBuffer: h.thumbnailBuffer,
      gpsLat: h.gpsLat,
      gpsLon: h.gpsLon,
      capturedAt: h.capturedAt,
      widthPx: h.widthPx,
      heightPx: h.heightPx,
    };
  } catch {
    const ct = (args.contentType ?? "").toLowerCase();
    const looksHeic =
      ct === "image/heic" ||
      ct === "image/heif" ||
      (args.originalFileName ?? "").toLowerCase().match(/\.(heic|heif)$/) != null;
    if (looksHeic) {
      try {
        const exif = await extractHeicGpsAndDate(buffer);
        heuristic = {
          thumbnailBuffer: null,
          gpsLat: exif.gpsLat,
          gpsLon: exif.gpsLon,
          capturedAt: exif.capturedAt,
          widthPx: null,
          heightPx: null,
        };
      } catch {
        heuristic = null;
      }
    }
    if (heuristic == null) {
      if (initialMatchStatus == null) {
        const [withStatus] = await db
          .update(mediaTable)
          .set({ matchStatus: "unlinked_exif_error" satisfies PhotoMatchStatus })
          .where(eq(mediaTable.id, initialRow.id))
          .returning();
        return { mediaRow: withStatus ?? initialRow, buffer, heuristic: null };
      }
      return { mediaRow: initialRow, buffer, heuristic: null };
    }
  }

  // Upload thumbnail (only if we actually produced one — HEIC fallback has none)
  let thumbnailUrl: string | null = null;
  if (heuristic.thumbnailBuffer) {
    try {
      thumbnailUrl = await uploadDerivedObject(args.objectPath, "thumbnails", heuristic.thumbnailBuffer, "image/jpeg");
    } catch {
      /* ignore */
    }
  }

  // GPS auto-match: if the upload didn't already point at a specific tree
  // (e.g. bulk import from the manager), and the photo has GPS EXIF data,
  // resolve it to the nearest mapped tree so the manager doesn't have to
  // hand-link every photo. We also inherit the matched tree's grove when
  // groveId wasn't supplied. Existing explicit treeId / groveId values on
  // the upload payload always win.
  let resolvedTreeId: number | null = args.treeId;
  let resolvedGroveId: number | null = args.groveId;
  let matchedDistanceM: number | null = null;
  // Decide diagnostic match status. linked_explicit (the caller already
  // bound a tree) wins outright; otherwise we record exactly why the
  // auto-link did or didn't fire so the manager can triage in the
  // photo library without inspecting raw EXIF.
  let matchStatus: PhotoMatchStatus =
    initialMatchStatus ?? "unlinked_no_gps";
  if (
    resolvedTreeId == null &&
    heuristic.gpsLat != null &&
    heuristic.gpsLon != null
  ) {
    try {
      const match = await findNearestTreeByGps(heuristic.gpsLat, heuristic.gpsLon);
      if (match) {
        resolvedTreeId = match.id;
        if (resolvedGroveId == null) resolvedGroveId = match.groveId;
        matchedDistanceM = match.distanceMeters;
        matchStatus = "linked_gps";
      } else {
        matchStatus = "unlinked_no_match";
      }
    } catch {
      /* match is best-effort; never fail the upload over it */
      matchStatus = "unlinked_exif_error";
    }
  }

  // If we discovered a tree by GPS and the row was inserted as a bare
  // "library" entry (or as a grove-scoped entry without a tree), promote
  // it to a "tree" entity so the legacy entity model + per-tree timeline
  // lookups pick it up. We only promote when the original upload payload
  // didn't specify a tree (args.treeId == null) — anything explicitly
  // pointed at a tree was already handled at insert time.
  const inferredTree = resolvedTreeId != null && args.treeId == null;
  const promotedEntity =
    inferredTree &&
    (initialRow.entityType === "library" || initialRow.entityType === "grove") &&
    resolvedTreeId != null
      ? { entityType: "tree" as const, entityId: resolvedTreeId }
      : null;

  const [updated] = await db
    .update(mediaTable)
    .set({
      thumbnailUrl,
      capturedAt: heuristic.capturedAt,
      gpsLat: heuristic.gpsLat,
      gpsLon: heuristic.gpsLon,
      widthPx: heuristic.widthPx,
      heightPx: heuristic.heightPx,
      treeId: resolvedTreeId,
      groveId: resolvedGroveId,
      matchStatus,
      ...(promotedEntity ?? {}),
    })
    .where(eq(mediaTable.id, initialRow.id))
    .returning();

  if (matchedDistanceM != null && resolvedTreeId != null) {
    await db.insert(auditEventsTable).values({
      userId: args.uploadedByUserId,
      entityType: "media",
      entityId: updated.id,
      action: "photo_gps_auto_matched",
      beforeJson: null,
      afterJson: JSON.stringify({
        treeId: resolvedTreeId,
        groveId: resolvedGroveId,
        gpsLat: heuristic.gpsLat,
        gpsLon: heuristic.gpsLon,
        distanceMeters: Number(matchedDistanceM.toFixed(2)),
      }),
    });
  }

  return { mediaRow: updated, buffer, heuristic };
}

/**
 * Re-run GPS→tree matching across existing media rows that have GPS data
 * but no treeId. Useful as a one-shot backfill after this auto-match
 * feature is shipped (rows uploaded before then never had a chance to
 * match) or when the tree map has been corrected/extended.
 */
export async function autoMatchUnlinkedPhotosByGps(opts: {
  limit?: number;
  dryRun?: boolean;
  triggeredByUserId?: number | null;
  log: Logger;
}): Promise<{
  scanned: number;
  matched: number;
  dryRun: boolean;
  matches: Array<{ mediaId: number; treeId: number; groveId: number; distanceMeters: number }>;
}> {
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5_000));
  const dryRun = opts.dryRun ?? false;

  // First: backfill EXIF for unlinked HEIC/HEIF rows that had no GPS recorded
  // at upload time. Older ingestions used `sharp`+`exif-reader` only, which
  // misses HEIC's container; re-running through `runLocalHeuristic` now
  // routes through exifr's HEIC parser and recovers the iPhone GPS coords.
  // Without this, those rows would never be picked up by the main candidate
  // query below (it requires non-null gps_lat / gps_lon).
  let reextractedHeic = 0;
  if (!dryRun) {
    const heicRows = await db
      .select({ id: mediaTable.id, fileUrl: mediaTable.fileUrl })
      .from(mediaTable)
      .where(
        and(
          sql`${mediaTable.treeId} IS NULL`,
          sql`${mediaTable.gpsLat} IS NULL`,
          inArray(mediaTable.contentType, ["image/heic", "image/heif"]),
        ),
      )
      .orderBy(desc(mediaTable.uploadedAt))
      .limit(limit);
    opts.log.info({ heicCandidates: heicRows.length }, "HEIC re-extract: candidates fetched");
    for (const row of heicRows) {
      try {
        const buf = await downloadObjectBytes(row.fileUrl);
        const h = await extractHeicGpsAndDate(buf);
        opts.log.debug(
          { mediaId: row.id, gpsLat: h.gpsLat, gpsLon: h.gpsLon, bytes: buf.length },
          "HEIC re-extract result",
        );
        if (h.gpsLat != null && h.gpsLon != null) {
          await db
            .update(mediaTable)
            .set({
              gpsLat: h.gpsLat,
              gpsLon: h.gpsLon,
              capturedAt: h.capturedAt ?? undefined,
            })
            .where(eq(mediaTable.id, row.id));
          reextractedHeic++;
        }
      } catch (err) {
        opts.log.warn(
          { err, mediaId: row.id },
          "HEIC re-extract failed during auto-match backfill",
        );
      }
    }
    if (reextractedHeic > 0) {
      opts.log.info(
        { reextractedHeic },
        "HEIC EXIF re-extracted before GPS auto-match",
      );
    }
  }

  const candidates = await db
    .select({
      id: mediaTable.id,
      lat: mediaTable.gpsLat,
      lon: mediaTable.gpsLon,
      groveId: mediaTable.groveId,
      entityType: mediaTable.entityType,
      entityId: mediaTable.entityId,
    })
    .from(mediaTable)
    .where(
      and(
        sql`${mediaTable.treeId} IS NULL`,
        isNotNull(mediaTable.gpsLat),
        isNotNull(mediaTable.gpsLon),
      ),
    )
    .orderBy(desc(mediaTable.uploadedAt))
    .limit(limit);

  const matches: Array<{ mediaId: number; treeId: number; groveId: number; distanceMeters: number }> = [];
  for (const row of candidates) {
    if (row.lat == null || row.lon == null) continue;
    const m = await findNearestTreeByGps(row.lat, row.lon);
    if (!m) continue;
    matches.push({
      mediaId: row.id,
      treeId: m.id,
      groveId: m.groveId,
      distanceMeters: Number(m.distanceMeters.toFixed(2)),
    });
    if (dryRun) continue;
    const promote =
      row.entityType === "library" || row.entityType === "grove"
        ? { entityType: "tree" as const, entityId: m.id }
        : {};
    await db
      .update(mediaTable)
      .set({
        treeId: m.id,
        groveId: row.groveId ?? m.groveId,
        matchStatus: "linked_gps" satisfies PhotoMatchStatus,
        ...promote,
      })
      .where(eq(mediaTable.id, row.id));
    // Mirror the new tree/grove onto any existing photo_analysis_results
    // for this media row so manager screens that filter analysis by tree
    // surface the auto-matched record.
    await db
      .update(photoAnalysisResultsTable)
      .set({ treeId: m.id, groveId: row.groveId ?? m.groveId })
      .where(eq(photoAnalysisResultsTable.mediaId, row.id));
    await db.insert(auditEventsTable).values({
      userId: opts.triggeredByUserId ?? null,
      entityType: "media",
      entityId: row.id,
      action: "photo_gps_auto_matched_backfill",
      beforeJson: null,
      afterJson: JSON.stringify({
        treeId: m.id,
        groveId: row.groveId ?? m.groveId,
        gpsLat: row.lat,
        gpsLon: row.lon,
        distanceMeters: Number(m.distanceMeters.toFixed(2)),
      }),
    });
  }
  opts.log.info(
    { scanned: candidates.length, matched: matches.length, dryRun, limit },
    "Photo GPS auto-match backfill complete",
  );
  return { scanned: candidates.length, matched: matches.length, dryRun, matches };
}

export async function listLibraryMedia(filters: {
  treeId?: number;
  groveId?: number;
  purpose?: string;
  matchStatus?: string;
  unlinked?: boolean;
  limit?: number;
}): Promise<MediaRow[]> {
  const conditions: SQL[] = [];
  if (filters.treeId != null) conditions.push(eq(mediaTable.treeId, filters.treeId));
  if (filters.groveId != null) conditions.push(eq(mediaTable.groveId, filters.groveId));
  if (filters.purpose) conditions.push(eq(mediaTable.purpose, filters.purpose));
  if (filters.matchStatus) conditions.push(eq(mediaTable.matchStatus, filters.matchStatus));
  if (filters.unlinked) conditions.push(sql`${mediaTable.treeId} IS NULL`);
  const q = db.select().from(mediaTable).where(conditions.length ? and(...conditions) : undefined);
  return q.orderBy(desc(mediaTable.uploadedAt)).limit(filters.limit ?? 100);
}

/**
 * Manager-only manual recovery: rewrites tree/grove on a set of unlinked
 * photos that auto-match could never recover (WhatsApp-stripped EXIF,
 * screenshots, photos taken outside any grove polygon, …). Writes one
 * audit row per updated media id so the manual override is traceable.
 *
 * Returns the IDs that were updated (a row is skipped if it doesn't
 * exist).
 */
export async function bulkLinkPhotos(args: {
  mediaIds: number[];
  treeId: number | null;
  groveId: number | null;
  triggeredByUserId: number | null;
  log: Logger;
}): Promise<{ updated: MediaRow[]; updatedIds: number[]; failedIds: number[] }> {
  if (args.mediaIds.length === 0) {
    return { updated: [], updatedIds: [], failedIds: [] };
  }
  if (args.treeId == null && args.groveId == null) {
    throw new Error("bulkLinkPhotos requires at least one of treeId or groveId");
  }

  // If treeId is given, fetch the tree's grove so the row's groveId stays
  // consistent (manager UI filters by grove and would otherwise lose the
  // photo). Explicit groveId in args still wins when provided.
  let inferredGroveId: number | null = null;
  if (args.treeId != null) {
    const [t] = await db
      .select({ id: treesTable.id, groveId: treesTable.groveId })
      .from(treesTable)
      .where(eq(treesTable.id, args.treeId))
      .limit(1);
    if (!t) {
      throw new Error(`Tree ${args.treeId} not found`);
    }
    inferredGroveId = t.groveId;
  }
  const targetGroveId = args.groveId ?? inferredGroveId;

  const existing = await db
    .select({
      id: mediaTable.id,
      entityType: mediaTable.entityType,
    })
    .from(mediaTable)
    .where(inArray(mediaTable.id, args.mediaIds));
  const existingIds = new Set(existing.map((r) => r.id));

  const updated: MediaRow[] = [];
  for (const row of existing) {
    const promote =
      args.treeId != null &&
      (row.entityType === "library" || row.entityType === "grove")
        ? { entityType: "tree" as const, entityId: args.treeId }
        : {};
    const [updatedRow] = await db
      .update(mediaTable)
      .set({
        ...(args.treeId != null ? { treeId: args.treeId } : {}),
        ...(targetGroveId != null ? { groveId: targetGroveId } : {}),
        matchStatus: "linked_explicit" satisfies PhotoMatchStatus,
        ...promote,
      })
      .where(eq(mediaTable.id, row.id))
      .returning();
    if (updatedRow) {
      updated.push(updatedRow);
      // Mirror onto any existing analysis rows so the manager tree filter
      // picks them up immediately.
      if (args.treeId != null || targetGroveId != null) {
        await db
          .update(photoAnalysisResultsTable)
          .set({
            ...(args.treeId != null ? { treeId: args.treeId } : {}),
            ...(targetGroveId != null ? { groveId: targetGroveId } : {}),
          })
          .where(eq(photoAnalysisResultsTable.mediaId, row.id));
      }
      await db.insert(auditEventsTable).values({
        userId: args.triggeredByUserId,
        entityType: "media",
        entityId: row.id,
        action: "photo_manually_linked",
        beforeJson: null,
        afterJson: JSON.stringify({
          treeId: args.treeId,
          groveId: targetGroveId,
        }),
      });
    }
  }

  const failedIds = args.mediaIds.filter((id) => !existingIds.has(id));
  args.log.info(
    {
      requested: args.mediaIds.length,
      updated: updated.length,
      failed: failedIds.length,
      treeId: args.treeId,
      groveId: targetGroveId,
    },
    "Photo bulk-link complete",
  );
  return { updated, updatedIds: updated.map((u) => u.id), failedIds };
}

/**
 * Cheap O(1) gate used by the public `/storage/objects/*` route to ensure only
 * objects we have a finalized Media row for are streamed. Without a session
 * layer this is the strongest ACL we can cheaply offer: the path must already
 * be the `fileUrl` or `thumbnailUrl` of a Media row recorded in our DB.
 *
 * NOTE: this still does not enforce per-user authorization — see follow-up
 * task #3 (introduce auth/session and proper ACL).
 */
export async function isKnownStorageObjectPath(internalPath: string): Promise<boolean> {
  if (!internalPath.startsWith("/objects/")) return false;
  const [byFile] = await db
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .where(eq(mediaTable.fileUrl, internalPath))
    .limit(1);
  if (byFile) return true;
  const [byThumb] = await db
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .where(eq(mediaTable.thumbnailUrl, internalPath))
    .limit(1);
  return !!byThumb;
}

// Map from real linkedEntityType (after relink) → sentinel marker used while
// the parent record is still being created. finalize-upload writes the
// sentinel; `POST /photo-library/photos/relink` rewrites it once the parent
// exists; anything still wearing a sentinel past the TTL is swept here.
// Keep this map as the single source of truth for both the relink endpoint
// and the sweeper.
export const PENDING_RELINK_MAP = {
  field_visit: "field_visit_pending",
  harvest_event: "harvest_event_pending",
  harvest_box: "harvest_box_pending",
  task: "task_pending",
} as const satisfies Record<string, string>;

export const PENDING_LINKED_ENTITY_TYPES: readonly string[] =
  Object.values(PENDING_RELINK_MAP);

export const DEFAULT_PENDING_PHOTO_TTL_HOURS = 24;

export interface SweepAbandonedPendingPhotosResult {
  ttlHours: number;
  cutoff: Date;
  dryRun: boolean;
  scanned: number;
  deletedMediaIds: number[];
  storageDeletedCount: number;
  storageFailedCount: number;
}

function resolvePendingTtlHours(explicit?: number | null): number {
  if (explicit != null && Number.isFinite(explicit) && explicit >= 0) return explicit;
  const raw = process.env["PENDING_PHOTO_TTL_HOURS"]?.trim();
  if (raw) {
    const fromEnv = Number(raw);
    if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  }
  return DEFAULT_PENDING_PHOTO_TTL_HOURS;
}

// Exposed for scheduler/observability so startup logs report exactly the
// TTL the sweeper will use, including the same blank-string handling.
export function resolvePendingTtlHoursForLogging(): number {
  return resolvePendingTtlHours(null);
}

// Returns true if the file was deleted, false if it was already missing or
// the path is not a managed `/objects/...` path. Throws on real storage
// errors so the caller can roll back its transaction.
async function deleteObjectStrict(
  internalPath: string | null,
  log: Pick<Logger, "warn">,
): Promise<boolean> {
  if (!internalPath || !internalPath.startsWith("/objects/")) return false;
  try {
    const file = await objectStorageService.getObjectEntityFile(internalPath);
    await file.delete();
    return true;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      log.warn({ path: internalPath }, "Pending photo object already missing");
      return false;
    }
    throw err;
  }
}

/**
 * Sweep abandoned capture-first photos.
 *
 * Per-row transaction model: for each candidate id we open a tx, run a
 * conditional DELETE...RETURNING that re-checks the pending sentinel + TTL
 * (so racing relinks don't get clobbered), delete dependent rows in
 * `photo_batch_items` / `photo_analysis_*`, write the audit row, and
 * attempt the storage delete. If storage delete throws (transient outage,
 * permission error, …) the entire tx rolls back so the row stays
 * discoverable for the next sweep — preventing orphan storage that future
 * sweeps could never find. Missing storage objects count as success.
 *
 * `dryRun: true` returns the candidate ids without touching storage or DB.
 */
export async function sweepAbandonedPendingPhotos(opts: {
  ttlHours?: number | null;
  dryRun?: boolean;
  triggeredByUserId?: number | null;
  log: Logger;
}): Promise<SweepAbandonedPendingPhotosResult> {
  const ttlHours = resolvePendingTtlHours(opts.ttlHours ?? null);
  const dryRun = opts.dryRun ?? false;
  const log = opts.log;
  const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000);

  const candidateRows = await db
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .where(
      and(
        inArray(mediaTable.linkedEntityType, PENDING_LINKED_ENTITY_TYPES),
        lt(mediaTable.uploadedAt, cutoff),
      ),
    );
  const candidateIds = candidateRows.map((r) => r.id);

  log.info(
    { scanned: candidateIds.length, ttlHours, cutoff: cutoff.toISOString(), dryRun },
    "Pending photo sweep: candidates identified",
  );

  if (candidateIds.length === 0 || dryRun) {
    return {
      ttlHours,
      cutoff,
      dryRun,
      scanned: candidateIds.length,
      deletedMediaIds: dryRun ? candidateIds : [],
      storageDeletedCount: 0,
      storageFailedCount: 0,
    };
  }

  const deletedMediaIds: number[] = [];
  let storageDeletedCount = 0;
  let storageFailedCount = 0;

  for (const id of candidateIds) {
    try {
      const objectsDeleted = await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(mediaTable)
          .where(
            and(
              eq(mediaTable.id, id),
              inArray(mediaTable.linkedEntityType, PENDING_LINKED_ENTITY_TYPES),
              lt(mediaTable.uploadedAt, cutoff),
            ),
          )
          .returning();
        if (!row) return 0;

        await tx.delete(photoBatchItemsTable).where(eq(photoBatchItemsTable.mediaId, row.id));
        await tx.delete(photoAnalysisResultsTable).where(eq(photoAnalysisResultsTable.mediaId, row.id));
        await tx.delete(photoAnalysisJobsTable).where(eq(photoAnalysisJobsTable.mediaId, row.id));

        await tx.insert(auditEventsTable).values({
          userId: opts.triggeredByUserId ?? null,
          entityType: "media",
          entityId: row.id,
          action: "pending_photo_swept",
          beforeJson: JSON.stringify({
            fileUrl: row.fileUrl,
            thumbnailUrl: row.thumbnailUrl,
            linkedEntityType: row.linkedEntityType,
            linkedEntityId: row.linkedEntityId,
            uploadedByUserId: row.uploadedByUserId,
            uploadedAt: row.uploadedAt.toISOString(),
            purpose: row.purpose,
            treeId: row.treeId,
            groveId: row.groveId,
            ttlHours,
          }),
          afterJson: null,
        });

        // Storage delete inside the tx: any unexpected error throws and
        // rolls back the DB writes, leaving the row discoverable next sweep.
        let perRowDeleted = 0;
        for (const path of [row.fileUrl, row.thumbnailUrl]) {
          if (await deleteObjectStrict(path, log)) perRowDeleted++;
        }
        deletedMediaIds.push(row.id);
        return perRowDeleted;
      });
      storageDeletedCount += objectsDeleted;
    } catch (err) {
      storageFailedCount++;
      log.error(
        { err, mediaId: id },
        "Pending photo sweep: tx rolled back; row left for retry on next sweep",
      );
    }
  }

  log.info(
    {
      scanned: candidateIds.length,
      deleted: deletedMediaIds.length,
      racedOrRetained: candidateIds.length - deletedMediaIds.length - storageFailedCount,
      storageDeletedCount,
      storageFailedCount,
      ttlHours,
    },
    "Pending photo sweep: complete",
  );

  return {
    ttlHours,
    cutoff,
    dryRun,
    scanned: candidateIds.length,
    deletedMediaIds,
    storageDeletedCount,
    storageFailedCount,
  };
}

/**
 * Backward-compat shim for the legacy `harvest_events.pre_harvest_tree_photo_url`
 * and `harvest_boxes.photo_url` columns. The new Photo Library is the source of
 * truth, but these legacy columns are still read by some screens and reports.
 *
 * Called from finalize-upload (initial link) and from the relink endpoint
 * (capture-first reconciliation). Always writes the *public* URL so legacy
 * `<img>` consumers render correctly.
 */
export async function syncLegacyHarvestFieldsForMedia(mediaIds: number[]): Promise<void> {
  if (mediaIds.length === 0) return;
  const rows = await db
    .select()
    .from(mediaTable)
    .where(inArray(mediaTable.id, mediaIds));
  for (const r of rows) {
    const publicUrl = toPublicMediaUrl(r.fileUrl);
    if (!publicUrl) continue;
    if (
      r.purpose === "pre_harvest" &&
      r.linkedEntityType === "harvest_event" &&
      r.linkedEntityId != null
    ) {
      await db
        .update(harvestEventsTable)
        .set({ preHarvestTreePhotoUrl: publicUrl, updatedAt: new Date() })
        .where(eq(harvestEventsTable.id, r.linkedEntityId));
    } else if (
      r.purpose === "box" &&
      r.linkedEntityType === "harvest_box" &&
      r.linkedEntityId != null
    ) {
      await db
        .update(harvestBoxesTable)
        .set({ photoUrl: publicUrl })
        .where(eq(harvestBoxesTable.id, r.linkedEntityId));
    }
  }
}
