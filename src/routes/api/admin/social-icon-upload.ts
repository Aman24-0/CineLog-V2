// src/routes/api/admin/social-icon-upload.ts
//
// CineLog V2 — Admin Social Icon Upload API
// ---------------------------------------------------------------------
// POST /api/admin/social-icon-upload — upload an SVG or PNG icon for a social link
//
// Accepts multipart/form-data with:
//   - "file" — the SVG or PNG file (Blob)
//   - "linkId" — the SocialLink.id this icon belongs to
//
// The icon is uploaded to the Supabase Storage `social-icons` bucket
// at path: social-icons/<linkId>.<ext>
//
// If the bucket does not exist, it is created automatically (runtime
// bucket creation) to prevent "Bucket not found" errors. This is the
// same fix pattern used for the banners bucket.
//
// The service_role client is used to bypass RLS.
//
// Returns: { iconUrl: string } — the public URL of the uploaded icon.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

const BUCKET_NAME = "social-icons";
const MAX_FILE_SIZE = 100 * 1024; // 100KB

// ─── Runtime bucket creation ────────────────────────────────────
// If the social-icons bucket doesn't exist (migration not applied),
// create it on the first upload attempt. This prevents "Bucket not found"
// errors and follows the same pattern used for the banners bucket fix.

let bucketEnsured = false;

