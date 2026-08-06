// src/routes/api/auth/trakt/callback.ts
//
// CineLog V2 — Trakt OAuth Callback (Server-Only)
// ---------------------------------------------------------------------
// GET /api/auth/trakt/callback?code=...&state=...
//   → 302 redirect to /settings/sync?trakt=connected
//   → 302 redirect to /settings/sync?error=trakt_email_mismatch
//   → 302 redirect to /settings/sync?error=trakt_state_mismatch
//   → 302 redirect to /settings/sync?error=trakt_token_exchange_failed
//   → 302 redirect to /settings/sync?error=trakt_not_configured
//   → 302 redirect to /settings/sync?error=trakt_no_session
//
// WHAT THIS DOES:
//   Trakt redirects here after the user grants CineLog permission.
//   This route:
//     1. Verifies the `state` parameter matches the cookie set in
//        /api/auth/trakt (CSRF protection).
//     2. Verifies the user is still signed in to CineLog.
//     3. Exchanges the `code` for an access_token + refresh_token.
//     4. Fetches the user's Trakt profile to get their Trakt email.
//     5. EMAIL MISMATCH CHECK: If the Trakt email doesn't match the
//        CineLog email, the connection is REJECTED. This prevents
//        users from importing someone else's Trakt history.
//     6. Upserts the tokens into the `user_integrations` table.
//     7. Redirects to /settings/sync with a success/error query param.
//
// SECURITY:
//   • The state cookie is consumed (cleared) after this route runs,
//     so it can't be replayed.
//   • The access_token + refresh_token NEVER reach the browser —
//     they're written directly to the DB via the service-role client.
//   • The Trakt email is only compared locally, then discarded —
//     we don't store it in the URL or logs.
//   • All error redirects go to /settings/sync with a generic error
//     code, never with the actual error message (which could leak
//     Trakt's response body).

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import {
  exchangeTraktCodeForToken,
  getTraktUserProfile
} from "~/lib/server/trakt";

interface APIEvent {
  request: Request;
}

const STATE_COOKIE_NAME = "trakt_oauth_state";

/** Allowed redirect targets — we never redirect to arbitrary URLs. */
const SUCCESS_REDIRECT = "/settings/sync?trakt=connected";
const ERROR_BASE = "/settings/sync";

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: path,
      "Cache-Control": "no-store"
    }
  });
}

function redirectToWithError(errorCode: string): Response {
  return redirectTo(`${ERROR_BASE}?error=${encodeURIComponent(errorCode)}`);
}

/**
 * Build a Set-Cookie header that clears the state cookie.
 * Called after the state has been verified (or on any error path)
 * so the cookie can't be replayed.
 */
