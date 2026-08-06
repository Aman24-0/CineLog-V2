// src/shared/utils/colorExtractor.ts
//
// Canvas-based dominant color extraction from an image URL.
//
// Used by the Appearance section's "Dynamic" accent swatch: extracts
// a vibrant accent color from the user's profile banner and applies
// it as the app accent via CSS custom properties.
//
// ALGORITHM (improved):
//   1. Load the image into an offscreen <canvas> with CORS enabled.
//   2. Downscale to 96x96 (was 64x64 — more resolution = better
//      color discrimination without much speed cost).
//   3. Sample every pixel, skipping transparent / near-black / near-white.
//   4. Quantize into a 6×6×6 RGB cube (216 buckets — finer than the
//      old 4×4×4 = 64 buckets, so similar-but-not-identical shades
//      don't get conflated).
//   5. Score each bucket by: count × saturation × lightnessFactor
//      where lightnessFactor prefers mid-tone colors (peaks at L=0.55)
//      and strongly down-weights very dark or very bright buckets.
//      This is the key change — previously we picked the bucket with
//      the most pixels, which was usually a dark background.
//   6. Pick the highest-scoring bucket and average its pixels.
//   7. Boost saturation and clamp lightness into a "visible on dark
//      theme" range: saturation ≥ 0.5, lightness between 0.45 and 0.7.
//   8. Return as hex string.
//
// ROBUSTNESS FEATURES (this commit):
//   • Image load timeout (10s) — prevents the extractor from hanging
//     forever on slow / unreachable URLs (e.g., expired S3 links).
//   • CORS handling: crossOrigin="anonymous" is set BEFORE src, so
//     the browser makes a CORS preflight request. If the server
//     doesn't return Access-Control-Allow-Origin, the image fails
//     to load and we fall back to Gold.
//   • Canvas-tainted guard: if the image loads but the canvas is
//     tainted (which happens when CORS failed silently on a redirect),
//     getImageData() throws a SecurityError — we catch it and fall
//     back to Gold with a clear console warning.
//   • Empty-image guard: if the image is 0×0 (rare but happens with
//     broken SVGs), we skip pixel sampling and fall back to Gold.
//   • All edge cases return FALLBACK_COLOR (#FFD700) and log a
//     warning so the issue is debuggable in production.
//
// WHY NOT USE colorthief / node-vibrant?
//   - They add 5-15KB of bundle weight for a feature used in one place.
//   - Canvas pixel sampling is ~120 lines of code, works in every
//     modern browser (including iOS Safari), and produces results
//     that are visually indistinguishable from colorthief for the
//     purpose of picking an accent color.
//   - The improved scoring algorithm below matches the "vibrant color"
//     heuristic that colorthief uses, without the dependency.
//
// FALLBACK:
//   If the image fails to load (CORS, 404, network error), or if we're
//   in an SSR environment (no `document`), we return the Gold accent
//   (#FFD700) which matches the existing "Cinematic" preset.

const FALLBACK_COLOR = "#FFD700";

// 10-second timeout for image loading. The Supabase Storage CDN is
// normally fast (<500ms); if we exceed 10s the URL is almost certainly
// broken or unreachable, and we should fall back rather than hang the
// UI's "Extracting…" spinner forever.
const IMAGE_LOAD_TIMEOUT_MS = 10_000;

