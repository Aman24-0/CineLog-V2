// src/shared/utils/colorExtractor.ts
//
// Canvas-based backdrop profiling for adaptive CineLog environments.
//
// This utility samples a resolved image once, preserves representative color
// families as well as full-image luminance, and is intentionally neutral when
// there is no usable artwork. It is shared by the dedicated Detail ambient
// layer and the profile-banner app-wide theme controller.

const PALETTE_FALLBACK_COLOR = "#607080";

// 10-second timeout for image loading. The Supabase Storage CDN is
// normally fast (<500ms); if we exceed 10s the URL is almost certainly
// broken or unreachable, and we should fall back rather than hang the
// UI's "Extracting…" spinner forever.
const IMAGE_LOAD_TIMEOUT_MS = 10_000;

/**
 * Load an image with CORS enabled and a timeout.
 *
 * Sets `crossOrigin = "anonymous"` BEFORE setting `src` so the browser
 * knows to make a CORS request. If the server doesn't support CORS, the
 * image will fail to load (which we catch upstream).
 *
 * The timeout prevents the extractor from hanging forever on slow or
 * unreachable URLs — we resolve with an error after
 * IMAGE_LOAD_TIMEOUT_MS so the caller can fall back gracefully.
 */
function loadImageWithCORS(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Set src to empty string to abort the in-flight request.
      img.src = "";
      reject(
        new Error(
          `Image load timed out after ${IMAGE_LOAD_TIMEOUT_MS}ms: ${url}`
        )
      );
    }, IMAGE_LOAD_TIMEOUT_MS);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(img);
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(new Error(`Image failed to load (CORS or 404): ${url}`));
    };

    // Set src LAST so the crossOrigin attribute is in place when the
    // request fires.
    img.src = url;
  });
}

/**
 * Adjust an RGB color so it's visible as an accent on a dark theme.
 *
 * Steps:
 *   1. Convert to HSL.
 *   2. Boost saturation to ≥ 0.55 (multiplied by 1.25, clamped).
 *   3. Clamp lightness into [0.5, 0.7]:
 *      - If L < 0.5, raise it to 0.5 (avoids too-dark accents that
 *        disappear into the dark background).
 *      - If L > 0.7, lower it to 0.7 (avoids washed-out pastels that
 *        have poor contrast with white text).
 *   4. Convert back to RGB and return as hex.
 *
 * This is the fix for the "extracted color is too dark" bug — previously
 * the extraction picked the most-common color, which was often a dark
 * background tone. Now we pick a vibrant mid-tone AND clamp it into a
 * visible range.
 */
function adjustForVisibility(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Boost saturation (vibrancy).
  const boostedS = Math.min(1, Math.max(0.55, s * 1.25));

  // Clamp lightness into the visible range.
  let clampedL = l;
  if (clampedL < 0.5) clampedL = 0.5;
  else if (clampedL > 0.7) clampedL = 0.7;

  const [adjR, adjG, adjB] = hslToRgb(h, boostedS, clampedL);
  return rgbToHex(adjR, adjG, adjB);
}

/** Convert RGB [0-255] to HSL [0-1, 0-1, 0-1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case rN:
        h = (gN - bN) / delta + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / delta + 2;
        break;
      case bN:
        h = (rN - gN) / delta + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

/** Convert HSL [0-1, 0-1, 0-1] to RGB [0-255, 0-255, 0-255]. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    // Achromatic — gray.
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Convert RGB [0-255, 0-255, 0-255] to a hex string like "#a8ff78". */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Representative palette scoring ────────────────────────────────
//
// findVibrantPalette keeps the established pixel-sampling, quantization,
// and hue-deduplication pipeline as an internal helper of
// extractBackdropProfile(). The returned colors are supporting inputs for
// the shared Detail and ProfileAmbientTheme environment mappers.
//
// HUE DEDUP: two buckets whose average hues are within HUE_DEDUP_THRESHOLD
// (0.12 on a 0-1 hue wheel, approximately 43 degrees) are considered the
// same color family and only the higher-scoring bucket is kept.
//
// GUARANTEES:
//   • It returns exactly `target` colors, padding with a neutral blue-gray
//     when an image has fewer distinct vibrant buckets.
//   • Each color is adjusted into a visible dark-surface range.
//   • SSR-safe, CORS-safe, and timeout-safe.

