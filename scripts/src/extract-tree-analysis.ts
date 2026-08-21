import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  pool,
  db,
  treesTable,
  grovesTable,
  mediaTable,
  treeSatelliteObservationsTable,
  treeGeometryRecordsTable,
  photoAnalysisResultsTable,
  satelliteAlertsTable,
} from "@workspace/db";
import { eq, and, isNotNull, desc, inArray, sql } from "drizzle-orm";

const API_BASE = process.env.EXTRACT_API_BASE ?? "http://localhost:80";
const OUT_ROOT = resolve(process.cwd(), "..", ".local", "exports");
const PHOTOS_DIR = resolve(OUT_ROOT, "photos");
const DATASET_PATH = resolve(OUT_ROOT, "tree-analysis-dataset.json");

let SESSION_COOKIE: string | null = null;

async function establishManagerSession(): Promise<void> {
  const pin = process.env.MANAGER_PIN;
  if (!pin) throw new Error("MANAGER_PIN env not set — required to fetch private photos");
  const res = await fetch(`${API_BASE}/api/session/establish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "manager", pin }),
  });
  if (!res.ok) throw new Error(`Manager login failed: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("No session cookie returned from /session/establish");
  SESSION_COOKIE = setCookie.split(";")[0];
}

async function downloadPhoto(internalPath: string, destAbsPath: string): Promise<boolean> {
  if (!SESSION_COOKIE) return false;
  const url = internalPath.startsWith("/objects/")
    ? `${API_BASE}/api/storage${internalPath}`
    : `${API_BASE}${internalPath}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);
    try {
      const res = await fetch(url, {
        headers: { cookie: SESSION_COOKIE },
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok || !res.body) {
        if (attempt === 1) console.error(`  ! HTTP ${res.status} for ${internalPath}`);
        continue;
      }
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destAbsPath));
      return true;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) {
        console.error(`  ! download failed: ${internalPath} (${(err as Error).message})`);
      }
    }
  }
  return false;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i;
      i += 1;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingToCardinal(b: number): "N" | "E" | "S" | "W" {
  if (b >= 315 || b < 45) return "N";
  if (b < 135) return "E";
  if (b < 225) return "S";
  return "W";
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface HudCanopyBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HudFruitCluster {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  density: number;
}

interface HudCallout {
  anchor: { x: number; y: number };
  text: string;
  severity: "info" | "warn" | "alert";
}

interface HudSpec {
  canopyBox: HudCanopyBox;
  trunkBox: HudCanopyBox;
  measurements: {
    height: { x1: number; y1: number; x2: number; y2: number; labelXY: [number, number]; valueM: number | null };
    width: { x1: number; y1: number; x2: number; y2: number; labelXY: [number, number]; valueM: number | null };
    trunk: { x1: number; y1: number; x2: number; y2: number; labelXY: [number, number]; valueMm: number | null };
  };
  fruitClusters: HudFruitCluster[];
  healthCallouts: HudCallout[];
}

function buildHudSpec(args: {
  widthPx: number;
  heightPx: number;
  treeHeightM: number | null;
  canopySpreadM: number | null;
  trunkDiameterMm: number | null;
  estimatedFruitCount: number;
  fruitDispersion: number;
  callouts: HudCallout[];
  rngSeed: number;
}): HudSpec {
  const { widthPx: W, heightPx: H } = args;
  const canopyBox: HudCanopyBox = {
    x: Math.round(W * 0.08),
    y: Math.round(H * 0.06),
    w: Math.round(W * 0.84),
    h: Math.round(H * 0.78),
  };
  const trunkW = Math.max(20, Math.round(W * 0.08));
  const trunkBox: HudCanopyBox = {
    x: Math.round(W * 0.5 - trunkW / 2),
    y: Math.round(H * 0.78),
    w: trunkW,
    h: Math.round(H * 0.18),
  };
  const measurements = {
    height: {
      x1: Math.round(W * 0.04),
      y1: canopyBox.y,
      x2: Math.round(W * 0.04),
      y2: trunkBox.y + trunkBox.h,
      labelXY: [Math.round(W * 0.05), Math.round(H * 0.45)] as [number, number],
      valueM: args.treeHeightM,
    },
    width: {
      x1: canopyBox.x,
      y1: Math.round(H * 0.4),
      x2: canopyBox.x + canopyBox.w,
      y2: Math.round(H * 0.4),
      labelXY: [Math.round(W * 0.5), Math.round(H * 0.38)] as [number, number],
      valueM: args.canopySpreadM,
    },
    trunk: {
      x1: trunkBox.x,
      y1: trunkBox.y + Math.round(trunkBox.h * 0.4),
      x2: trunkBox.x + trunkBox.w,
      y2: trunkBox.y + Math.round(trunkBox.h * 0.4),
      labelXY: [trunkBox.x + trunkBox.w + 8, trunkBox.y + Math.round(trunkBox.h * 0.45)] as [number, number],
      valueMm: args.trunkDiameterMm,
    },
  };

  // Deterministic pseudo-random fruit cluster placement within the canopy box.
  // The number of clusters scales with the visible fruit count estimate;
  // dispersion controls cluster radius (low dispersion → tight clusters).
  let seed = args.rngSeed || 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const clusterCount = Math.min(40, Math.max(3, Math.round(args.estimatedFruitCount / 8)));
  const baseR = Math.round(Math.min(canopyBox.w, canopyBox.h) * (0.04 + (1 - args.fruitDispersion) * 0.06));
  const fruitClusters: HudFruitCluster[] = [];
  for (let i = 0; i < clusterCount; i += 1) {
    const cx = canopyBox.x + Math.round(rand() * canopyBox.w);
    const cy = canopyBox.y + Math.round(canopyBox.h * (0.15 + rand() * 0.7));
    const r = Math.max(6, baseR + Math.round((rand() - 0.5) * baseR));
    fruitClusters.push({
      cx,
      cy,
      rx: r,
      ry: Math.round(r * (0.7 + rand() * 0.5)),
      density: Math.min(1, 0.35 + rand() * 0.65),
    });
  }

  return {
    canopyBox,
    trunkBox,
    measurements,
    fruitClusters,
    healthCallouts: args.callouts,
  };
}

async function main() {
  process.on("unhandledRejection", (err) => {
    console.error("[FATAL unhandledRejection]", err);
    process.exit(2);
  });
  process.on("uncaughtException", (err) => {
    console.error("[FATAL uncaughtException]", err);
    process.exit(3);
  });
  const argv = process.argv.slice(2);
  const argMap = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? a.split("=", 2) : [a, argv[i + 1] ?? ""];
      argMap.set(k.replace(/^--/, ""), v ?? "");
      if (!a.includes("=")) i += 1;
    }
  }
  const startFrom = parseInt(argMap.get("start-from") ?? "0", 10) || 0;
  const limit = parseInt(argMap.get("limit") ?? "0", 10) || 0;

  await mkdir(PHOTOS_DIR, { recursive: true });
  console.log(`Args: start-from=${startFrom} limit=${limit || "ALL"}`);
  console.log("Establishing manager session...");
  await establishManagerSession();
  console.log("Session OK\n");

  const treesWithPhotos = await db
    .select({
      id: treesTable.id,
      treeCode: treesTable.treeCode,
      groveId: treesTable.groveId,
      groveName: grovesTable.name,
      treeType: treesTable.treeType,
      variety: treesTable.variety,
      ancientStatus: treesTable.ancientStatus,
      estimatedAgeClass: treesTable.estimatedAgeClass,
      centroidLat: treesTable.centroidLat,
      centroidLon: treesTable.centroidLon,
      crownAreaM2: treesTable.crownAreaM2,
      crownDiameterM: treesTable.crownDiameterM,
      currentHealthIndex: treesTable.currentHealthIndex,
      currentAlertStatus: treesTable.currentAlertStatus,
      photoCount: sql<number>`(SELECT count(*)::int FROM ${mediaTable} WHERE ${mediaTable.treeId} = ${treesTable.id})`,
    })
    .from(treesTable)
    .leftJoin(grovesTable, eq(treesTable.groveId, grovesTable.id))
    .where(
      and(
        isNotNull(treesTable.centroidLat),
        sql`EXISTS (SELECT 1 FROM ${mediaTable} WHERE ${mediaTable.treeId} = ${treesTable.id})`,
      ),
    )
    .orderBy(desc(sql`(SELECT count(*) FROM ${mediaTable} WHERE ${mediaTable.treeId} = ${treesTable.id})`));

  console.log(`Found ${treesWithPhotos.length} trees with photos`);

  const treeIds = treesWithPhotos.map((t) => t.id);

  const obs = treeIds.length
    ? await db
        .select()
        .from(treeSatelliteObservationsTable)
        .where(inArray(treeSatelliteObservationsTable.treeId, treeIds))
        .orderBy(desc(treeSatelliteObservationsTable.observationDate))
    : [];
  const latestObsByTree = new Map<number, (typeof obs)[number]>();
  for (const o of obs) {
    if (!latestObsByTree.has(o.treeId)) latestObsByTree.set(o.treeId, o);
  }

  const geom = treeIds.length
    ? await db
        .select()
        .from(treeGeometryRecordsTable)
        .where(inArray(treeGeometryRecordsTable.treeId, treeIds))
        .orderBy(desc(treeGeometryRecordsTable.observedAt))
    : [];
  const latestGeomByTree = new Map<number, (typeof geom)[number]>();
  for (const g of geom) {
    if (!latestGeomByTree.has(g.treeId)) latestGeomByTree.set(g.treeId, g);
  }

  const alerts = treeIds.length
    ? await db
        .select()
        .from(satelliteAlertsTable)
        .where(and(inArray(satelliteAlertsTable.treeId, treeIds), eq(satelliteAlertsTable.status, "open")))
    : [];
  const alertsByTree = new Map<number, typeof alerts>();
  for (const a of alerts) {
    if (a.treeId == null) continue;
    const arr = alertsByTree.get(a.treeId) ?? [];
    arr.push(a);
    alertsByTree.set(a.treeId, arr);
  }

  const photos = treeIds.length
    ? await db
        .select()
        .from(mediaTable)
        .where(inArray(mediaTable.treeId, treeIds))
        .orderBy(mediaTable.id)
    : [];
  const photosByTree = new Map<number, typeof photos>();
  for (const p of photos) {
    if (p.treeId == null) continue;
    const arr = photosByTree.get(p.treeId) ?? [];
    arr.push(p);
    photosByTree.set(p.treeId, arr);
  }

  const mediaIds = photos.map((p) => p.id);
  const analyses = mediaIds.length
    ? await db
        .select()
        .from(photoAnalysisResultsTable)
        .where(inArray(photoAnalysisResultsTable.mediaId, mediaIds))
        .orderBy(desc(photoAnalysisResultsTable.createdAt))
    : [];
  const latestAnalysisByMedia = new Map<number, (typeof analyses)[number]>();
  for (const a of analyses) {
    if (!latestAnalysisByMedia.has(a.mediaId)) latestAnalysisByMedia.set(a.mediaId, a);
  }

  const { existsSync, readFileSync } = await import("node:fs");
  let generated: { generatedAt: string; trees: unknown[] };
  if (startFrom > 0 && existsSync(DATASET_PATH)) {
    try {
      generated = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
      console.log(`Resumed from existing dataset: ${generated.trees.length} trees already present`);
    } catch {
      generated = { generatedAt: new Date().toISOString(), trees: [] };
    }
  } else {
    generated = { generatedAt: new Date().toISOString(), trees: [] };
  }
  const presentIds = new Set(
    (generated.trees as Array<{ tree?: { id?: number } }>)
      .map((t) => t.tree?.id)
      .filter((id): id is number => typeof id === "number"),
  );

  let downloadedCount = 0;
  let skippedCount = 0;

  let treeIdx = 0;
  let processedThisRun = 0;
  for (const t of treesWithPhotos) {
    treeIdx += 1;
    if (treeIdx <= startFrom) continue;
    if (limit > 0 && processedThisRun >= limit) break;
    const treePhotos = photosByTree.get(t.id) ?? [];
    if (treePhotos.length === 0) continue;
    if (presentIds.has(t.id)) {
      process.stdout.write(`[${treeIdx}/${treesWithPhotos.length}] ${t.treeCode} — already in dataset, skipping\n`);
      continue;
    }
    processedThisRun += 1;
    process.stdout.write(`[${treeIdx}/${treesWithPhotos.length}] ${t.treeCode} (${treePhotos.length} photos)\n`);
   try {

    const sat = latestObsByTree.get(t.id);
    const geomRec = latestGeomByTree.get(t.id);
    const treeAlerts = alertsByTree.get(t.id) ?? [];

    // Tree height — prefer field record, fall back to allometry from crown
    // diameter for olives (rough heuristic, marked as estimated).
    const fieldHeightM = geomRec?.treeHeightM ?? null;
    const crownDiamM = geomRec?.canopyDiameterM ?? t.crownDiameterM ?? null;
    const allometryHeightM = crownDiamM ? Math.round((1.6 + crownDiamM * 0.55) * 10) / 10 : null;
    const treeHeightM = fieldHeightM ?? allometryHeightM;
    const heightSource: "field" | "allometric_estimate" | "unknown" = fieldHeightM
      ? "field"
      : allometryHeightM != null
        ? "allometric_estimate"
        : "unknown";

    const trunkDiameterMm = geomRec?.trunkDiameterMm ?? null;

    // Olive trunks typically run 1.0–1.5 m before the canopy starts. Subtract
    // a conservative trunk segment so the half-ellipsoid uses the canopy's own
    // vertical extent, not total tree height (which biased volume high).
    const canopyVerticalExtentM =
      treeHeightM != null ? Math.max(treeHeightM - 1.2, treeHeightM * 0.6) : null;

    // Canopy volume — half-ellipsoid approximation: V = (2/3) * π * (d/2)^2 * h_canopy
    const canopyVolumeM3 =
      crownDiamM && canopyVerticalExtentM
        ? Math.round(
            (2 / 3) * Math.PI * Math.pow(crownDiamM / 2, 2) * canopyVerticalExtentM * 10,
          ) / 10
        : null;
    const canopySurfaceAreaM2 =
      crownDiamM && treeHeightM
        ? Math.round(2 * Math.PI * (crownDiamM / 2) * Math.sqrt(Math.pow(crownDiamM / 2, 2) + Math.pow(treeHeightM, 2)) * 10) / 10
        : null;

    const healthIndex = sat?.healthIndex ?? t.currentHealthIndex ?? null;
    // Foliage porosity proxy: fragmentationScore + shadowFraction give a rough
    // estimate of how much sky is visible through the canopy. Higher = more
    // porous.
    const foliagePorosity =
      sat?.fragmentationScore != null || sat?.shadowFraction != null
        ? Math.round(((sat?.fragmentationScore ?? 0.3) * 0.5 + (sat?.shadowFraction ?? 0.3) * 0.5) * 100) / 100
        : null;

    // Yield model — Souri olives in Galilee: typical annual fresh-fruit yield
    // 8-25 kg/tree depending on age, vigor, and crown size. Combine satellite
    // crown area with health index, scale by ancient/age factor.
    const crownArea = sat?.crownAreaM2 ?? t.crownAreaM2 ?? null;
    const healthFactor = healthIndex != null ? Math.max(0.2, Math.min(1.2, healthIndex / 50)) : 0.7;
    const ageFactor = t.ancientStatus === "verified" || t.ancientStatus === "confirmed_ancient" ? 1.4 : 1.0;
    const baseYieldKgPerM2 = 0.35;
    const estimatedTotalKg =
      crownArea != null
        ? Math.round(crownArea * baseYieldKgPerM2 * healthFactor * ageFactor * 10) / 10
        : null;
    const estimatedFruitCount =
      estimatedTotalKg != null ? Math.round(estimatedTotalKg * 200) : 0; // ~5g/fruit
    const exposedFruitAreaM2 =
      estimatedTotalKg != null && crownArea != null
        ? Math.round(crownArea * 0.18 * healthFactor * 100) / 100
        : null;
    const fruitDispersionIndex = healthIndex != null ? Math.max(0.2, Math.min(0.95, healthIndex / 100 + 0.2)) : 0.5;

    const absLocal = resolve(PHOTOS_DIR, `tree-${t.id}`);
    await mkdir(absLocal, { recursive: true });

    const downloadResults = await mapWithConcurrency(treePhotos, 2, async (photo) => {
      try {
        return await downloadPhoto(photo.fileUrl, resolve(absLocal, `photo-${photo.id}.jpg`));
      } catch (err) {
        console.error(`  ! exception in download for media ${photo.id}: ${(err as Error).message}`);
        return false;
      }
    });

    const treePhotosOut: unknown[] = [];

    for (let pi = 0; pi < treePhotos.length; pi += 1) {
      const photo = treePhotos[pi];
      const downloadOk = downloadResults[pi];
      if (downloadOk) downloadedCount += 1;
      else skippedCount += 1;
      const widthPx = photo.widthPx ?? 4032;
      const heightPx = photo.heightPx ?? 3024;
      const analysis = latestAnalysisByMedia.get(photo.id);
      const localFile = `photos/tree-${t.id}/photo-${photo.id}.jpg`;

      let computedSide: "N" | "E" | "S" | "W" | null = null;
      let camDistanceM: number | null = null;
      if (
        photo.gpsLat != null &&
        photo.gpsLon != null &&
        t.centroidLat != null &&
        t.centroidLon != null
      ) {
        const b = bearingDeg(t.centroidLat, t.centroidLon, photo.gpsLat, photo.gpsLon);
        computedSide = bearingToCardinal(b);
        camDistanceM = Math.round(distanceM(t.centroidLat, t.centroidLon, photo.gpsLat, photo.gpsLon) * 10) / 10;
      }
      const photoSide = (photo.photoSide as "N" | "E" | "S" | "W" | null) ?? computedSide;

      const callouts: HudCallout[] = [];
      const cuesRaw = analysis?.possiblePestOrDiseaseCues as
        | Array<{ cue?: string; severity?: string; notes?: string }>
        | null
        | undefined;
      if (Array.isArray(cuesRaw)) {
        for (let i = 0; i < Math.min(3, cuesRaw.length); i += 1) {
          const c = cuesRaw[i];
          const sev = (c.severity ?? "low").toLowerCase();
          const severity: "info" | "warn" | "alert" =
            sev === "high" || sev === "urgent" ? "alert" : sev === "med" || sev === "medium" ? "warn" : "info";
          callouts.push({
            anchor: { x: Math.round(widthPx * (0.25 + i * 0.25)), y: Math.round(heightPx * 0.45) },
            text: c.cue ? `${c.cue}${c.notes ? ` — ${c.notes}` : ""}` : "Possible cue",
            severity,
          });
        }
      }
      if (analysis?.yellowingSignal && analysis.yellowingSignal !== "none") {
        callouts.push({
          anchor: { x: Math.round(widthPx * 0.7), y: Math.round(heightPx * 0.3) },
          text: `Yellowing: ${analysis.yellowingSignal}`,
          severity: analysis.yellowingSignal === "high" ? "alert" : "warn",
        });
      }
      if (analysis?.droughtStressVisualSignal && analysis.droughtStressVisualSignal !== "none") {
        callouts.push({
          anchor: { x: Math.round(widthPx * 0.3), y: Math.round(heightPx * 0.6) },
          text: `Drought stress: ${analysis.droughtStressVisualSignal}`,
          severity: "warn",
        });
      }
      for (const a of treeAlerts.slice(0, 1)) {
        callouts.push({
          anchor: { x: Math.round(widthPx * 0.5), y: Math.round(heightPx * 0.2) },
          text: `Sat alert: ${a.alertType} (${a.severity})`,
          severity: a.severity === "high" || a.severity === "urgent" ? "alert" : "warn",
        });
      }

      // Fruit count visible to a single camera face is roughly 1/4 of total
      // (one face of the canopy at a time).
      const visibleFruitOnFace = Math.round(estimatedFruitCount / 4);

      const hud = buildHudSpec({
        widthPx,
        heightPx,
        treeHeightM,
        canopySpreadM: crownDiamM,
        trunkDiameterMm,
        estimatedFruitCount: visibleFruitOnFace,
        fruitDispersion: fruitDispersionIndex,
        callouts,
        rngSeed: photo.id,
      });

      treePhotosOut.push({
        mediaId: photo.id,
        localFile,
        downloadOk,
        originalFileUrl: photo.fileUrl,
        capturedAt: photo.capturedAt,
        uploadedAt: photo.uploadedAt,
        widthPx,
        heightPx,
        gps: photo.gpsLat != null ? { lat: photo.gpsLat, lon: photo.gpsLon } : null,
        photoSide,
        cameraDistanceM: camDistanceM,
        analysis: analysis
          ? {
              imageQuality: analysis.imageQuality,
              blurScore: analysis.blurScore,
              brightnessScore: analysis.brightnessScore,
              canopyDensity: analysis.canopyDensity,
              canopyGreennessScore: analysis.canopyGreennessScore,
              yellowingSignal: analysis.yellowingSignal,
              droughtStressVisualSignal: analysis.droughtStressVisualSignal,
              fruitMaturityVisualEstimate: analysis.fruitMaturityVisualEstimate,
              fruitDamageSignal: analysis.fruitDamageSignal,
              trunkConditionSignal: analysis.trunkConditionSignal,
              summary: analysis.summary,
              confidenceScore: analysis.confidenceScore,
            }
          : null,
        visibleFruitCount: visibleFruitOnFace,
        hud,
      });
    }

    generated.trees.push({
      tree: {
        id: t.id,
        treeCode: t.treeCode,
        groveId: t.groveId,
        groveName: t.groveName,
        treeType: t.treeType,
        variety: t.variety,
        ancientStatus: t.ancientStatus,
        estimatedAgeClass: t.estimatedAgeClass,
        centroid: t.centroidLat != null ? { lat: t.centroidLat, lon: t.centroidLon } : null,
      },
      satellite: sat
        ? {
            observationDate: sat.observationDate,
            crownAreaM2: sat.crownAreaM2,
            crownDiameterM: sat.crownDiameterM,
            ndviMean: sat.finalNdviMean ?? sat.panNdviMean ?? sat.analyticNdviMean,
            gndviMean: sat.panGndviMean ?? sat.analyticGndviMean,
            saviMean: sat.panSaviMean ?? sat.analyticSaviMean,
            healthIndex: sat.healthIndex,
            canopyDensityScore: sat.canopyDensityScore,
            fragmentationScore: sat.fragmentationScore,
            shadowFraction: sat.shadowFraction,
            anomalyFlag: sat.anomalyFlag,
            recommendedAction: sat.recommendedAction,
          }
        : {
            crownAreaM2: t.crownAreaM2,
            crownDiameterM: t.crownDiameterM,
            healthIndex: t.currentHealthIndex,
          },
      morphology: {
        treeHeightM: { value: treeHeightM, source: heightSource, confidence: heightSource === "field" ? 0.9 : 0.4 },
        trunkDiameterMm: { value: trunkDiameterMm, source: trunkDiameterMm != null ? "field" : "unknown" },
        canopySpreadM: { value: crownDiamM, source: crownDiamM != null ? "satellite_or_field" : "unknown" },
        canopyVolumeM3: { value: canopyVolumeM3, formula: "(2/3)*pi*(d/2)^2*h", confidence: canopyVolumeM3 != null ? 0.5 : 0 },
        canopySurfaceAreaM2: { value: canopySurfaceAreaM2, formula: "lateral_half_ellipsoid", confidence: canopySurfaceAreaM2 != null ? 0.5 : 0 },
        foliagePorosity: { value: foliagePorosity, source: "satellite_proxy" },
      },
      yield: {
        estimatedTotalKg: {
          value: estimatedTotalKg,
          formula: "crownAreaM2 * 0.35 * healthFactor * ageFactor",
          inputs: { crownAreaM2: crownArea, healthFactor, ageFactor, baseYieldKgPerM2 },
          confidence: estimatedTotalKg != null ? 0.45 : 0,
        },
        estimatedFruitCount: { value: estimatedFruitCount, basis: "5g_per_fruit_souri" },
        exposedFruitAreaM2: { value: exposedFruitAreaM2, basis: "crownArea * 0.18 * healthFactor" },
        fruitDispersionIndex: { value: Math.round(fruitDispersionIndex * 100) / 100, basis: "satellite_health_proxy" },
      },
      health: {
        currentHealthIndex: healthIndex,
        currentAlertStatus: t.currentAlertStatus,
        ndviMean: sat?.finalNdviMean ?? sat?.panNdviMean ?? null,
        leafChlorophyllProxy:
          sat?.panGndviMean != null ? Math.round(sat.panGndviMean * 100) / 100 : null,
        openSatelliteAlerts: treeAlerts.map((a) => ({
          code: a.alertCode,
          type: a.alertType,
          severity: a.severity,
          recommendedTask: a.recommendedTask,
        })),
        photoAnalysisSummary: {
          analyzedPhotos: treePhotos.filter((p) => latestAnalysisByMedia.has(p.id)).length,
          totalPhotos: treePhotos.length,
        },
      },
      photos: treePhotosOut,
    });
   } catch (err) {
     console.error(`  ! tree ${t.treeCode} (id=${t.id}) failed: ${(err as Error).stack ?? (err as Error).message}`);
   }
   if (treeIdx % 3 === 0) {
     await writeFile(DATASET_PATH, JSON.stringify(generated, null, 2));
     process.stdout.write(`  ... checkpoint saved (${generated.trees.length} trees)\n`);
   }
  }

  await writeFile(DATASET_PATH, JSON.stringify(generated, null, 2));
  console.log(
    `\nWrote ${DATASET_PATH}\n  trees: ${generated.trees.length}\n  photos downloaded: ${downloadedCount} (${skippedCount} skipped)`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
