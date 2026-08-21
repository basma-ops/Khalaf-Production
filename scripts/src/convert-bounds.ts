import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import proj4 from "proj4";

const exec = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "../..");
const ATTACHED = resolve(ROOT, "attached_assets");
const BOUNDS_FILE = resolve(ROOT, "lib/db/src/imagery-bounds.json");
const OUT_DIR = resolve(ROOT, "artifacts/api-server/public/imagery");
const OUT_PNG = resolve(OUT_DIR, "display.png");

// Match the source TIF's native pixel width so we don't lose resolution
// when zooming in on small groves. (Source is 7884x5176 at 0.5 m/px UTM;
// after warping to EPSG:3857 it becomes ~7884x5301 at ~0.6 m/px.)
const TARGET_WIDTH = 7884;

const wgs = "+proj=longlat +datum=WGS84 +no_defs";
const merc =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";

async function findLatestDisplayTif(): Promise<string> {
  const files = (await readdir(ATTACHED))
    .filter((f) => /^Display_.*\.TIF$/i.test(f))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error("No Display_*.TIF found in attached_assets/");
  return resolve(ATTACHED, latest);
}

async function getInfo(path: string): Promise<{
  width: number;
  height: number;
  origin: [number, number];
  pixelSize: [number, number];
}> {
  const { stdout } = await exec("gdalinfo", ["-json", path]);
  const j = JSON.parse(stdout);
  const [w, h] = j.size as [number, number];
  // geoTransform = [originX, pxW, rotX, originY, rotY, pxH]
  return {
    width: w,
    height: h,
    origin: [j.geoTransform[0], j.geoTransform[3]],
    pixelSize: [j.geoTransform[1], j.geoTransform[5]],
  };
}

async function main() {
  const src = await findLatestDisplayTif();
  console.log("Source TIF:", src);
  await mkdir(OUT_DIR, { recursive: true });

  const tmp = "/tmp/display_3857.tif";
  console.log("Reprojecting to EPSG:3857 with alpha for nodata…");
  await exec("gdalwarp", [
    "-overwrite",
    "-t_srs", "EPSG:3857",
    "-r", "cubic",
    "-srcnodata", "0 0 0 0",
    "-dstalpha",
    "-ts", String(TARGET_WIDTH), "0",
    "-of", "GTiff",
    "-co", "COMPRESS=LZW",
    src,
    tmp,
  ]);

  console.log("Reading warped bounds…");
  const info = await getInfo(tmp);
  const ul3857: [number, number] = info.origin;
  const lr3857: [number, number] = [
    info.origin[0] + info.width * info.pixelSize[0],
    info.origin[1] + info.height * info.pixelSize[1],
  ];
  const [west, north] = proj4(merc, wgs, ul3857);
  const [east, south] = proj4(merc, wgs, lr3857);

  console.log("Translating to PNG with alpha…");
  await exec("gdal_translate", [
    "-of", "PNG",
    "-b", "1", "-b", "2", "-b", "3", "-b", "4",
    "-mask", "4",
    "-co", "WORLDFILE=NO",
    tmp,
    OUT_PNG,
  ]);
  // remove sidecar files we don't want served
  for (const ext of [".aux.xml", ".msk"]) {
    await rm(`${OUT_PNG}${ext}`, { force: true });
  }

  const result = {
    utm: { west: 721238, south: 3643980, east: 725180, north: 3646568 },
    webMercator: {
      west: ul3857[0],
      south: lr3857[1],
      east: lr3857[0],
      north: ul3857[1],
    },
    wgs84: { west, south, east, north },
    width: info.width,
    height: info.height,
    note:
      "wgs84 bounds describe a rectangle in EPSG:3857 (the imagery is reprojected to Web Mercator). Use directly with L.imageOverlay on a CRS.EPSG3857 map.",
  };
  await writeFile(BOUNDS_FILE, JSON.stringify(result, null, 2));
  console.log("Wrote bounds:", BOUNDS_FILE);
  console.log(JSON.stringify(result.wgs84, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