/** Two hues within this distance (on a 0-1 wheel) are treated as the
 *  same color family. 0.12 ≈ 43° — wide enough to keep "red" and
 *  "orange" separate, narrow enough to collapse "warm orange" and
 *  "warm orange slightly more saturated" into one entry. */
const HUE_DEDUP_THRESHOLD = 0.12;

/**
 * Find the top `target` visually-distinct vibrant colors in a pixel
 * buffer. It ranks all buckets and dedupes by hue.
 */
function findVibrantPalette(
  pixels: Uint8ClampedArray,
  target: number
): string[] {
  // Keep bucket aggregation local to this representative-palette pass.
  interface Bucket {
    sumR: number;
    sumG: number;
    sumB: number;
    count: number;
    sumSat: number;
    sumLight: number;
    sumHue: number;
  }
  const buckets = new Map<number, Bucket>();
  const quantize = (c: number): number => Math.min(5, Math.floor(c / 43));

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    if (a < 125) continue;
    const avg = (r + g + b) / 3;
    if (avg < 25 || avg > 240) continue;

    const rBucket = quantize(r);
    const gBucket = quantize(g);
    const bBucket = quantize(b);
    const bucketKey = rBucket * 36 + gBucket * 6 + bBucket;

    const hsl = rgbToHsl(r, g, b);
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.sumR += r;
      existing.sumG += g;
      existing.sumB += b;
      existing.count += 1;
      existing.sumSat += hsl[1];
      existing.sumLight += hsl[2];
      existing.sumHue += hsl[0];
    } else {
      buckets.set(bucketKey, {
        sumR: r,
        sumG: g,
        sumB: b,
        count: 1,
        sumSat: hsl[1],
        sumLight: hsl[2],
        sumHue: hsl[0]
      });
    }
  }

  if (buckets.size === 0) {
    return Array.from({ length: target }, () => PALETTE_FALLBACK_COLOR);
  }

  // Score every bucket and sort descending.
  const scored: Array<{
    avgHue: number;
    avgSat: number;
    avgLight: number;
    avgR: number;
    avgG: number;
    avgB: number;
    score: number;
  }> = [];

  for (const bucket of buckets.values()) {
    if (bucket.count === 0) continue;
    const avgSat = bucket.sumSat / bucket.count;
    const avgLight = bucket.sumLight / bucket.count;
    const lightnessFactor =
      4 * avgLight * (1 - avgLight) * (1 - Math.abs(avgLight - 0.55) * 0.5);
    const satFactor = Math.min(1, avgSat / 0.7);
    const score =
      bucket.count * Math.max(0.15, satFactor) * Math.max(0.1, lightnessFactor);

    scored.push({
      avgHue: bucket.sumHue / bucket.count,
      avgSat,
      avgLight,
      avgR: bucket.sumR / bucket.count,
      avgG: bucket.sumG / bucket.count,
      avgB: bucket.sumB / bucket.count,
      score
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Greedy hue-dedup: walk the sorted list and keep a color only if
  // its hue is at least HUE_DEDUP_THRESHOLD away from every color
  // we've already kept. This is O(kept × candidates) which is fine
  // because `kept` ≤ `target` ≤ 6.
  const kept: typeof scored = [];
  for (const candidate of scored) {
    if (kept.length >= target) break;
    const tooClose = kept.some((c) => {
      // Hue is circular — compute the shorter arc distance.
      const d = Math.abs(candidate.avgHue - c.avgHue);
      const circularDist = Math.min(d, 1 - d);
      return circularDist < HUE_DEDUP_THRESHOLD;
    });
    if (!tooClose) kept.push(candidate);
  }

  // Adjust each kept color for visibility and convert to hex. If we
  // didn't find `target` distinct colors, pad with PALETTE_FALLBACK_COLOR so
  // callers can destructure without bounds-checking.
  const result: string[] = kept.map((c) =>
    adjustForVisibility(
      Math.round(c.avgR),
      Math.round(c.avgG),
      Math.round(c.avgB)
    )
  );
  while (result.length < target) result.push(PALETTE_FALLBACK_COLOR);
  return result;
}

// ─── Backdrop profile (Detail ambient blending) ───────────────────────
//
// Detail pages need more than a single accent: the ambient surface should
// respond to the artwork's overall luminance as well as its dominant colors.
// This profile deliberately reuses the existing CORS-safe image loader and
// palette extractor. The small second sample pass reads the complete image
// average, including bright whites and dark neutrals that the vibrant-palette
// heuristic intentionally filters out.

export interface BackdropProfile {
  palette: string[];
  averageRgb: [number, number, number];
  luminance: number;
  saturation: number;
}

const FALLBACK_BACKDROP_PROFILE: BackdropProfile = {
  palette: [],
  averageRgb: [24, 32, 44],
  luminance: 0.14,
  saturation: 0.12
};

const backdropProfileCache = new Map<string, Promise<BackdropProfile>>();

/**
 * Extract the dominant palette and overall visual character of a backdrop.
 *
 * Failure is intentionally graceful: Detail keeps its neutral dark fallback
 * and the existing CSS backdrop remains available as the visual source.
 */
export function extractBackdropProfile(
  imageUrl: string,
  count: number = 3
): Promise<BackdropProfile> {
  if (!imageUrl || imageUrl.trim().length === 0) {
    return Promise.resolve(FALLBACK_BACKDROP_PROFILE);
  }

  const cached = backdropProfileCache.get(imageUrl);
  if (cached) return cached;

  const profilePromise = sampleBackdropProfile(imageUrl, count);
  backdropProfileCache.set(imageUrl, profilePromise);
  void profilePromise.catch(() => backdropProfileCache.delete(imageUrl));
  return profilePromise;
}

async function sampleBackdropProfile(
  imageUrl: string,
  count: number
): Promise<BackdropProfile> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return FALLBACK_BACKDROP_PROFILE;
  }

  try {
    const image = await loadImageWithCORS(imageUrl);
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      return FALLBACK_BACKDROP_PROFILE;
    }

    const sampleSize = 96;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return FALLBACK_BACKDROP_PROFILE;

    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    const palette = findVibrantPalette(
      pixels,
      Math.max(1, Math.min(6, Math.floor(count)))
    );
    const stats = calculateBackdropStats(pixels);

    canvas.width = 0;
    canvas.height = 0;
    if (!stats) return FALLBACK_BACKDROP_PROFILE;

    return {
      palette: palette.every(
        (color) => color.toLowerCase() === PALETTE_FALLBACK_COLOR.toLowerCase()
      )
        ? []
        : palette,
      averageRgb: stats.averageRgb,
      luminance: stats.luminance,
      saturation: stats.saturation
    };
  } catch {
    return FALLBACK_BACKDROP_PROFILE;
  }
}

function calculateBackdropStats(pixels: Uint8ClampedArray): {
  averageRgb: [number, number, number];
  luminance: number;
  saturation: number;
} | null {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let luminanceTotal = 0;
  let saturationTotal = 0;
  let weightTotal = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const weight = pixels[index + 3] / 255;
    if (weight < 0.2) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    redTotal += red * weight;
    greenTotal += green * weight;
    blueTotal += blue * weight;
    luminanceTotal +=
      ((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255) * weight;
    saturationTotal += ((max - min) / 255) * weight;
    weightTotal += weight;
  }

  if (!weightTotal) return null;

  return {
    averageRgb: [
      Math.round(redTotal / weightTotal),
      Math.round(greenTotal / weightTotal),
      Math.round(blueTotal / weightTotal)
    ],
    luminance: luminanceTotal / weightTotal,
    saturation: saturationTotal / weightTotal
  };
}
