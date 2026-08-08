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
// AUTHENTICATION (Phase 13 Chunk 2):
//   The browser client stores sessions in localStorage (NOT cookies),
//   so the browser never sends a Supabase auth cookie. The "Connect
//   Trakt" button is a navigation (window.location.href), not a
//   fetch() — so we cannot receive the access token via the
//   `Authorization: Bearer` header either.
//
//   Instead, the frontend appends `?accessToken=<token>` to the
//   navigation URL. We read it from the query string and verify it
//   via `supabase.auth.getUser()`. If the query param is absent
//   (e.g. a direct navigation, an SSR call, or a server-to-server
//   ping), we fall back to the `Authorization` header, then the
//   cookie — matching the resolution order used everywhere else.
//
// SECURITY:
//   • No body parsing — this is a GET redirect.
//   • The TRAKT_CLIENT_ID env var is exposed in the URL (it's a
//     public OAuth client_id, designed to be visible in the browser).
//   • The TRAKT_CLIENT_SECRET is NEVER exposed — it's only used in
//     the callback route to exchange the code for a token.
//   • The state cookie is httpOnly + Secure (on HTTPS) + SameSite=Lax
//     so it survives the cross-site redirect to Trakt but can't be
//     read by client-side JS.
//   • The access token in the query param is consumed server-side
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
 * Phase 13 Chunk 2 — Token resolution order:
 *   1. `?accessToken=<token>` query param  ← browser navigation path
 *   2. `Authorization: Bearer <token>` header  ← server-to-server
 *   3. `sb-*-auth-token` cookie                ← SSR / legacy fallback
 *
 * The browser navigation path is the primary entry point: the
 * "Connect Trakt" button does `window.location.href = "/api/auth/
 * trakt?accessToken=<token>"` because navigations can't carry an
 * Authorization header.
 */
async function requireSignedInUser(
  request: Request
): Promise<{ userId: string; email: string } | null> {
  // ── 1. accessToken query param (browser navigation) ──────────────
  // Read from the URL — populated by TraktIntegrationCard's
  // handleConnectClick(). The token is a JWT; URL-encoding is
  // safe (it contains only base64url chars + dots, but the frontend
  // encodes it anyway).
  let accessToken: string | null = null;
  try {
    const url = new URL(request.url);
    accessToken = url.searchParams.get("accessToken");
  } catch {
    // Malformed URL — fall through to other resolution paths.
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

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return new Response(JSON.stringify({ error: "Server-only endpoint" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // ─── 1. Verify the user is signed in ─────────────────────────────
  // The Trakt OAuth flow can only proceed if we have a CineLog session
  // to associate the tokens with. If the user isn't signed in, redirect
  // them to the home page where the auth modal will prompt them.
  const user = await requireSignedInUser(event.request);
  if (!user) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth=required",
        "Cache-Control": "no-store"
      }
    });
  }

  // ─── 2. Generate + store the CSRF state token ────────────────────
  const state = generateStateToken();
  const isHttps = isRequestHttps(event.request);
  const stateCookie = buildStateCookie(state, isHttps);

  // ─── 3. Redirect to Trakt's authorize page ───────────────────────
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      "Set-Cookie": stateCookie,
      "Cache-Control": "no-store"
    }
  });
}

// Reject POST / other methods.
export async function POST(): Promise<Response> {
  return new Response(
    JSON.stringify({ error: "Method not allowed. Use GET to start OAuth." }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "GET" }
    }
  );
}
