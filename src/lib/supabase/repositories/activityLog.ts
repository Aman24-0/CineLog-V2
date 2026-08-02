// src/lib/supabase/repositories/activityLog.ts
//
// CineLog V2 — Activity Log Writer
// ---------------------------------------------------------------------
// Writes rows to the `activity_log` table. Used by the social feed
// (/api/feed) to surface "alice watched X" / "bob rated Y" activity.
//
// The activity_log table is also read by the admin dashboard (stats +
// analytics materialized views), but those reads happen via the
// service-role client on the server. This writer module is the ONLY
// place in the codebase that INSERTs into activity_log — every vault
// mutation that should be surfaced in the feed goes through here.
//
// SECURITY / RLS
// --------------
//   activity_log has owner-only RLS (auth.uid() = user_id). The
//   browser-side Supabase client (which carries the user's session)
//   can therefore only insert rows where user_id = the caller's uid.
//   We pass the user's id explicitly AND rely on RLS to enforce it.
//
// FIRE-AND-FORGET
// ---------------
//   Activity logging is best-effort — if it fails (network error,
//   RLS rejection, table missing), we DON'T want to break the user's
//   primary action (adding a title to their vault). So every call is
//   fire-and-forget: we kick off the insert and immediately return.
//   Errors are logged to the console but never surface to the UI.
//
//   This matches the pattern used by `auditLog.ts` for admin actions.
//
// IMPORTANT: entity_id is UUID-typed
// ----------------------------------
//   The `activity_log.entity_id` column is `uuid` (NOT text). It's
//   designed to hold a row UUID (e.g. a vault row id or collection id).
//   TMDB ids are NUMBERS (e.g. 550), which are NOT valid UUIDs —
//   inserting "550" into a uuid column fails with a type error.
//
//   So for vault activities (which reference a TMDB title, not a
//   vault row), we store the TMDB id in `metadata.tmdb_id` (JSONB)
//   and leave `entity_id` NULL. The feed API reads it back from
//   metadata. This keeps the schema clean (entity_id stays UUID-
//   typed for future entity-keyed activities) while still letting
//   the feed enrich with TMDB metadata.

import { getClient } from "~/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types — mirror the activity_action_type enum from database.types.ts
// ---------------------------------------------------------------------------

export type ActivityAction =
  | "vault_created"
  | "vault_updated"
  | "vault_restored"
  | "vault_status_changed"
  | "vault_rated"
  | "vault_favorited"
  | "vault_unfavorited"
  | "collection_created"
  | "collection_updated"
  | "episode_progress_updated";

export interface ActivityLogPayload {
  /** The user performing the action (must match the caller's auth.uid()). */
  userId: string;
  /** What kind of action (e.g. "vault_created", "vault_rated"). */
  action: ActivityAction;
  /**
   * The TMDB id of the movie/TV title the action is about.
   * Stored in `metadata.tmdb_id` (NOT entity_id — see file header).
   * Pass null for collection-only actions.
   */
  tmdbId?: number | string | null;
  /**
   * "movie" | "tv" | "collection" — stored in `entity_type`.
   * Drives how the feed renders the item.
   */
  entityType?: "movie" | "tv" | "collection" | null;
  /** Optional structured metadata (e.g. { rating: 8 } for vault_rated). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Insert a row into `activity_log`. Fire-and-forget — never throws.
 *
 * Call this AFTER the primary mutation succeeds so the activity log
 * only records actions that actually happened.
 *
 * @example
 *   await createVaultItemInSupabase(uid, item);
 *   logActivity({
 *     userId: uid,
 *     action: "vault_created",
 *     tmdbId: item.id,
 *     entityType: item.media_type,
 *     metadata: { title: item.title, status: item.status }
 *   });
 */
export function logActivity(payload: ActivityLogPayload): void {
  // Fire-and-forget — we deliberately don't await this. The caller's
  // primary action has already succeeded; logging is a side-effect.
  void logActivityAsync(payload).catch((err) => {
    console.warn(
      `[activityLog] Failed to log ${payload.action} for user ${payload.userId}:`,
      err instanceof Error ? err.message : err
    );
  });
}

/**
 * Async version of logActivity — awaits the insert. Use this when you
 * need to know the logging succeeded (rare — most callers should use
 * the fire-and-forget `logActivity`).
 *
 * @throws on Supabase error (caller should catch).
 */
export async function logActivityAsync(
  payload: ActivityLogPayload
): Promise<void> {
  // Build the metadata payload — merge the caller's metadata with
  // the tmdb_id so the feed API can read it back.
  const metadata: Record<string, unknown> = {
    ...payload.metadata
  };
  if (payload.tmdbId !== null && payload.tmdbId !== undefined) {
    // Store as a NUMBER so the feed API can parseInt safely (it
    // handles both number and string forms).
    const tmdbIdNum =
      typeof payload.tmdbId === "string"
        ? parseInt(payload.tmdbId, 10)
        : payload.tmdbId;
    if (Number.isFinite(tmdbIdNum) && tmdbIdNum > 0) {
      metadata.tmdb_id = tmdbIdNum;
    }
  }

  const supabase = getClient();
  const { error } = await supabase.from("activity_log").insert({
    user_id: payload.userId,
    action: payload.action,
    // entity_id is UUID-typed — leave NULL for vault activities.
    // The TMDB id lives in metadata.tmdb_id.
    entity_id: null,
    entity_type: payload.entityType ?? null,
    metadata,
    // ip_address + user_agent are left null — the table accepts null
    // for both. Server-side capture would require forwarding headers
    // through every vault mutation, which is too invasive for the
    // value. The admin analytics views don't depend on these columns.
    ip_address: null,
    user_agent: null
  });

  if (error) {
    // RLS rejection (42501) happens if the caller's session doesn't
    // match payload.userId — that's a bug in the caller, not a
    // transient error. Log it loudly so it's noticed.
    if ((error as { code?: string }).code === "42501") {
      console.error(
        `[activityLog] RLS rejected ${payload.action} insert — user_id mismatch?`,
        { userId: payload.userId, action: payload.action }
      );
    }
    throw error;
  }
}
