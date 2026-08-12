// src/routes/api/auth/trakt.ts
//
// CineLog V2 — Trakt OAuth Init (Server-Only)
// ---------------------------------------------------------------------
// GET /api/auth/trakt
//   → 302 redirect to https://api.trakt.tv/oauth/authorize?...
//
// WHAT THIS DOES:
//   Kicks off the Trakt OAuth flow. The user clicks "Connect Trakt"
//   in /settings/sync, which calls this route. We redirect them to
//   Trakt's authorize page where they sign in + grant CineLog
//   permission to read their watched history + ratings.
//
//   After granting permission, Trakt redirects back to
//   /api/auth/trakt/callback?code=...&state=... — see callback.ts.
//
// STATE PARAMETER (CSRF protection):
//   We generate a random state token, store it in a short-lived
//   httpOnly cookie, and include it in the authorize URL. The
//   callback route verifies that the state returned by Trakt
//   matches the cookie value — this prevents CSRF attacks where
//   an attacker tricks the user into connecting the attacker's
//   Trakt account.
//
// AUTHENTICATION (Phase 13 Chunk 2 → security fix):
//   The browser client stores sessions in localStorage (NOT cookies),
//   so the browser never sends a Supabase auth cookie. The "Connect
//   Trakt" button now POSTs to this route with the access token in
//   the request body (NOT in the URL query string), avoiding token
//   leakage into browser history, server logs, and Referer headers.
//
//   The POST handler reads the token from the JSON body and verifies
//   it via `supabase.auth.getUser()`. If the body is absent or the
//   token is invalid, we fall back to the `Authorization` header,
//   then the cookie — matching the resolution order used everywhere
//   else.
//
//   On success, the POST handler returns `{ redirectUrl }` as JSON.
//   The client then navigates to that URL to complete the OAuth flow.
//
//   A GET handler is retained for backward compatibility (e.g. direct
//   URL navigation), but the accessToken query param is no longer
//   read from GET requests — use POST instead.
//
// SECURITY:
//   • POST is the primary entry point — the access token is sent in
//     the request body (NOT in the URL query string), so it never
//     appears in browser history, server logs, or Referer headers.
//   • GET is retained for backward compatibility but no longer reads
//     accessToken from query params — use POST instead.
//   • No body parsing on GET — it is a redirect-only path.
//   • The TRAKT_CLIENT_ID env var is exposed in the URL (it's a
//     public OAuth client_id, designed to be visible in the browser).
//   • The TRAKT_CLIENT_SECRET is NEVER exposed — it's only used in
//     the callback route to exchange the code for a token.
//   • The state cookie is httpOnly + Secure (on HTTPS) + SameSite=Lax
//     so it survives the cross-site redirect to Trakt but can't be
//     read by client-side JS.
//   • The access token in the POST body is consumed server-side
//     and never appears in any log. It's used ONLY to identify the
//     user starting the OAuth flow — it's not forwarded to Trakt.

import { isServer } from "solid-js/web";
import { buildTraktAuthorizeUrl } from "~/lib/server/trakt";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

const STATE_COOKIE_NAME = "trakt_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

/**
 * Generate a random state token for CSRF protection. Uses Node's
 * crypto module (available in the SolidStart server runtime).
 */
function generateStateToken(): string {
  // Use Web Crypto when available (modern Node), fall back to
  // Node's crypto.randomBytes. Both produce cryptographically
  // secure random bytes.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("node:crypto");
  return randomBytes(16).toString("hex");
}

/**
 * Build a Set-Cookie header value for the state cookie, applying
 * Secure + httpOnly + SameSite=Lax + Path=/ + Max-Age.
 *
 * SameSite=Lax is required (NOT Strict) because Trakt's OAuth
 * redirect is a cross-site navigation — Strict would strip the
 * cookie and we'd lose the CSRF state.
 */
