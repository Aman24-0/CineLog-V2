// src/routes/api/profile/banner-from-url.ts
//
// CineLog V2 — Profile Banner from URL Proxy (Phase 18 deep fix)
// ---------------------------------------------------------------------
// POST /api/profile/banner-from-url
//
// Body: { "url": string }
// Response: { "url": string }  // the Supabase Storage public URL
//
// WHY THIS ROUTE EXISTS
// ---------------------
// When a user pastes an external image URL (e.g. wallpaperflare.com) as
// their profile banner, the URL is stored in profiles.banner_url and the
// ProfileBanner component renders it via <img src={url}>. This works in
// most browsers, but some image hosts (notably wallpaperflare) return
// response headers that trigger CORB / CORP / "Blocked by response not
// same-origin" errors in certain browsers (Lemur, some Safari versions,
// hardened Chrome). The <img> never loads and the banner is blank.
//
// The deep fix is to NOT rely on the external URL at all — fetch the
// image SERVER-SIDE (where there are no CORS/CORB restrictions), upload
// it to Supabase Storage (the `banners` bucket), and store the resulting
// same-origin Storage URL in profiles.banner_url. The <img> then loads
// from Supabase's CDN, which is CORS-permissive and never blocked.
//
// FLOW
// ----
//   1. Authenticate via Authorization: Bearer header (browser localStorage
//      sessions, same as every other API route).
//   2. Validate the request body: must have a string `url` that is a
//      valid http(s) URL.
//   3. Fetch the image server-side. Enforce:
//        - max 10 MB response size (matches BannerEditor's 10 MB upload
//          limit — we don't want to proxy + store giant images)
//        - Content-Type must be image/* (reject HTML / JSON / anything
//          else — defends against using this route as a generic SSRF
//          proxy)
//        - 10-second timeout on the fetch (defends against hung
//          external hosts)
//   4. Upload the image bytes to Supabase Storage → banners bucket →
//      "<uid>/banner.jpg" (upsert). The banners bucket's RLS requires
//      the first path segment to match auth.uid(), so the user can only
//      write to their own folder.
//   5. Return the public URL of the uploaded object.
//
// SECURITY
// --------
//   - The route is authenticated (Bearer token required).
//   - The external URL is fetched server-side only — no SSRF surface to
//     the browser.
//   - We restrict to http(s) URLs (no file://, no data:, no blob:).
//   - We restrict Content-Type to image/* — defends against proxying
//     HTML / JSON / arbitrary binary.
//   - We enforce a 10 MB size cap on the response body.
//   - We enforce a 10-second timeout on the external fetch.
//   - The banners bucket's RLS ensures a user can only write to their
//     own folder, so even if the route were abused, the blast radius is
//     limited to the caller's own banner slot.
//
// COMPLIANCE
// ----------
//   - Auth: Bearer header (no @supabase/ssr cookies introduced).
//   - Rate limiting: not added here because the route is authenticated
//     and the cost is bounded (one external fetch + one Storage upload
//     per call). If abuse becomes a concern, add a rate-limit check via
//     the existing rate_limit_buckets table.
//   - Design system: unchanged (no UI changes — the BannerEditor just
//     calls this route instead of storing the raw URL).

import { isServer } from "solid-js/web";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";

interface APIEvent {
  request: Request;
}

interface RequestBody {
  url: string;
}

interface SuccessResponse {
  url: string;
}

interface ErrorResponse {
  error: string;
  hint?: string;
}

/** Max image size we'll proxy + upload (matches BannerEditor's 10 MB limit). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Timeout for the external image fetch (ms). */
const FETCH_TIMEOUT_MS = 10_000;

/** Allowed Content-Type prefixes for the external image response. */
const ALLOWED_CONTENT_TYPE_PREFIX = "image/";

