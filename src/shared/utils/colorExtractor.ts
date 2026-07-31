// src/shared/utils/colorExtractor.ts
//
// Canvas-based dominant color extraction from an image URL.
//
// Used by the Appearance section's "Dynamic" accent swatch: extracts
// the most frequent vibrant color from the user's profile banner and
// uses it as the app accent color.
//
// APPROACH:
//   1. Load the image into an offscreen <canvas> (with CORS-aware
//      crossOrigin = "anonymous" so we can read pixels).
//   2. Downscale to 64x64 for speed — we only need the dominant color,
//      not a full histogram.
//   3. Sample every pixel, bucket RGB into a 4x4x4 color cube (64
//      buckets), and find the most populated bucket.
//   4. Return the average RGB of that bucket as a hex string.
//
// WHY NOT USE A LIBRARY (colorthief, vibrant, etc.)?
//   - They add ~5-15KB of bundle weight for a feature that's only used
//     in one place.
//   - Canvas pixel sampling is ~30 lines of code and works everywhere
//     that supports canvas (all modern browsers, including iOS Safari).
//   - The result is "good enough" for an accent color — pixel-perfect
//     color theory isn't necessary for a UI highlight color.
//
// FALLBACK:
//   If the image fails to load (CORS, 404, network error), or if we're
//   in an SSR environment (no `document`), we return the Gold accent
//   (#FFD700) which matches the existing "Cinematic" preset.

const FALLBACK_COLOR = "#FFD700";

/**
 * Extract the dominant color from an image URL.
 *
 * @param imageUrl - The image URL (must allow CORS, or set crossOrigin)
 * @returns Promise<string> - Hex color string like "#a8ff78"
 *
 * Returns FALLBACK_COLOR (#FFD700) if:
 *   - We're in an SSR environment (no document/canvas)
 *   - The image fails to load (CORS, 404, etc.)
 *   - The image is too small to sample
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  // SSR guard — bail out if we're not in a browser.
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return FALLBACK_COLOR;
  }

  // Skip empty / null URLs.
  if (!imageUrl || imageUrl.trim().length === 0) {
    return FALLBACK_COLOR;
  }

  try {
    // Load the image with CORS enabled so we can read pixel data.
    // If the server doesn't send Access-Control-Allow-Origin, the image
    // will fail to load and we fall back to the default color.
    const img = await loadImageWithCORS(imageUrl);

    // Downscale to 64x64 — enough resolution for color sampling, fast.
    const SAMPLE_SIZE = 64;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK_COLOR;

    // Draw the image scaled down to the sample size.
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // Read all pixels at once — much faster than per-pixel reads.
    const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return findDominantColor(imageData.data);
  } catch (err) {
    console.warn(
      "[colorExtractor] Failed to extract dominant color:",
      err,
      "— falling back to",
      FALLBACK_COLOR
    );
    return FALLBACK_COLOR;
  }
}

/**
 * Load an image with CORS enabled.
 *
 * Sets `crossOrigin = "anonymous"` BEFORE setting `src` so the browser
 * knows to make a CORS request. If the server doesn't support CORS, the
 * image will fail to load (which we catch upstream).
 */
function loadImageWithCORS(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Image failed to load (CORS or 404): ${url}`));

    // Set src LAST so the crossOrigin attribute is in place when the
    // request fires.
    img.src = url;
  });
}

/**
 * Find the dominant color in a Uint8ClampedArray of RGBA pixel data.
 *
 * Algorithm:
 *   1. Skip fully-transparent pixels (alpha < 125).
 *   2. Skip very dark (avg < 30) and very bright (avg > 235) pixels —
 *      they're usually background noise (black borders or white flash).
 *   3. Quantize each remaining pixel into a 4x4x4 RGB cube (so R/G/B
 *      each get bucketed into 4 ranges: 0-63, 64-127, 128-191, 192-255).
 *      This gives us 64 possible buckets.
 *   4. Tally up the most populated bucket.
 *   5. Return the average color of all pixels in that bucket.
 *
 * The quantization step is crucial — without it, slightly different
 * shades of the same color would each get their own bucket and we'd
 * pick a random noisy pixel as the "dominant" color.
 */
function findDominantColor(pixels: Uint8ClampedArray): string {
  // 4x4x4 = 64 buckets. Each bucket is [r_sum, g_sum, b_sum, count].
  const buckets = new Map<number, [number, number, number, number]>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels.
    if (a < 125) continue;

    // Skip near-black and near-white (background noise).
    const avg = (r + g + b) / 3;
    if (avg < 30 || avg > 235) continue;

    // Quantize to 4 levels per channel (64 buckets total).
    // Each channel gets divided into 4 ranges of 64.
    const rBucket = Math.floor(r / 64);
    const gBucket = Math.floor(g / 64);
    const bBucket = Math.floor(b / 64);
    const bucketKey = rBucket * 16 + gBucket * 4 + bBucket;

    const existing = buckets.get(bucketKey);
    if (existing) {
      existing[0] += r;
      existing[1] += g;
      existing[2] += b;
      existing[3] += 1;
    } else {
      buckets.set(bucketKey, [r, g, b, 1]);
    }
  }

  // No valid pixels — return fallback.
  if (buckets.size === 0) return FALLBACK_COLOR;

  // Find the bucket with the most pixels.
  let bestBucket: [number, number, number, number] | null = null;
  let bestCount = 0;
  for (const bucket of buckets.values()) {
    if (bucket[3] > bestCount) {
      bestCount = bucket[3];
      bestBucket = bucket;
    }
  }

  if (!bestBucket) return FALLBACK_COLOR;

  // Average color of the winning bucket.
  const avgR = Math.round(bestBucket[0] / bestBucket[3]);
  const avgG = Math.round(bestBucket[1] / bestBucket[3]);
  const avgB = Math.round(bestBucket[2] / bestBucket[3]);

  // Boost saturation slightly — dominant colors from photos tend to
  // be muted because of JPEG compression and lighting. A small S boost
  // makes the accent color feel more "intentional" rather than muddy.
  const boosted = boostSaturation(avgR, avgG, avgB, 1.15);

  return rgbToHex(boosted[0], boosted[1], boosted[2]);
}

/**
 * Boost the saturation of an RGB color by a factor (1.0 = no change).
 *
 * Converts to HSL, multiplies S, converts back. Useful for making
 * extracted accent colors feel more vibrant without changing their hue.
 */
function boostSaturation(
  r: number,
  g: number,
  b: number,
  factor: number
): [number, number, number] {
  const hsl = rgbToHsl(r, g, b);
  // Boost saturation, clamped to [0, 1].
  hsl[1] = Math.min(1, hsl[1] * factor);
  return hslToRgb(hsl[0], hsl[1], hsl[2]);
}

/** Convert RGB [0-255] to HSL [0-1, 0-1, 0-1]. */
function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
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
function hslToRgb(
  h: number,
  s: number,
  l: number
): [number, number, number] {
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

/** The fallback color used when extraction fails. */
export const DYNAMIC_ACCENT_FALLBACK = FALLBACK_COLOR;
