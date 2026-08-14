// src/server/justwatch/region.ts
//
// CineLog V2 — JustWatch OTT Migration — Region Resolver
// ---------------------------------------------------------------------
// Resolves the signed-in user's profile country for OTT API routes.
// The country becomes the JustWatch `country` argument for every
// provider-catalog / offers / batch-availability call.
//
// Mirrors the `resolveProfileCountry` logic in
// `src/routes/api/audio-languages/[tmdbId].ts`, but extracted into a
// reusable server module so the three new OTT routes
// (`/api/ott/providers`, `/api/ott/availability/[tmdbId]`,
// `/api/ott/batch-availability`) share a single source of truth.
//
// Resolution flow:
//   1. Read the Supabase access token from the request — prefer the
//      `Authorization: Bearer <token>` header (the browser path), fall
//      back to the `sb-*-auth-token` cookie (SSR / server-to-server).
//   2. Verify the token via `auth.getUser(token)` — never trust the
//      header/cookie payload directly.
//   3. Look up the user's `profiles` row and read `country`.
//   4. Validate the country is 2 letters and uppercase it.
//
// Returns "US" when:
//   - the user is not signed in (anonymous access is allowed — the
//     OTT endpoints work without auth)
//   - env vars are missing
//   - the profile has no country set (legacy account)
//   - any error occurs (fail-open: better to serve US data than to
//     break the OTT panel)
//
// NEVER throws. Always returns a 2-letter ISO 3166-1 alpha-2 string.

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";

/** Default country when the user is signed-out or has no country set. */
const DEFAULT_COUNTRY = "US";

const COUNTRY_RE = /^[A-Za-z]{2}$/;

/**
 * Resolve the JustWatch country for an incoming API request.
 *
 * @param request — the incoming SolidStart API Request
 * @returns a 2-letter ISO 3166-1 alpha-2 country code (e.g. "IN", "US",
 *          "DE"). Never throws.
 */
export async function resolveJustWatchCountry(request: Request): Promise<string> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return DEFAULT_COUNTRY;

  const accessToken = getSupabaseAccessTokenFromRequest(request);
  if (!accessToken) return DEFAULT_COUNTRY;

  try {
    // 1. Verify the token — never trust the payload directly.
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: userData, error: userErr } =
      await verifyClient.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) return DEFAULT_COUNTRY;

    // 2. Read the profile row using a user-scoped client (RLS enforces
    //    owner-only read on profiles).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: profile, error: profileErr } = await userClient
      .from("profiles")
      .select("country")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileErr || !profile) return DEFAULT_COUNTRY;

    const country = (profile as { country?: string }).country;
    if (!country || typeof country !== "string" || !COUNTRY_RE.test(country)) {
      return DEFAULT_COUNTRY;
    }
    return country.toUpperCase();
  } catch (err) {
    console.warn(
      "[justwatch/region] resolveJustWatchCountry failed:",
      err instanceof Error ? err.message : String(err)
    );
    return DEFAULT_COUNTRY;
  }
}