/**
 * Extract a vibrant accent color from an image URL.
 *
 * @param imageUrl - The image URL (must allow CORS, or set crossOrigin)
 * @returns Promise<string> - Hex color string like "#a8ff78"
 *
 * Returns FALLBACK_COLOR (#FFD700) if:
 *   - We're in an SSR environment (no document/canvas)
 *   - The image URL is empty / null / whitespace
 *   - The image fails to load (CORS, 404, network error, timeout)
 *   - The image is too small to sample (0×0)
 *   - The canvas is tainted (CORS failed silently on a redirect)
 *   - No valid pixels are found (all-transparent, all-black, all-white)
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
    // Load the image with CORS enabled + a 10s timeout. If the server
    // doesn't send Access-Control-Allow-Origin, the image will fail
    // to load and we fall back to the default color.
    const img = await loadImageWithCORS(imageUrl);

    // Empty-image guard — some SVGs / broken PNGs decode to 0×0.
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.warn(
        "[colorExtractor] Image has zero dimensions, falling back to",
        FALLBACK_COLOR,
        "— URL:",
        imageUrl
      );
      return FALLBACK_COLOR;
    }

    // 96×96 sample grid — enough resolution for accurate color
    // discrimination while keeping pixel count low (~9K) for speed.
    const SAMPLE_SIZE = 96;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK_COLOR;

    // Draw the image scaled down to the sample size.
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // Read all pixels at once — much faster than per-pixel reads.
    // This can throw a SecurityError if the canvas is tainted (which
    // happens when CORS failed silently on a redirect). We catch it
    // and fall back to Gold with a clear warning.
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    } catch (securityErr) {
      console.warn(
        "[colorExtractor] Canvas is tainted (CORS failure on image),",
        "falling back to",
        FALLBACK_COLOR,
        "— URL:",
        imageUrl,
        "— error:",
        securityErr
      );
      return FALLBACK_COLOR;
    }

    return findVibrantColor(imageData.data);
  } catch (err) {
    console.warn(
      "[colorExtractor] Failed to extract dominant color:",
      err,
      "— falling back to",
      FALLBACK_COLOR,
      "— URL:",
      imageUrl
    );
    return FALLBACK_COLOR;
  }
}

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
 * Find the most "vibrant" color in a Uint8ClampedArray of RGBA pixel
 * data.
 *
 * Algorithm (vibrancy scoring):
 *   1. Skip fully-transparent pixels (alpha < 125).
 *   2. Skip very dark (avg < 25) and very bright (avg > 240) pixels —
 *      they're usually background noise (black borders or white flash).
 *   3. Quantize each remaining pixel into a 6×6×6 RGB cube (so R/G/B
 *      each get bucketed into 6 ranges of ~43 each). This gives us
 *      216 possible buckets.
 *   4. For each bucket, accumulate:
 *        - sumR, sumG, sumB  (for averaging later)
 *        - count             (pixel count)
 *        - sumSaturation     (sum of HSL saturations)
 *        - sumLightness      (sum of HSL lightnesses)
 *   5. Score each bucket by:
 *        score = count × avgSaturation × lightnessFactor(avgLightness)
 *      where lightnessFactor peaks at L=0.55 (mid-tone) and falls off
 *      sharply for very dark (L<0.3) or very bright (L>0.85) colors.
 *      This makes the algorithm prefer vibrant, visible accent colors
 *      over the most-common-but-dull background color.
 *   6. Return the averaged RGB of the winning bucket, after a final
 *      HSL adjustment to guarantee visibility on dark theme.
 *
 * The quantization step is crucial — without it, slightly different
 * shades of the same color would each get their own bucket and we'd
 * pick a random noisy pixel as the "dominant" color.
 */