function buildStateCookie(
  state: string,
  isHttps: boolean
): string {
  const parts = [
    `${STATE_COOKIE_NAME}=${encodeURIComponent(state)}`,
    "Path=/",
    `Max-Age=${STATE_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Determine if the request is over HTTPS. Mirrors the logic in
 * src/lib/supabase/server.ts — Vercel terminates TLS at the edge
 * and forwards as HTTP, so we check X-Forwarded-Proto.
 */
function isRequestHttps(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0].trim() === "https") {
    return true;
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Verify the user is signed in. We require an active CineLog
 * session BEFORE starting the Trakt OAuth flow — otherwise we
 * wouldn't know which user_id to associate the Trakt tokens with.
 *
 * Returns the user_id on success, or null if not authenticated.
 *
 * Security fix — Token resolution order:
 *   1. Request body `accessToken` field (POST from browser) ← primary
 *   2. `Authorization: Bearer <token>` header  ← server-to-server
 *   3. `sb-*-auth-token` cookie                ← SSR / legacy fallback
 *
 * The POST body path is the primary entry point: the "Connect
 * Trakt" button POSTs with the access token in the JSON body to
 * avoid leaking it into the URL.
 */
async function requireSignedInUser(
  request: Request
): Promise<{ userId: string; email: string } | null> {
  // ── 1. accessToken from POST body (browser) ─────────────────────
  let accessToken: string | null = null;
  try {
    // Clone the request so we can read the body without consuming it
    // for downstream handlers. Only try JSON parse for POST requests.
    if (request.method === "POST") {
      const cloned = request.clone();
      const body = await cloned.json().catch(() => null);
      if (body && typeof body.accessToken === "string" && body.accessToken.length > 0) {
        accessToken = body.accessToken;
      }
    }
  } catch {
    // Malformed body — fall through to other resolution paths.
    accessToken = null;
  }

  // ── 2. Authorization: Bearer header (server-to-server) ───────────
  if (!accessToken) {
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      if (token.length > 0) accessToken = token;
    }
  }

  // ── 3. Cookie fallback (SSR / legacy) ────────────────────────────
  if (!accessToken) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    accessToken = getSupabaseAccessToken(cookieHeader);
  }

  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Use the anon-key client so RLS is enforced — this proves the
  // token belongs to a real, currently-signed-in user.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const email = (data.user.email ?? "").toLowerCase().trim();
  if (!email) return null;

  return { userId: data.user.id, email };
}

/**
 * Core OAuth init logic shared by GET and POST handlers.
 * Verifies the user is signed in, generates CSRF state, and returns
 * the Trakt authorize URL + state cookie.
 */
async function initiateOAuth(
  request: Request
): Promise<{ redirectUrl: string; stateCookie: string } | Response> {
  // ─── 1. Verify the user is signed in ─────────────────────────────
  const user = await requireSignedInUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // ─── 2. Generate + store the CSRF state token ────────────────────
  const state = generateStateToken();
  const isHttps = isRequestHttps(request);
  const stateCookie = buildStateCookie(state, isHttps);

  // ─── 3. Build Trakt's authorize URL ──────────────────────────────
  let authorizeUrl: string;
  try {
    authorizeUrl = buildTraktAuthorizeUrl(state);
  } catch (err) {
    console.error(
      "[trakt/oauth-init] Failed to build authorize URL:",
      err instanceof Error ? err.message : String(err)
    );
    return new Response(
      JSON.stringify({
        error:
          "Trakt OAuth is not configured on the server. " +
          "Set TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, and TRAKT_REDIRECT_URI env vars."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  return { redirectUrl: authorizeUrl, stateCookie };
}

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return new Response(JSON.stringify({ error: "Server-only endpoint" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // GET path: verify session, then redirect directly (backward compat)
  // This no longer reads accessToken from query params — use POST instead.
  const result = await initiateOAuth(event.request);
  if (result instanceof Response) return result;

  return new Response(null, {
    status: 302,
    headers: {
      Location: result.redirectUrl,
      "Set-Cookie": result.stateCookie,
      "Cache-Control": "no-store"
    }
  });
}

// POST /api/auth/trakt — primary entry point for browser clients.
// Reads accessToken from request body, returns { redirectUrl } as JSON.
// The client then navigates to redirectUrl to complete the OAuth flow.
export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return new Response(JSON.stringify({ error: "Server-only endpoint" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const result = await initiateOAuth(event.request);
  if (result instanceof Response) return result;

  // Return the redirect URL as JSON so the client can navigate to it.
  // Set the state cookie on this response so it's stored before the
  // client navigates to Trakt.
  return new Response(
    JSON.stringify({ redirectUrl: result.redirectUrl }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": result.stateCookie,
        "Cache-Control": "no-store"
      }
    }
  );
}
