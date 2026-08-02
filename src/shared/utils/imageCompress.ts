/**
 * CineLog V2 — Image Compression Utility
 * ---------------------------------------------------------------------
 * Client-side image compression for profile banner uploads.
 *
 * Uses the browser's native Canvas API to resize and compress images
 * before uploading to Supabase Storage. This avoids uploading 10MB
 * raw photos and keeps the banner fast to load.
 *
 * Pipeline:
 *   1. Read the File as a data URL
 *   2. Draw it onto a canvas at the target dimensions
 *   3. Export as JPEG at 85% quality
 *   4. Return a Blob ready for upload
 *
 * The banner aspect ratio is 16:5 (desktop) / 16:6 (mobile).
 * We crop to 16:5 (the wider ratio) so the image works on all screens.
 */

/** Maximum banner width in pixels. */
const MAX_BANNER_WIDTH = 1920;

/** Target banner aspect ratio (width / height). */
const BANNER_ASPECT_RATIO = 16 / 5;

/** JPEG quality for compressed output (0-1). */
const JPEG_QUALITY = 0.85;

/**
 * Compress and crop an image file for use as a profile banner.
 *
 * @param file The raw image File from the file input.
 * @returns A Promise resolving to a Blob (JPEG, compressed, cropped to 16:5).
 */
export async function compressBannerImage(file: File): Promise<Blob> {
  // Read the file into an Image element
  const img = await loadImage(file);

  // Calculate the crop dimensions (center crop to 16:5)
  const sourceRatio = img.width / img.height;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;

  if (sourceRatio > BANNER_ASPECT_RATIO) {
    // Source is wider than target — crop sides
    sw = img.height * BANNER_ASPECT_RATIO;
    sx = (img.width - sw) / 2;
  } else {
    // Source is taller than target — crop top/bottom
    sh = img.width / BANNER_ASPECT_RATIO;
    sy = (img.height - sh) / 2;
  }

  // Calculate output dimensions (cap at MAX_BANNER_WIDTH)
  const outWidth = Math.min(sw, MAX_BANNER_WIDTH);
  const outHeight = outWidth / BANNER_ASPECT_RATIO;

  // Draw onto canvas
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Failed to get canvas context for image compression");

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Draw the cropped image
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

  // Export as JPEG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new Error("Failed to compress image — canvas.toBlob returned null")
          );
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Load a File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image file"));
    };
    img.src = url;
  });
}

/**
 * Upload a banner image to Supabase Storage.
 *
 * @param userId The user's ID (used as the file path).
 * @param blob The compressed image blob.
 * @returns The public URL of the uploaded image.
 *
 * On upload failure (bucket missing, RLS rejection, network error),
 * falls back to a base64 data URL so the user's banner still updates
 * locally — the data URL is stored in profiles.banner_url. This is
 * larger than a Storage URL but avoids blocking the user's edit.
 */
export async function uploadBannerToSupabase(
  userId: string,
  blob: Blob
): Promise<string> {
  const { getBrowserClient } = await import("~/lib/supabase/browser");
  const supabase = getBrowserClient();

  // Upload path: <userId>/banner.jpg — the banners bucket's RLS
  // requires the first path segment to match auth.uid() (see migration
  // 20260805_create_banners_bucket.sql).
  const filePath = `${userId}/banner.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("banners")
    .upload(filePath, blob, {
      contentType: "image/jpeg",
      upsert: true
    });

  if (uploadError) {
    // Log the full error so the actual cause is visible in the
    // browser console. Common causes:
    //   • "Bucket not found" — the banners bucket doesn't exist
    //     (fixed by migration 20260805_create_banners_bucket.sql)
    //   • "new row violates row-level security policy" — RLS rejected
    //     the write because the path doesn't start with the caller's uid
    //   • "Payload too large" — the blob exceeds the bucket's
    //     file_size_limit (5 MB for banners)
    console.warn(
      "[uploadBanner] Storage upload failed, falling back to data URL:",
      uploadError.message,
      uploadError
    );
    return blobToDataUrl(blob);
  }

  // Get the public URL — banners is a public bucket so the URL is
  // directly usable in <img src=...>.
  const { data: urlData } = supabase.storage
    .from("banners")
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Convert a Blob to a data URL (base64). Used as a fallback when
 * Supabase Storage is unavailable.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("Failed to convert blob to data URL"));
    reader.readAsDataURL(blob);
  });
}