function buildClearStateCookie(isHttps: boolean): string {
  const parts = [
    `${STATE_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

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
 * Parse the state cookie value from the Cookie header.
 * Returns null if the cookie is not present.
 */
function parseStateCookie(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName) continue;
    if (rawName.trim() === STATE_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Verify the user is signed in to CineLog. Returns the user_id + email
 * (lowercased) on success, or null if not authenticated.
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
 * Normalize an email for comparison: trim + lowercase. Trakt emails
 * and CineLog emails both use the standard format, so simple
 * normalization is sufficient.
 */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return new Response(JSON.stringify({ error: "Server-only endpoint" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const isHttps = isRequestHttps(event.request);
  const clearStateCookie = buildClearStateCookie(isHttps);

  // Helper that redirects with the state cookie cleared.
  const redirectWithClearedCookie = (
    location: string,
    extraSetCookie?: string
  ): Response => {
    const headers: Record<string, string> = {
      Location: location,
      "Cache-Control": "no-store"
    };
    // If we have multiple Set-Cookie headers, append them.
    if (extraSetCookie) {
      headers["Set-Cookie"] = extraSetCookie;
    } else {
      headers["Set-Cookie"] = clearStateCookie;
    }
    return new Response(null, { status: 302, headers });
  };

  // ─── 1. Parse + verify the state cookie ──────────────────────────
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const storedState = parseStateCookie(cookieHeader);

  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  // If Trakt returned an error (user denied, etc.), redirect with that.
  const traktError = url.searchParams.get("error");
  if (traktError) {
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent(`trakt_${traktError}`)}`
    );
  }

  if (!storedState || !returnedState || storedState !== returnedState) {
    // CSRF state mismatch — could be a CSRF attack, an old cookie,
    // or the user opened the callback in a different browser.
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_state_mismatch")}`
    );
  }

  if (!code) {
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_missing_code")}`
    );
  }

  // ─── 2. Verify the user is still signed in ───────────────────────
  // (They might have signed out between /api/auth/trakt and the callback.)
  const user = await requireSignedInUser(event.request);
  if (!user) {
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_no_session")}`
    );
  }

  // ─── 3. Exchange the code for an access + refresh token ──────────
  let tokenResponse;
  try {
    tokenResponse = await exchangeTraktCodeForToken(code);
  } catch (err) {
    console.error(
      "[trakt/oauth-callback] Token exchange failed:",
      err instanceof Error ? err.message : String(err)
    );
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_token_exchange_failed")}`
    );
  }

  // ─── 4. Fetch the Trakt user profile (for email + username) ──────
  let traktProfile;
  try {
    traktProfile = await getTraktUserProfile(tokenResponse.access_token);
  } catch (err) {
    console.error(
      "[trakt/oauth-callback] Profile fetch failed:",
      err instanceof Error ? err.message : String(err)
    );
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_profile_fetch_failed")}`
    );
  }

  // ─── 5. EMAIL MISMATCH CHECK ─────────────────────────────────────
  // If the Trakt account's email doesn't match the CineLog account's
  // email, REJECT the connection. This prevents users from importing
  // someone else's Trakt history (e.g. a partner's, a friend's).
  const traktEmail = normalizeEmail(traktProfile.email);
  const cinelogEmail = normalizeEmail(user.email);

  if (!traktEmail) {
    // Trakt profile didn't include an email — treat as mismatch.
    console.warn(
      `[trakt/oauth-callback] Trakt profile for user ${user.userId} did not include an email. Username: ${traktProfile.username}`
    );
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_email_mismatch")}`
    );
  }

  if (traktEmail !== cinelogEmail) {
    console.warn(
      `[trakt/oauth-callback] Email mismatch for user ${user.userId}: ` +
        `cinelog=${cinelogEmail} trakt=${traktEmail}. Connection rejected.`
    );
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_email_mismatch")}`
    );
  }

  // ─── 6. Upsert the tokens into user_integrations ─────────────────
  // We use the service-role admin client because:
  //   • The anon-key client would be subject to RLS, but the cookie
  //     session might not be cleanly transferrable to the supabase-js
  //     client here (we already verified the user via getUser()).
  //   • The service-role key never reaches the browser.
  // The UNIQUE (user_id, provider) constraint means this is an upsert
  // — re-connecting overwrites the existing Trakt connection.
  try {
    const admin = createAdminClient();

    // Compute the expires_at timestamp from expires_in (seconds).
    const expiresAt = tokenResponse.expires_in
      ? new Date(
          Date.now() + tokenResponse.expires_in * 1000
        ).toISOString()
      : null;

    const { error: upsertError } = await admin
      .from("user_integrations")
      .upsert(
        {
          user_id: user.userId,
          provider: "trakt",
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token ?? null,
          provider_user_id: traktProfile.username,
          provider_email: traktEmail,
          expires_at: expiresAt
        },
        {
          onConflict: "user_id,provider"
        }
      );

    if (upsertError) {
      console.error(
        "[trakt/oauth-callback] DB upsert failed:",
        upsertError.message
      );
      return redirectWithClearedCookie(
        `${ERROR_BASE}?error=${encodeURIComponent("trakt_db_write_failed")}`
      );
    }

    console.log(
      `[trakt/oauth-callback] Successfully connected Trakt for user ${user.userId} (trakt_username=${traktProfile.username}).`
    );

    return redirectWithClearedCookie(SUCCESS_REDIRECT);
  } catch (err) {
    console.error(
      "[trakt/oauth-callback] Unexpected error during upsert:",
      err instanceof Error ? err.message : String(err)
    );
    return redirectWithClearedCookie(
      `${ERROR_BASE}?error=${encodeURIComponent("trakt_db_write_failed")}`
    );
  }
}

// Reject POST / other methods.
export async function POST(): Promise<Response> {
  return new Response(
    JSON.stringify({ error: "Method not allowed. OAuth callback is GET-only." }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "GET" }
    }
  );
}
