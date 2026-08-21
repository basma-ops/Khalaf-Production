import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import {
  pool,
  db,
  grovesTable,
  treesTable,
  imageryAcquisitionsTable,
  treeSatelliteObservationsTable,
  satelliteAlertsTable,
  sensorStreamsTable,
  sensorReadingsTable,
} from "@workspace/db";
import { sql, eq } from "drizzle-orm";

const ROOT = resolve(process.cwd(), "..");
const ASSETS = resolve(ROOT, "attached_assets");

const GROVES_FILE = resolve(ASSETS, "groves_1777727944617.geojson");
const TREES_FILE = resolve(ASSETS, "corrected_trees_1777727944616.geojson");
const OBS_FILE = resolve(ASSETS, "corrected_tree_satellite_observations_1777727944615.csv");
const ALERTS_FILE = resolve(ASSETS, "corrected_satellite_alerts_1777727944615.geojson");
const PROVIDER = "Planet Labs";
const SENSOR = "SkySat";
const PRODUCT_TYPE = "pansharpened_reflectance+manual_review";

interface GroveFeature {
  properties: {
    grove_code: string;
    grove_name: string;
    area_ha: number;
    detected_tree_count: number;
    canopy_cover_pct: number;
    ndvi_mean: number;
  };
  geometry: { type: string; coordinates: number[][][] };
}

interface TreeFeature {
  properties: {
    tree_code: string;
    grove_code: string;
    grove_name: string;
    tree_type: string;
    variety: string;
    centroid_lat: number;
    centroid_lon: number;
    crown_area_m2: number;
    crown_diameter_m: number;
    health_index: number;
    confidence_score: number;
    satellite_alert_status: string;
    recommended_action: string;
    source_image_id: string;
    review_status?: string;
  };
  geometry: { type: "Point"; coordinates: [number, number] };
}

interface AlertFeature {
  properties: {
    alert_type: string;
    severity: string;
    grove_code: string;
    tree_code_optional?: string;
    related_rule?: string;
    evidence: Record<string, unknown>;
    recommended_task: string;
    confidence_score: number;
    status?: string;
  };
  geometry: { type: string; coordinates: unknown };
}

function polygonCentroid(coords: number[][]): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  for (const [x, y] of coords) {
    lat += y;
    lon += x;
  }
  return { lat: lat / coords.length, lon: lon / coords.length };
}

async function wipeSyntheticData() {
  console.log("Wiping synthetic data...");
  await db.execute(sql`TRUNCATE TABLE
    rule_evidence,
    audit_events,
    media,
    lab_results,
    oil_batches,
    pressing_runs,
    harvest_batch_items,
    harvest_batches,
    harvest_boxes,
    harvest_event_workers,
    harvest_events,
    harvest_seasons,
    field_visits,
    tasks,
    satellite_alerts,
    tree_satellite_observations,
    sensor_readings,
    sensor_streams,
    trees,
    groves,
    imagery_acquisitions
    RESTART IDENTITY CASCADE`);
  console.log("Wiped.");
}

async function importGroves(): Promise<Map<string, number>> {
  console.log("Importing groves...");
  const raw = JSON.parse(await readFile(GROVES_FILE, "utf-8"));
  const features = raw.features as GroveFeature[];
  const codeToId = new Map<string, number>();
  for (const f of features) {
    const ring = f.geometry.coordinates[0]!;
    const c = polygonCentroid(ring);
    const [row] = await db
      .insert(grovesTable)
      .values({
        groveCode: f.properties.grove_code,
        name: f.properties.grove_name,
        boundaryGeojson: f.geometry,
        areaHa: f.properties.area_ha,
        centroidLat: c.lat,
        centroidLon: c.lon,
        notes: `${f.properties.detected_tree_count} detected trees · canopy cover ${f.properties.canopy_cover_pct}% · NDVI mean ${f.properties.ndvi_mean.toFixed(3)}`,
      })
      .returning({ id: grovesTable.id });
    codeToId.set(f.properties.grove_code, row!.id);
  }
  console.log(`Imported ${codeToId.size} groves.`);
  return codeToId;
}