function jsonResponse(
  body: unknown,
  status = 200,
  opts?: { cacheControl?: string }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  headers["Cache-Control"] = opts?.cacheControl ?? "no-store";
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Validate that the request body has a string `url` that is a valid
 * http(s) URL. Returns the trimmed URL on success, or null on failure.
 */
function validateUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Authenticate the caller via the Bearer header. Returns the user id
 * and a user-scoped Supabase client (for the Storage upload), or null
 * on failure.
 */
async function requireSignedInUser(
  request: Request
): Promise<{ userId: string; userClient: SupabaseClient } | null> {
  const accessToken = getSupabaseAccessTokenFromRequest(request);
  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Verify the token via getUser() — never trust the header payload
  // directly since headers can be tampered with.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  // Build a user-scoped client for the Storage upload. We inject the
  // access token via global.headers.Authorization so the Storage upload
  // is authenticated + RLS-enforced (the banners bucket requires
  // auth.uid() to match the first path segment of the upload path).
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  return { userId: data.user.id, userClient };
}

/**
 * Fetch the external image server-side, enforcing size + Content-Type +
 * timeout limits. Returns the image bytes as a Blob on success, or
 * throws an Error with a human-readable message on failure.
 */
async function fetchExternalImage(url: string): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      // Don't send cookies / credentials to the external host — this is
      // a server-side proxy, not a user-agent fetch.
      credentials: "omit",
      redirect: "follow"
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Image fetch timed out (10s).");
    }
    throw new Error(`Image fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    throw new Error(`Image host returned HTTP ${resp.status}.`);
  }

  // Validate Content-Type BEFORE reading the body (so we don't download
  // a 100 MB HTML page just to reject it).
  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(ALLOWED_CONTENT_TYPE_PREFIX)) {
    throw new Error(`URL did not return an image (got ${contentType || "unknown content-type"}).`);
  }

  // Validate Content-Length if present (some hosts don't send it — in
  // that case we rely on the streamed-size check below).
  const contentLength = resp.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (over ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB).`);
  }

  // Read the body as a Blob. We check the size after reading to defend
  // against hosts that don't send Content-Length (or lie about it).
  let blob: Blob;
  try {
    blob = await resp.blob();
  } catch (err) {
    throw new Error(`Failed to read image body: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (over ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB).`);
  }

  // Final Content-Type check on the Blob itself (in case the host lied
  // in the response header). The Blob.type is derived from the response
  // Content-Type, so this is mostly a belt-and-suspenders check.
  if (!blob.type.toLowerCase().startsWith(ALLOWED_CONTENT_TYPE_PREFIX)) {
    throw new Error(`URL did not return an image (got ${blob.type || "unknown content-type"}).`);
  }

  return blob;
}

/**
 * Upload the image Blob to Supabase Storage → banners bucket →
 * "<uid>/banner.jpg". Returns the public URL of the uploaded object.
 */
async function uploadToStorage(
  userClient: SupabaseClient,
  userId: string,
  blob: Blob
): Promise<string> {
  // Derive a sensible file extension from the Content-Type so the
  // Storage object has the right MIME type when served back. Default
  // to .jpg for unknown image types (browsers will still render it).
  const ext = blob.type.includes("png")
    ? "png"
    : blob.type.includes("webp")
      ? "webp"
      : "jpg";
  const filePath = `${userId}/banner.${ext}`;

  const { error: uploadError } = await userClient.storage
    .from("banners")
    .upload(filePath, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = userClient.storage
    .from("banners")
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." } satisfies ErrorResponse, 500);
  }

  // ── 1. Authenticate ──────────────────────────────────────────────
  let auth: { userId: string; userClient: SupabaseClient } | null;
  try {
    auth = await requireSignedInUser(event.request);
  } catch (err) {
    console.error("[api/profile/banner-from-url] session read failed:", err);
    return jsonResponse({ error: "Failed to read session." } satisfies ErrorResponse, 500);
  }
  if (!auth) {
    return jsonResponse({ error: "Unauthorized" } satisfies ErrorResponse, 401);
  }
  const { userId, userClient } = auth;

  // ── 2. Parse + validate the request body ─────────────────────────
  let body: RequestBody;
  try {
    body = (await event.request.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." } satisfies ErrorResponse, 400);
  }

  const imageUrl = validateUrl(body?.url);
  if (!imageUrl) {
    return jsonResponse({
      error: "Please provide a valid image URL (https://...)."
    } satisfies ErrorResponse, 400);
  }

  // ── 3. Fetch the external image server-side ──────────────────────
  let blob: Blob;
  try {
    blob = await fetchExternalImage(imageUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[api/profile/banner-from-url] image fetch failed:", msg, "— url:", imageUrl);
    return jsonResponse({
      error: msg,
      hint: "Try a different image URL, or upload the image directly."
    } satisfies ErrorResponse, 502);
  }

  // ── 4. Upload to Supabase Storage ────────────────────────────────
  let storageUrl: string;
  try {
    storageUrl = await uploadToStorage(userClient, userId, blob);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/profile/banner-from-url] storage upload failed:", msg);
    return jsonResponse({
      error: msg,
      hint: "If this persists, try uploading the image directly via the Upload tab."
    } satisfies ErrorResponse, 502);
  }

  // ── 5. Return the Storage URL ────────────────────────────────────
  return jsonResponse({ url: storageUrl } satisfies SuccessResponse, 200);
}
