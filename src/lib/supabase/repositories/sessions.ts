// src/lib/supabase/repositories/sessions.ts
//
// Sessions repository — manages user authentication sessions via
// Supabase's built-in auth API.
//
// Supabase does NOT expose a "list all my sessions" endpoint to the
// client (the auth.sessions table is server-side only and protected
// by the service role). What we CAN do client-side:
//
//   1. List MFA factors (a proxy for "devices that have 2FA set up")
//   2. Sign out the CURRENT session (local scope)
//   3. Sign out EVERYWHERE (global scope — invalidates all sessions
//      across all devices, including the current one)
//
// For a true session list with IP / device / last-active info, we'd
// need a server-side admin API route using the service-role key. That
// is out of scope for this iteration — the global sign-out is the
// nuclear option users actually need when they suspect a compromise.
//
// What this module exposes:
//   - getSessionsOverview() → { mfaFactors, currentAal, thisDevice }
//   - revokeAllSessions()   → supabase.auth.signOut({ scope: "global" })
//   - revokeCurrentSession()→ supabase.auth.signOut({ scope: "local" })

import { getClient } from "~/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase/database.types";

/** A summarised view of a single MFA factor (for the UI list). */
export interface MfaFactorInfo {
  id: string;
  friendlyName: string | null;
  factorType: "totp" | "phone" | "webauthn";
  status: "verified" | "unverified";
  createdAt: string;
  updatedAt: string;
}

/** Overview returned by getSessionsOverview(). */
export interface SessionsOverview {
  /** All MFA factors the user has enrolled (verified + unverified). */
  mfaFactors: MfaFactorInfo[];
  /** Verified TOTP factors only — these are the "active" 2FA devices. */
  activeFactors: MfaFactorInfo[];
  /** Current session's Authenticator Assurance Level. */
  currentAal: "aal1" | "aal2" | null;
  /** A best-effort description of the current device. */
  thisDevice: {
    userAgent: string;
    platform: string;
    browser: string;
    isMobile: boolean;
  };
}

export interface SessionsResult {
  data: SessionsOverview | null;
  error: Error | null;
}

/** Parse navigator.userAgent into { platform, browser, isMobile }. */
function parseUserAgent(ua: string): {
  platform: string;
  browser: string;
  isMobile: boolean;
} {
  let platform = "Unknown";
  let browser = "Unknown";
  let isMobile = false;

  if (/Windows NT/i.test(ua)) platform = "Windows";
  else if (/Mac OS X/i.test(ua)) platform = "macOS";
  else if (/Android/i.test(ua)) {
    platform = "Android";
    isMobile = true;
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = "iOS";
    isMobile = true;
  } else if (/Linux/i.test(ua)) platform = "Linux";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  if (!isMobile && /Mobi|Tablet/i.test(ua)) isMobile = true;

  return { platform, browser, isMobile };
}

/**
 * Get an overview of the user's sessions: MFA factors, current AAL,
 * and the current device info. Used by the Settings → Account →
 * Sessions section.
 */
export async function getSessionsOverview(
  client: SupabaseClient<Database> = getClient()
): Promise<SessionsResult> {
  try {
    const [factorsRes, aalRes] = await Promise.all([
      client.auth.mfa.listFactors(),
      client.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);

    if (factorsRes.error) {
      return {
        data: null,
        error: new Error(factorsRes.error.message)
      };
    }

    const all = factorsRes.data?.all ?? [];
    const mfaFactors: MfaFactorInfo[] = all.map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at
    }));

    const activeFactors = mfaFactors.filter((f) => f.status === "verified");

    const currentAalRaw: string | null = aalRes.data?.currentLevel ?? null;
    // Supabase types `currentLevel` as a string; narrow to the
    // known AAL values. Anything else (shouldn't happen) becomes null.
    const currentAal: SessionsOverview["currentAal"] =
      currentAalRaw === "aal1" || currentAalRaw === "aal2"
        ? currentAalRaw
        : null;

    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
    const thisDevice = {
      userAgent: ua,
      ...parseUserAgent(ua)
    };

    return {
      data: { mfaFactors, activeFactors, currentAal, thisDevice },
      error: null
    };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

/** Result of a sign-out operation. */
export interface SignOutResult {
  error: Error | null;
}

/**
 * Revoke ALL sessions for the user across every device. This is the
 * "Sign out everywhere" action — it invalidates the current session
 * too, so the user is immediately logged out and will need to sign
 * in again on every device.
 *
 * Under the hood this calls supabase.auth.signOut with scope "global",
 * which calls the Supabase Admin API to revoke all refresh tokens
 * for the user.
 */
export async function revokeAllSessions(
  client: SupabaseClient<Database> = getClient()
): Promise<SignOutResult> {
  try {
    const { error } = await client.auth.signOut({ scope: "global" });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Revoke ONLY the current session (sign out on this device). Other
 * devices stay signed in.
 */
export async function revokeCurrentSession(
  client: SupabaseClient<Database> = getClient()
): Promise<SignOutResult> {
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Remove a single MFA factor (un-enrol a 2FA device). Used by the
 * Sessions UI when the user taps "Remove" next to a factor.
 */
export async function revokeMfaFactor(
  factorId: string,
  client: SupabaseClient<Database> = getClient()
): Promise<SignOutResult> {
  try {
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
