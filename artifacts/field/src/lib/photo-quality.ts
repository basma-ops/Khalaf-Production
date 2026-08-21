import exifr from "exifr";

// On-device quality check for capture-first photo uploads. Returns a
// list of human-readable warnings ("blur", "very dark", "missing GPS").
// All thresholds are deliberately permissive — the result surfaces as a
// non-blocking chip on the captured photo, never as a hard gate.

export interface PhotoQuality {
  blurScore: number; // higher = sharper
  meanLuminance: number; // 0..255
  hasGps: boolean;
  warnings: string[]; // arabic, user-facing
}

const BLUR_THRESHOLD = 90; // tuned for 256x256 luminance laplacian
const DARK_THRESHOLD = 35; // mean luminance out of 255

export async function analyzePhotoQuality(file: File | Blob): Promise<PhotoQuality> {
  const [imageStats, gps] = await Promise.all([
    sampleLuminanceAndBlur(file),
    extractGps(file),
  ]);

  const warnings: string[] = [];
  if (imageStats.blurScore < BLUR_THRESHOLD) warnings.push("صورة قد تكون مهتزة");
  if (imageStats.meanLuminance < DARK_THRESHOLD) warnings.push("الإضاءة منخفضة جداً");
  if (!gps) warnings.push("لا توجد إحداثيات GPS في الصورة");

  return {
    blurScore: imageStats.blurScore,
    meanLuminance: imageStats.meanLuminance,
    hasGps: gps,
    warnings,
  };
}

async function extractGps(file: File | Blob): Promise<boolean> {
  try {
    const out = await exifr.gps(file);
    return Boolean(out && typeof out.latitude === "number" && typeof out.longitude === "number");
  } catch {
    return false;
  }
}

async function sampleLuminanceAndBlur(
  file: File | Blob,
): Promise<{ blurScore: number; meanLuminance: number }> {
  // Decode → sample to a 256×256 canvas → grayscale → variance of laplacian.
  // 256² is small enough to stay sub-100ms even on a budget Android, while
  // keeping enough detail to distinguish a focused shot from a smear.
  const bitmap = await safeCreateBitmap(file);
  if (!bitmap) return { blurScore: Number.POSITIVE_INFINITY, meanLuminance: 128 };
  const W = 256;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close?.();
    return { blurScore: Number.POSITIVE_INFINITY, meanLuminance: 128 };
  }
  ctx.drawImage(bitmap, 0, 0, W, H);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = new Uint8ClampedArray(W * H);
  let lumSum = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Rec.601 luma — cheap & adequate for blur detection.
    const y = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gray[j] = y;
    lumSum += y;
  }
  const meanLuminance = lumSum / (W * H);

  // Variance of laplacian: sum over interior pixels of
  //   (4*p - up - down - left - right)^2 / N. Higher = sharper.
  let varSum = 0;
  let count = 0;
  let mean = 0;
  // Two-pass for numeric stability (mean then variance).
  const lap = new Int32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const v =
        4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - W] - gray[idx + W];
      lap[idx] = v;
      mean += v;
      count++;
    }
  }
  mean /= count;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const d = lap[idx] - mean;
      varSum += d * d;
    }
  }
  const blurScore = varSum / count;
  return { blurScore, meanLuminance };
}

async function safeCreateBitmap(file: File | Blob): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(file);
    }
  } catch {}
  return null;
}
