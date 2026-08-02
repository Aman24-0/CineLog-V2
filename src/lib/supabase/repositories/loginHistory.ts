// src/lib/supabase/repositories/loginHistory.ts
//
// Login history repository — inserts and reads rows from the
// `login_history` table (created by migration 20260801_add_login_history.sql).
//
// A row is inserted every time a user signs in (called from the
// onAuthStateChange handler in useAuth.ts). The Settings → Account →
// Login History section reads the most recent 50 rows.
//
// RLS: a user can only SELECT / INSERT their own rows. Updates and
// deletes are not allowed via the anon/authenticated client.

import { getClient, type TypedSupabaseClient } from "~/lib/supabase/repositories/shared";

export interface LoginHistoryRow {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  login_at: string;
}

export interface LoginHistoryResult {
  data: LoginHistoryRow[] | null;
  error: Error | null;
}

export interface LoginInsertResult {
  data: LoginHistoryRow | null;
  error: Error | null;
}

/**
 * Insert a login-history row for the given user. Called from
 * useAuth.ts after a successful sign-in. Never throws — if the
 * insert fails (e.g. RLS mis-configured, network error), the error
 * is logged and returned so the caller can decide whether to surface
 * it. In practice we always swallow it because login-history is a
 * best-effort audit trail, not a critical path.
 *
 * The IP address can't be reliably obtained from the browser (no
 * public API for it), so we leave it null when called from the
 * client. A server-side insert via an RPC could be added later for
 * more trustworthy IP capture.
 */
export async function logLogin(
  userId: string,
  ip: string | null = null,
  userAgent: string | null = null,
  client: TypedSupabaseClient = getClient()
): Promise<LoginInsertResult> {
  try {
    const { data, error } = await client
      .from("login_history")
      .insert({
        user_id: userId,
        ip_address: ip,
        user_agent: userAgent
      })
      .select()
      .single();

    if (error) {
      console.warn("[loginHistory] insert failed:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as LoginHistoryRow, error: null };
  } catch (e) {
    console.warn("[loginHistory] insert threw:", e);
    return { data: null, error: e as Error };
  }
}

/**
 * Fetch the most recent `limit` login-history rows for the given
 * user, newest first. Default limit is 50 (enough for the Settings
 * UI without loading thousands of rows).
 */
export async function getLoginHistory(
  userId: string,
  limit = 50,
  client: TypedSupabaseClient = getClient()
): Promise<LoginHistoryResult> {
  try {
    const { data, error } = await client
      .from("login_history")
      .select("id, user_id, ip_address, user_agent, login_at")
      .eq("user_id", userId)
      .order("login_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[loginHistory] fetch failed:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data ?? []) as LoginHistoryRow[], error: null };
  } catch (e) {
    console.warn("[loginHistory] fetch threw:", e);
    return { data: null, error: e as Error };
  }
}