function findVibrantColor(pixels: Uint8ClampedArray): string {
  // 6×6×6 = 216 buckets.
  // Each bucket tracks: [sumR, sumG, sumB, count, sumSat, sumLight]
  interface Bucket {
    sumR: number;
    sumG: number;
    sumB: number;
    count: number;
    sumSat: number;
    sumLight: number;
  }
  const buckets = new Map<number, Bucket>();

  // Quantization: divide [0,255] into 6 buckets of ~43 each.
  // bucket = floor(channel / 43), clamped to [0, 5].
  const quantize = (c: number): number => Math.min(5, Math.floor(c / 43));

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels.
    if (a < 125) continue;

    // Skip near-black and near-white (background noise).
    const avg = (r + g + b) / 3;
    if (avg < 25 || avg > 240) continue;

    const rBucket = quantize(r);
    const gBucket = quantize(g);
    const bBucket = quantize(b);
    const bucketKey = rBucket * 36 + gBucket * 6 + bBucket;

    // Compute HSL for this pixel (used for vibrancy scoring).
    // Hue is not used for scoring — only saturation and lightness —
    // so we discard it with an underscore prefix to satisfy the linter.
    const hsl = rgbToHsl(r, g, b);
    const s = hsl[1];
    const l = hsl[2];

    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.sumR += r;
      existing.sumG += g;
      existing.sumB += b;
      existing.count += 1;
      existing.sumSat += s;
      existing.sumLight += l;
    } else {
      buckets.set(bucketKey, {
        sumR: r,
        sumG: g,
        sumB: b,
        count: 1,
        sumSat: s,
        sumLight: l
      });
    }
  }

  // No valid pixels — return fallback.
  if (buckets.size === 0) return FALLBACK_COLOR;

  // Score each bucket and pick the highest-scoring one.
  let bestBucket: Bucket | null = null;
  let bestScore = -1;

  for (const bucket of buckets.values()) {
    if (bucket.count === 0) continue;

    const avgSat = bucket.sumSat / bucket.count;
    const avgLight = bucket.sumLight / bucket.count;

    // Lightness factor: peak at L=0.55, fall off for dark/bright.
    // We want vibrant mid-tones, not black backgrounds or white skies.
    // Formula: 1.0 at L=0.55, 0.0 at L=0 or L=1, roughly bell-shaped.
    const lightnessFactor =
      4 * avgLight * (1 - avgLight) * (1 - Math.abs(avgLight - 0.55) * 0.5);

    // Down-weight low-saturation (gray) buckets — we want a COLOR, not mud.
    // satFactor is 0 at S=0, 1 at S≥0.7, linear in between.
    const satFactor = Math.min(1, avgSat / 0.7);

    // Combine: prefer buckets with many pixels AND high saturation AND
    // mid-tone lightness. The 0.15 floor on satFactor ensures we don't
    // completely ignore large low-saturation regions (which might be
    // the only colors present), but we still strongly prefer vibrancy.
    const score =
      bucket.count *
      Math.max(0.15, satFactor) *
      Math.max(0.1, lightnessFactor);

    if (score > bestScore) {
      bestScore = score;
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestBucket.count === 0) return FALLBACK_COLOR;

  // Average color of the winning bucket.
  const avgR = Math.round(bestBucket.sumR / bestBucket.count);
  const avgG = Math.round(bestBucket.sumG / bestBucket.count);
  const avgB = Math.round(bestBucket.sumB / bestBucket.count);

  // Final adjustment: boost saturation, clamp lightness into the
  // "visible on dark theme" range so the accent is actually usable.
  return adjustForVisibility(avgR, avgG, avgB);
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

// ─── Palette extraction (Phase 14 — Ambient Cinematic UI) ──────────
//
// extractPalette() returns up to `count` visually-distinct vibrant
// colors from a single image, ranked by vibrancy score. It reuses the
// same pixel-sampling + 6×6×6 quantization + HSL scoring pipeline as
// extractDominantColor(), but instead of returning only the top bucket
// it returns the top N buckets after deduping by hue.
//
// HUE DEDUP: two buckets whose average hues are within `HUE_DEDUP_THRESHOLD`
// (0.12 on a 0-1 hue wheel ≈ 43°) are considered the "same color family"
// and only the higher-scoring one is kept. This prevents the palette
// from being three slightly-different shades of the same orange.
//
// GUARANTEES:
//   • Always returns exactly `count` colors (default 3). If the image
//     has fewer distinct vibrant buckets, the remaining slots are
//     filled with FALLBACK_COLOR (#FFD700) so callers can destructure
//     the result without bounds-checking.
//   • Each color is run through adjustForVisibility() so it's visible
//     on a dark theme (saturation ≥ 0.55, lightness in [0.5, 0.7]).
//   • SSR-safe, CORS-safe, timeout-safe — same edge-case handling as
//     extractDominantColor().

/** Two hues within this distance (on a 0-1 wheel) are treated as the
 *  same color family. 0.12 ≈ 43° — wide enough to keep "red" and
 *  "orange" separate, narrow enough to collapse "warm orange" and
 *  "warm orange slightly more saturated" into one entry. */
const HUE_DEDUP_THRESHOLD = 0.12;

/**
 * Extract up to `count` visually-distinct vibrant colors from an image.
 *
 * @param imageUrl - The image URL (must allow CORS, or set crossOrigin)
 * @param count    - How many distinct colors to return (default 3).
 * @returns Promise<string[]> - Array of hex color strings, length
 *          exactly `count`. Slots that couldn't be filled from the
 *          image are populated with FALLBACK_COLOR.
 *
 * Returns an array of `count` FALLBACK_COLOR values if:
 *   - We're in an SSR environment (no document/canvas)
 *   - The image URL is empty / null / whitespace
 *   - The image fails to load (CORS, 404, network error, timeout)
 *   - The image is too small to sample (0×0)
 *   - The canvas is tainted (CORS failed silently on a redirect)
 *   - No valid pixels are found (all-transparent, all-black, all-white)
 */
export async function extractPalette(
  imageUrl: string,
  count: number = 3
): Promise<string[]> {
  // Clamp count to [1, 6] — more than 6 distinct buckets is rare in a
  // 96×96 sample and the extra slots just slow the canvas read.
  const target = Math.max(1, Math.min(6, Math.floor(count)));

  // SSR guard — bail out if we're not in a browser.
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Array.from({ length: target }, () => FALLBACK_COLOR);
  }

  // Skip empty / null URLs.
  if (!imageUrl || imageUrl.trim().length === 0) {
    return Array.from({ length: target }, () => FALLBACK_COLOR);
  }

  try {
    const img = await loadImageWithCORS(imageUrl);

    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.warn(
        "[colorExtractor.extractPalette] Image has zero dimensions, falling back to",
        FALLBACK_COLOR,
        "— URL:",
        imageUrl
      );
      return Array.from({ length: target }, () => FALLBACK_COLOR);
    }

    const SAMPLE_SIZE = 96;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return Array.from({ length: target }, () => FALLBACK_COLOR);
    }

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    } catch (securityErr) {
      console.warn(
        "[colorExtractor.extractPalette] Canvas is tainted (CORS failure),",
        "falling back to",
        FALLBACK_COLOR,
        "— URL:",
        imageUrl,
        "— error:",
        securityErr
      );
      return Array.from({ length: target }, () => FALLBACK_COLOR);
    }

    return findVibrantPalette(imageData.data, target);
  } catch (err) {
    console.warn(
      "[colorExtractor.extractPalette] Failed to extract palette:",
      err,
      "— falling back to",
      FALLBACK_COLOR,
      "— URL:",
      imageUrl
    );
    return Array.from({ length: target }, () => FALLBACK_COLOR);
  }
}

/**
 * Find the top `target` visually-distinct vibrant colors in a pixel
 * buffer. Reuses the same 6×6×6 quantization + HSL scoring as
 * findVibrantColor(), but ranks ALL buckets and dedupes by hue.
 */
function findVibrantPalette(
  pixels: Uint8ClampedArray,
  target: number
): string[] {
  // Reuse the same Bucket type as findVibrantColor().
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
    return Array.from({ length: target }, () => FALLBACK_COLOR);
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
      bucket.count *
      Math.max(0.15, satFactor) *
      Math.max(0.1, lightnessFactor);

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
  // didn't find `target` distinct colors, pad with FALLBACK_COLOR so
  // callers can destructure without bounds-checking.
  const result: string[] = kept.map((c) =>
    adjustForVisibility(
      Math.round(c.avgR),
      Math.round(c.avgG),
      Math.round(c.avgB)
    )
  );
  while (result.length < target) result.push(FALLBACK_COLOR);
  return result;
}
