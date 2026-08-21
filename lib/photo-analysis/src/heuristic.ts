import sharp from "sharp";
import exifReader from "exif-reader";
import exifr from "exifr";
import type { ImageQualityHeuristic } from "./schema";

const THUMB_SIZE = 512;

function dmsToDecimal(dms: number[] | undefined, ref: string | undefined): number | null {
  if (!dms || dms.length < 3) return null;
  const [d, m, s] = dms;
  let value = d + m / 60 + s / 3600;
  if (ref === "S" || ref === "W") value = -value;
  return Number.isFinite(value) ? value : null;
}

/**
 * Run sharp + exif on the original buffer to extract:
 *   - image quality (blur via Laplacian variance approximation, brightness)
 *   - 512px thumbnail
 *   - EXIF GPS + capture timestamp
 */
export async function runLocalHeuristic(buffer: Buffer): Promise<ImageQualityHeuristic> {
  const img = sharp(buffer, { failOn: "none" });
  const metadata = await img.metadata().catch(() => ({}) as Awaited<ReturnType<typeof img.metadata>>);

  const widthPx = metadata.width ?? 0;
  const heightPx = metadata.height ?? 0;

  // Brightness: mean luminance from a small downsampled greyscale
  let brightnessScore: number | null = null;
  let blurScore: number | null = null;
  try {
    const small = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(256, 256, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (small.data.length > 0) {
      let sum = 0;
      for (let i = 0; i < small.data.length; i++) sum += small.data[i];
      const mean = sum / small.data.length;
      brightnessScore = Math.max(0, Math.min(1, mean / 255));

      // Approximate Laplacian variance for blur detection
      const w = small.info.width;
      const h = small.info.height;
      let lapSum = 0;
      let lapSumSq = 0;
      let count = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const v =
            -small.data[i - w] -
            small.data[i - 1] +
            4 * small.data[i] -
            small.data[i + 1] -
            small.data[i + w];
          lapSum += v;
          lapSumSq += v * v;
          count++;
        }
      }
      if (count > 0) {
        const m = lapSum / count;
        const variance = lapSumSq / count - m * m;
        // Normalize: variance ~> 100 = sharp, ~< 10 = very blurry. Map to 0..1.
        blurScore = Math.max(0, Math.min(1, variance / 200));
      }
    }
  } catch {
    /* ignore — quality stays null */
  }

  // Thumbnail (always JPEG, fits in 512x512)
  const thumbnailBuffer = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  // EXIF: fast path is `sharp().metadata().exif` + `exif-reader`, which works
  // reliably for JPEG/TIFF. HEIC/HEIF (iPhone default) tucks the EXIF block
  // into a different container that sharp often does NOT surface, so when
  // the fast path produces no GPS we fall back to `exifr`, which parses
  // HEIC/HEIF natively (and also catches odd JPEGs whose EXIF block sharp
  // chose not to expose).
  let capturedAt: Date | null = null;
  let gpsLat: number | null = null;
  let gpsLon: number | null = null;
  try {
    if (metadata.exif) {
      const parsed = exifReader(metadata.exif);
      const dt =
        parsed?.Photo?.DateTimeOriginal ??
        parsed?.Photo?.DateTimeDigitized ??
        parsed?.Image?.DateTime;
      if (dt instanceof Date) {
        capturedAt = dt;
      } else if (typeof dt === "string") {
        const d = new Date(dt);
        if (!Number.isNaN(d.getTime())) capturedAt = d;
      }
      const gps = parsed?.GPSInfo;
      if (gps) {
        gpsLat = dmsToDecimal(gps.GPSLatitude as number[], gps.GPSLatitudeRef as string);
        gpsLon = dmsToDecimal(gps.GPSLongitude as number[], gps.GPSLongitudeRef as string);
      }
    }
  } catch {
    /* ignore */
  }

  if (gpsLat == null || gpsLon == null || capturedAt == null) {
    try {
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
      if (parsed) {
        if (gpsLat == null && typeof parsed.latitude === "number" && Number.isFinite(parsed.latitude)) {
          gpsLat = parsed.latitude;
        }
        if (gpsLon == null && typeof parsed.longitude === "number" && Number.isFinite(parsed.longitude)) {
          gpsLon = parsed.longitude;
        }
        if (capturedAt == null) {
          const dt = parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.DateTime;
          if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
            capturedAt = dt;
          } else if (typeof dt === "string") {
            const d = new Date(dt);
            if (!Number.isNaN(d.getTime())) capturedAt = d;
          }
        }
      }
    } catch {
      /* exifr fallback is best-effort */
    }
  }

  // Decide overall image quality
  let imageQuality: ImageQualityHeuristic["imageQuality"] = "good";
  if (widthPx === 0 || heightPx === 0) {
    imageQuality = "unusable";
  } else if (blurScore !== null && blurScore < 0.05) {
    imageQuality = "poor";
  } else if (
    (brightnessScore !== null && (brightnessScore < 0.1 || brightnessScore > 0.95)) ||
    (blurScore !== null && blurScore < 0.15)
  ) {
    imageQuality = "fair";
  } else if (blurScore !== null && blurScore > 0.5 && brightnessScore !== null && brightnessScore > 0.3 && brightnessScore < 0.85) {
    imageQuality = "excellent";
  }

  return {
    imageQuality,
    blurScore,
    brightnessScore,
    widthPx,
    heightPx,
    thumbnailBuffer,
    capturedAt,
    gpsLat,
    gpsLon,
  };
}
