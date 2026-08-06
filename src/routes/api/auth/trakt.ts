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
// SECURITY:
//   • No body parsing — this is a GET redirect.
//   • The TRAKT_CLIENT_ID env var is exposed in the URL (it's a
//     public OAuth client_id, designed to be visible in the browser).
//   • The TRAKT_CLIENT_SECRET is NEVER exposed — it's only used in
//     the callback route to exchange the code for a token.
//   • The state cookie is httpOnly + Secure (on HTTPS) + SameSite=Lax
//     so it survives the cross-site redirect to Trakt but can't be
//     read by client-side JS.

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
 */
async function requireSignedInUser(
  request: Request
): Promise<{ userId: string; email: string } | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = getSupabaseAccessToken(cookieHeader);
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