async function ensureBucketExists(supabase: ReturnType<typeof createAdminClient>): Promise<boolean> {
  if (bucketEnsured) return true;

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error("[social-icon-upload] listBuckets error:", listError);
      // Don't cache failure — try again next time
      return false;
    }

    const exists = buckets?.some((b) => b.id === BUCKET_NAME);
    if (exists) {
      bucketEnsured = true;
      return true;
    }

    // Bucket doesn't exist — create it
    if (process.env.NODE_ENV !== "production") {
      console.log(`[social-icon-upload] Bucket '${BUCKET_NAME}' not found. Creating it...`);
    }
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ["image/svg+xml", "image/svg", "image/png"],
    });

    if (createError) {
      console.error("[social-icon-upload] createBucket error:", createError);
      return false;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[social-icon-upload] Bucket '${BUCKET_NAME}' created successfully.`);
    }
    bucketEnsured = true;
    return true;
  } catch (err) {
    console.error("[social-icon-upload] ensureBucketExists error:", err);
    return false;
  }
}

// ─── POST /api/admin/social-icon-upload ──────────────────────────

export async function POST(event: APIEvent) {
  // Auth + rate limit
  const adminCheck = await requireAdmin(event);
  if (!adminCheck.ok) {
    return new Response("Unauthorized", { status: 401 });
  }
  const rateLimitErr = await enforceAdminMutationRateLimit(event, adminCheck.admin, "social-icon-upload");
  if (rateLimitErr) return rateLimitErr;

  try {
    const formData = await event.request.formData();

    // Accept both "file" (new) and "svg" (backward compat) field names
    const fileBlob = formData.get("file") || formData.get("svg");
    const linkId = formData.get("linkId");

    if (!fileBlob || !(fileBlob instanceof Blob)) {
      return jsonError("Missing or invalid icon file", 400);
    }

    if (!linkId || typeof linkId !== "string" || linkId.length === 0) {
      return jsonError("Missing linkId", 400);
    }

    // Validate file size (max 100KB)
    if (fileBlob.size > MAX_FILE_SIZE) {
      return jsonError("Icon file too large (max 100KB)", 400);
    }

    // Determine file type (SVG or PNG)
    const contentType = fileBlob.type;
    const isSvg = contentType === "image/svg+xml" || contentType === "image/svg";
    const isPng = contentType === "image/png";

    // Also check file extension as a fallback (some browsers send application/octet-stream)
    const fileName = (formData.get("fileName") as string) || "";
    const extFromName = fileName.toLowerCase().endsWith(".png") ? "png"
      : fileName.toLowerCase().endsWith(".svg") ? "svg"
      : null;

    let fileType: "svg" | "png";
    let fileContent: Blob;

    if (isPng || extFromName === "png") {
      // PNG file — no sanitization needed (binary raster format)
      fileType = "png";
      fileContent = fileBlob;
    } else if (isSvg || extFromName === "svg") {
      // SVG file — needs sanitization
      fileType = "svg";
      const svgText = await fileBlob.text();

      // Check if it looks like SVG
      if (!svgText.includes("<svg")) {
        return jsonError("File does not appear to be a valid SVG", 400);
      }

      // Server-side sanitization (belt + suspenders)
      const sanitized = serverSanitizeSvg(svgText);
      if (!sanitized) {
        return jsonError("SVG failed security validation", 400);
      }

      fileContent = new Blob([sanitized], { type: "image/svg+xml" });
    } else {
      // Try to detect SVG by content (some browsers send as text/* or application/octet-stream)
      const text = await fileBlob.text();
      if (text.includes("<svg")) {
        fileType = "svg";
        const sanitized = serverSanitizeSvg(text);
        if (!sanitized) {
          return jsonError("SVG failed security validation", 400);
        }
        fileContent = new Blob([sanitized], { type: "image/svg+xml" });
      } else {
        return jsonError("Only SVG or PNG files are allowed", 400);
      }
    }

    // Ensure the storage bucket exists (runtime creation if migration not applied)
    const supabase = createAdminClient();
    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return jsonError("Storage bucket could not be initialized. Please contact support.", 500);
    }

    // Upload to Supabase Storage
    const filePath = `${linkId}.${fileType}`;
    const mimeType = fileType === "svg" ? "image/svg+xml" : "image/png";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileContent, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[social-icon-upload] Storage upload error:", uploadError);
      // If we get "Bucket not found" despite ensureBucketExists, reset the flag
      if (uploadError.message?.includes("Bucket not found")) {
        bucketEnsured = false;
      }
      return jsonError(`Upload failed: ${uploadError.message}`, 500);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    // Audit log
    await logAdminAction(event, adminCheck.admin, {
      action: "social_icon.upload",
      entity_type: "social_link",
      entity_id: linkId,
      payload: { iconUrl: urlData.publicUrl, fileType },
    });

    return new Response(JSON.stringify({ iconUrl: urlData.publicUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[social-icon-upload] Error:", err);
    return jsonError("Internal server error", 500);
  }
}

// ─── DELETE /api/admin/social-icon-upload ─────────────────────────
// Delete an icon file from storage when a social link's icon is removed
// or the link is deleted. Accepts: { linkId: string, fileType: "svg" | "png" }

export async function DELETE(event: APIEvent) {
  const adminCheck = await requireAdmin(event);
  if (!adminCheck.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await event.request.json().catch(() => ({})) as { linkId?: string; fileTypes?: string[] };
    const { linkId, fileTypes } = body;

    if (!linkId || typeof linkId !== "string") {
      return jsonError("Missing linkId", 400);
    }

    const supabase = createAdminClient();

    // Try to delete both SVG and PNG variants (we may not know which one exists)
    const typesToDelete = fileTypes || ["svg", "png"];
    const errors: string[] = [];

    for (const ext of typesToDelete) {
      const filePath = `${linkId}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

      if (error && !error.message?.includes("not found")) {
        errors.push(`${ext}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.error("[social-icon-upload] Delete errors:", errors);
    }

    await logAdminAction(event, adminCheck.admin, {
      action: "social_icon.delete",
      entity_type: "social_link",
      entity_id: linkId,
      payload: { deletedTypes: typesToDelete },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[social-icon-upload] DELETE error:", err);
    return jsonError("Internal server error", 500);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Server-side SVG sanitization.
 *
 * This is a stricter version that removes:
 *   - <script> elements
 *   - Event handler attributes (on*)
 *   - javascript:/data:/vbscript: URLs
 *   - External xlink:href references (only #fragment allowed)
 *   - HTML comments
 *   - <?xml?> and <!DOCTYPE> declarations
 *
 * The SVG must:
 *   - Start with <svg
 *   - End with </svg>
 *   - Be under 100KB
 */
function serverSanitizeSvg(svgText: string): string | null {
  if (typeof svgText !== "string" || svgText.length === 0) return null;
  if (svgText.length > 100 * 1024) return null;

  // Must contain <svg and </svg>
  if (!/<svg[\s>]/i.test(svgText)) return null;
  if (!/<\/svg\s*>/i.test(svgText)) return null;

  let cleaned = svgText;

  // Remove <script> elements
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script\s*>/gi, "");

  // Remove processing instructions and declarations
  cleaned = cleaned.replace(/<\?xml[\s\S]*?\?>/gi, "");
  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?>/gi, "");

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // Remove event handler attributes (on*)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript:/data:/vbscript: URLs in href, src, action
  cleaned = cleaned.replace(
    /(href|src|action|xlink:href)\s*=\s*"(javascript:[^"]*|data:[^"]*|vbscript:[^"]*)"/gi,
    '$1=""'
  );
  cleaned = cleaned.replace(
    /(href|src|action|xlink:href)\s*=\s*'(javascript:[^']*|data:[^']*|vbscript:[^']*)'/gi,
    "$1=''"
  );

  // Remove external xlink:href (only allow #fragment references)
  cleaned = cleaned.replace(
    /xlink:href\s*=\s*"(?!#)[^"]*"/gi,
    'xlink:href=""'
  );

  // Verify the result still has <svg>
  if (!/<svg[\s>]/i.test(cleaned)) return null;

  return cleaned;
}
