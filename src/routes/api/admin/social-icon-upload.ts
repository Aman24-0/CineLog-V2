// src/routes/api/admin/social-icon-upload.ts
//
// CineLog V2 — Admin Social Icon Upload API
// ---------------------------------------------------------------------
// POST /api/admin/social-icon-upload — upload an SVG icon for a social link
//
// Accepts multipart/form-data with:
//   - "svg" — the SVG file (Blob)
//   - "linkId" — the SocialLink.id this icon belongs to
//
// The SVG is uploaded to the Supabase Storage `social-icons` bucket
// at path: social-icons/<linkId>.svg
//
// The bucket must exist (see migration 20260810_create_social_icons_bucket.sql).
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

    const svgBlob = formData.get("svg");
    const linkId = formData.get("linkId");

    if (!svgBlob || !(svgBlob instanceof Blob)) {
      return jsonError("Missing or invalid SVG file", 400);
    }

    if (!linkId || typeof linkId !== "string" || linkId.length === 0) {
      return jsonError("Missing linkId", 400);
    }

    // Validate file size (max 100KB)
    if (svgBlob.size > 100 * 1024) {
      return jsonError("SVG file too large (max 100KB)", 400);
    }

    // Validate MIME type
    const contentType = svgBlob.type;
    if (contentType !== "image/svg+xml" && contentType !== "image/svg" && !contentType.startsWith("text/")) {
      // Some browsers send SVGs as application/octet-stream — allow if content looks like SVG
      const text = await svgBlob.text();
      if (!text.includes("<svg")) {
        return jsonError("Only SVG files are allowed", 400);
      }
    }

    // Server-side re-sanitization (belt + suspenders)
    // The client already sanitized, but we sanitize again on the server
    // to prevent any bypass of client-side checks.
    const svgText = await svgBlob.text();
    const sanitized = serverSanitizeSvg(svgText);
    if (!sanitized) {
      return jsonError("SVG failed security validation", 400);
    }

    // Upload to Supabase Storage
    const supabase = createAdminClient();
    const filePath = `${linkId}.svg`;

    const { error: uploadError } = await supabase.storage
      .from("social-icons")
      .upload(filePath, new Blob([sanitized], { type: "image/svg+xml" }), {
        contentType: "image/svg+xml",
        upsert: true,
      });

    if (uploadError) {
      console.error("[social-icon-upload] Storage upload error:", uploadError);
      return jsonError(`Upload failed: ${uploadError.message}`, 500);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("social-icons")
      .getPublicUrl(filePath);

    // Audit log
    await logAdminAction(event, adminCheck.admin, {
      action: "social_icon.upload",
      entity_type: "social_link",
      entity_id: linkId,
      payload: { iconUrl: urlData.publicUrl },
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