async function importImagery(): Promise<Map<string, number>> {
  console.log("Importing imagery acquisitions...");
  const imageIds = new Map<string, number>();
  const csvText = await readFile(OBS_FILE, "utf-8");
  const records = parseCsv(csvText, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
  const seen = new Map<string, string>();
  for (const r of records) {
    const id = r["image_id"]!;
    if (!seen.has(id)) seen.set(id, r["acquisition_date"]!);
  }
  for (const [imageId, date] of seen) {
    const [row] = await db
      .insert(imageryAcquisitionsTable)
      .values({
        imageId,
        provider: PROVIDER,
        sensor: SENSOR,
        productType: PRODUCT_TYPE,
        acquisitionDate: date,
        resolutionM: 0.5,
        bandsAvailable: "R,G,B,NIR",
        cloudPercent: 0,
        sourceFile: "pansharpened_reflectance.tif",
        notes: "Pansharpened reflectance with manual review overlay (display imagery)",
      })
      .returning({ id: imageryAcquisitionsTable.id });
    imageIds.set(imageId, row!.id);
  }
  console.log(`Imported ${imageIds.size} imagery acquisition(s).`);
  return imageIds;
}

async function importTrees(groveIds: Map<string, number>): Promise<Map<string, number>> {
  console.log("Importing trees...");
  const raw = JSON.parse(await readFile(TREES_FILE, "utf-8"));
  const features = raw.features as TreeFeature[];
  const codeToId = new Map<string, number>();

  const BATCH = 200;
  for (let i = 0; i < features.length; i += BATCH) {
    const slice = features.slice(i, i + BATCH);
    const values = slice.map((f) => {
      const groveId = groveIds.get(f.properties.grove_code);
      if (!groveId) throw new Error(`Grove not found for code ${f.properties.grove_code}`);
      const variety = f.properties.variety?.replace(/_or_unknown$/, "") || "unknown";
      const treeType = f.properties.tree_type?.replace(/_or_unknown$/, "") || "unknown";
      return {
        treeCode: f.properties.tree_code,
        groveId,
        treeType,
        variety: variety.toLowerCase(),
        ancientStatus: "unknown",
        centroidLat: f.properties.centroid_lat,
        centroidLon: f.properties.centroid_lon,
        pointGeojson: f.geometry,
        crownAreaM2: f.properties.crown_area_m2,
        crownDiameterM: f.properties.crown_diameter_m,
        currentHealthIndex: f.properties.health_index,
        currentAlertStatus: f.properties.satellite_alert_status === "none" ? "none" : "medium",
        verificationStatus: "satellite_detected",
        notes: f.properties.recommended_action,
      };
    });
    const rows = await db
      .insert(treesTable)
      .values(values)
      .returning({ id: treesTable.id, treeCode: treesTable.treeCode });
    for (const r of rows) codeToId.set(r.treeCode, r.id);
    console.log(`  ${codeToId.size}/${features.length}`);
  }
  console.log(`Imported ${codeToId.size} trees.`);
  return codeToId;
}

async function importObservations(treeIds: Map<string, number>, imageryIds: Map<string, number>) {
  console.log("Importing tree satellite observations...");
  const csvText = await readFile(OBS_FILE, "utf-8");
  const records = parseCsv(csvText, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
  const num = (s: string | undefined) => (s == null || s === "" ? null : Number(s));
  const bool = (s: string | undefined) => s === "True" || s === "true";

  let count = 0;
  let skipped = 0;
  const BATCH = 200;
  const all: any[] = [];
  for (const r of records) {
    const treeId = treeIds.get(r["tree_code"]!);
    const imageryId = imageryIds.get(r["image_id"]!);
    if (!treeId || !imageryId) {
      skipped++;
      continue;
    }
    all.push({
      treeId,
      imageryAcquisitionId: imageryId,
      observationDate: r["acquisition_date"]!,
      crownAreaM2: num(r["crown_area_m2"]),
      crownDiameterM: num(r["crown_diameter_m"]),
      panNdviMean: num(r["pan_ndvi_mean"]),
      panNdviMedian: num(r["pan_ndvi_median"]),
      panNdviP10: num(r["pan_ndvi_p10"]),
      panGndviMean: num(r["pan_gndvi_mean"]),
      panSaviMean: num(r["pan_savi_mean"]),
      analyticNdviMean: num(r["analytic_ndvi_mean"]),
      analyticGndviMean: num(r["analytic_gndvi_mean"]),
      analyticSaviMean: num(r["analytic_savi_mean"]),
      finalNdviMean: num(r["final_ndvi_mean"]),
      healthIndex: num(r["health_index"]),
      canopyDensityScore: num(r["canopy_density_score"]),
      fragmentationScore: num(r["fragmentation_score"]),
      shadowFraction: num(r["shadow_fraction"]),
      anomalyFlag: bool(r["anomaly_flag"]),
      recommendedAction: r["recommended_action"] ?? null,
      rawMetricsJson: {
        red_mean: num(r["red_mean"]),
        green_mean: num(r["green_mean"]),
        blue_mean: num(r["blue_mean"]),
        nir_mean: num(r["nir_mean"]),
        review_status: r["review_status"],
        review_source: r["review_source"],
      },
    });
  }

  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    await db.insert(treeSatelliteObservationsTable).values(slice);
    count += slice.length;
  }
  console.log(`Imported ${count} observations (skipped ${skipped} unmatched).`);
}

async function importAlerts(groveIds: Map<string, number>, treeIds: Map<string, number>) {
  console.log("Importing satellite alerts...");
  const raw = JSON.parse(await readFile(ALERTS_FILE, "utf-8"));
  const features = raw.features as AlertFeature[];
  let count = 0;
  let skipped = 0;
  const BATCH = 200;
  const all: any[] = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i]!;
    const groveId = groveIds.get(f.properties.grove_code);
    if (!groveId) {
      skipped++;
      continue;
    }
    const treeId = f.properties.tree_code_optional ? treeIds.get(f.properties.tree_code_optional) ?? null : null;
    const ev = f.properties.evidence ?? {};
    const evidenceText = Object.entries(ev)
      .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(3) : v}`)
      .join(" · ");
    all.push({
      alertCode: `ALT-${String(i + 1).padStart(5, "0")}`,
      alertType: f.properties.alert_type,
      severity: f.properties.severity,
      groveId,
      treeId,
      geometryGeojson: f.geometry ?? null,
      evidence: evidenceText,
      recommendedTask: f.properties.recommended_task,
      confidenceScore: f.properties.confidence_score,
      status: f.properties.status ?? "open",
    });
  }
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    await db.insert(satelliteAlertsTable).values(slice);
    count += slice.length;
  }
  console.log(`Imported ${count} satellite alerts (skipped ${skipped} unmatched).`);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function seedSensorStreams(
  groveIds: Map<string, number>,
  treeIds: Map<string, number>,
) {
  console.log("Seeding demo sensor streams...");

  // Pick anchor entities for the streams. Prefer the Moran grove and a
  // known low-vigor tree there so the seeded data lines up with the
  // existing sample geojson features.
  const groveId = groveIds.get("MORAN") ?? groveIds.values().next().value;
  if (!groveId) {
    console.log("  No groves available, skipping sensor seed.");
    return;
  }
  let treeCode = "KOG-MORAN-0006";
  let treeId = treeIds.get(treeCode);
  if (!treeId) {
    treeCode = "KOG-MORAN-0003";
    treeId = treeIds.get(treeCode);
  }
  if (!treeId) {
    const first = treeIds.entries().next().value;
    if (first) {
      treeCode = first[0];
      treeId = first[1];
    }
  }
  if (!treeId) {
    console.log("  No trees available, skipping sensor seed.");
    return;
  }

  const now = new Date();
  // Anchor "now" to the most recent whole hour for tidy timestamps.
  now.setMinutes(0, 0, 0);

  // ----- Rainfall stream: daily samples for 6 weeks -----
  const RAIN_DAYS = 42;
  const rainToken = randomBytes(32).toString("hex");
  const [rainStream] = await db
    .insert(sensorStreamsTable)
    .values({
      name: "Moran grove rainfall (demo)",
      kind: "weather_station_rainfall_mm",
      attachedEntityType: "grove",
      attachedEntityId: groveId,
      unit: "mm",
      sampleIntervalSeconds: 86_400,
      source: "demo_seed",
      status: "active",
      apiTokenHash: hashToken(rainToken),
      lastSeenAt: now,
    })
    .returning({ id: sensorStreamsTable.id });
  if (!rainStream) throw new Error("Failed to insert rainfall stream");

  const rainReadings: Array<{
    streamId: number;
    observedAt: Date;
    valueNumeric: number;
    qualityFlag: string;
  }> = [];
  for (let d = RAIN_DAYS - 1; d >= 0; d--) {
    const t = new Date(now.getTime() - d * 86_400_000);
    // Mostly dry days with a handful of rain events; deterministic pattern.
    const phase = (RAIN_DAYS - d) % 7;
    let mm = 0;
    if (phase === 2) mm = 4 + ((d * 13) % 9);
    else if (phase === 5) mm = 1 + ((d * 7) % 5);
    else if (d % 11 === 0) mm = 12 + ((d * 3) % 8);
    rainReadings.push({
      streamId: rainStream.id,
      observedAt: t,
      valueNumeric: Math.round(mm * 10) / 10,
      qualityFlag: "ok",
    });
  }
  await db.insert(sensorReadingsTable).values(rainReadings);

  // ----- Soil moisture stream: 6-hourly samples for 4 weeks -----
  const SOIL_DAYS = 28;
  const SAMPLES_PER_DAY = 4;
  const soilToken = randomBytes(32).toString("hex");
  const [soilStream] = await db
    .insert(sensorStreamsTable)
    .values({
      name: `${treeCode} soil moisture (demo)`,
      kind: "soil_moisture_pct",
      attachedEntityType: "tree",
      attachedEntityId: treeId,
      unit: "%",
      sampleIntervalSeconds: 21_600,
      source: "demo_seed",
      status: "active",
      apiTokenHash: hashToken(soilToken),
      lastSeenAt: now,
    })
    .returning({ id: sensorStreamsTable.id });
  if (!soilStream) throw new Error("Failed to insert soil moisture stream");

  const soilReadings: Array<{
    streamId: number;
    observedAt: Date;
    valueNumeric: number;
    qualityFlag: string;
  }> = [];
  const totalSamples = SOIL_DAYS * SAMPLES_PER_DAY;
  for (let i = totalSamples - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 21_600_000);
    // Diurnal-ish wave between ~18% and ~30%, slowly drying then a bump.
    const dayFromNow = i / SAMPLES_PER_DAY;
    const base = 26 - dayFromNow * 0.15;
    const diurnal = Math.sin((i / SAMPLES_PER_DAY) * Math.PI * 2) * 1.8;
    const noise = ((i * 37) % 11) / 10 - 0.5;
    let pct = base + diurnal + noise;
    // Bump moisture after the rainfall events seeded above.
    const daysAgo = Math.floor(dayFromNow);
    if (daysAgo === 2 || daysAgo === 9 || daysAgo === 16) pct += 4;
    soilReadings.push({
      streamId: soilStream.id,
      observedAt: t,
      valueNumeric: Math.round(pct * 100) / 100,
      qualityFlag: "ok",
    });
  }
  await db.insert(sensorReadingsTable).values(soilReadings);

  console.log(
    `  Seeded rainfall stream #${rainStream.id} (${rainReadings.length} readings)` +
      ` and soil moisture stream #${soilStream.id} (${soilReadings.length} readings).`,
  );
}

async function main() {
  // Note: imagery bounds (`lib/db/src/imagery-bounds.json`) are owned by
  // the `convert-bounds` script, which produces the WGS84/WebMercator
  // metadata the map overlays require. This seed must not regenerate it.
  await wipeSyntheticData();
  const groveIds = await importGroves();
  const imageryIds = await importImagery();
  const treeIds = await importTrees(groveIds);
  await importObservations(treeIds, imageryIds);
  await importAlerts(groveIds, treeIds);
  await seedSensorStreams(groveIds, treeIds);

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
