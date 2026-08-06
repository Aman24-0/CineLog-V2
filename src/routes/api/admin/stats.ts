// src/routes/api/admin/stats.ts
//
// CineLog V2 — Admin Stats API
// ---------------------------------------------------------------------
// GET /api/admin/stats — returns all dashboard metrics in one response.
//
// Metrics returned:
//   - total_users: count of non-deleted profiles
//   - active_users: { h24, d7, d30 } — distinct users with activity in window
//   - total_watchlist_entries: count of non-deleted vault rows
//   - movies_vs_tv: { movies, tv_shows } — count by media_type
//   - tmdb_cache: { entries, expired, size_mb (approximate) }
//   - api_request_count: count from activity_log (or "tracking_not_enabled")
//   - server_status: "online" (we're running, after all)
//   - database_size_mb: via Supabase Management API (best-effort)
//
// All queries use the service_role client to bypass RLS.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

type APIEvent = AdminAPIEvent;

interface AdminStats {
  total_users: number;
  active_users: {
    h24: number;
    d7: number;
    d30: number;
  };
  total_watchlist_entries: number;
  movies_vs_tv: {
    movies: number;
    tv_shows: number;
  };
  tmdb_cache: {
    entries: number;
    expired: number;
    size_mb: number | null;
  };
  api_request_count: number;
  /**
   * Phase 9 Chunk 1 — count of activity_log rows created since the
   * start of the current UTC day. Used by the redesigned
   * AdminDashboard's "API Requests Today" GlassStatCard so the metric
   * reflects today's traffic rather than the all-time total exposed by
   * `api_request_count` (which is retained for backwards compat).
   */
  api_requests_today: number;
  server_status: "online";
  database_size_mb: number | null;
  fetched_at: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(event: APIEvent) {
  // 1. Auth check
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const isoNow = now.toISOString();
    const iso24hAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();
    const iso7dAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const iso30dAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Phase 9 Chunk 1 — start of the current UTC day (00:00:00Z).
    // Used for the "API Requests Today" metric. We use UTC (not the
    // server's local tz) so the cutoff is stable across deployments
    // and matches the ISO timestamps stored in activity_log.created_at.
    const startOfTodayUtc = new Date(now);
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const isoStartOfToday = startOfTodayUtc.toISOString();

    // ─── Run queries in parallel for speed ────────────────────────────
    const [
      totalUsersResp,
      active24hResp,
      active7dResp,
      active30dResp,
      totalVaultResp,
      vaultMediaTypeResp,
      tmdbCacheCountResp,
      tmdbCacheExpiredResp,
      activityLogCountResp,
      activityLogTodayResp
    ] = await Promise.all([
      // 1. Total users (non-deleted profiles)
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),

      // 2a. Active users 24h
      supabase
        .from("activity_log")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", iso24hAgo),

      // 2b. Active users 7d
      supabase
        .from("activity_log")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", iso7dAgo),

      // 2c. Active users 30d
      supabase
        .from("activity_log")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", iso30dAgo),

      // 3. Total watchlist entries
      supabase
        .from("vault")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),

      // 4. Movies vs TV (group by media_type)
      supabase.from("vault").select("media_type").is("deleted_at", null),

      // 5a. TMDB cache entry count
      supabase.from("tmdb_cache").select("id", { count: "exact", head: true }),

      // 5b. TMDB cache expired entries
      supabase
        .from("tmdb_cache")
        .select("id", { count: "exact", head: true })
        .lt("expires_at", isoNow),

      // 6. Activity log total (proxy for API request count)
      supabase.from("activity_log").select("id", { count: "exact", head: true }),

      // 7. Phase 9 Chunk 1 — activity_log rows created since the
      // start of today (UTC). Backs the "API Requests Today"
      // GlassStatCard on the redesigned AdminDashboard.
      supabase
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", isoStartOfToday)
    ]);

    // Aggregate movies vs TV
    const mediaRows = vaultMediaTypeResp.data ?? [];
    let movies = 0;
    let tvShows = 0;
    for (const row of mediaRows as Array<{ media_type: string }>) {
      if (row.media_type === "movie") movies++;
      else if (row.media_type === "tv" || row.media_type === "series")
        tvShows++;
    }

    // Best-effort: database size via Supabase Management API
    let databaseSizeMb: number | null = null;
    try {
      const pat = process.env.SUPABASE_ACCESS_TOKEN;
      const projectRef = (process.env.VITE_SUPABASE_URL || "").match(
        /https:\/\/([a-z0-9]+)\.supabase\.co/
      )?.[1];
      if (pat && projectRef) {
        const resp = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/database/size`,
          {
            headers: {
              Authorization: `Bearer ${pat}`,
              "User-Agent": "cinelog-admin/1.0"
            },
            signal: AbortSignal.timeout(5000)
          }
        );
        if (resp.ok) {
          const data = (await resp.json()) as { size?: number };
          if (typeof data.size === "number") {
            databaseSizeMb =
              Math.round((data.size / (1024 * 1024)) * 100) / 100;
          }
        }
      }
    } catch {
      // database size is best-effort — swallow errors
    }

    // Estimate TMDB cache size (each row's `data` JSONB + overhead)
    // We don't have a precise way to get this without running SQL,
    // so we approximate: 5KB per entry on average (TMDB responses are
    // typically 2-8KB). This is a rough estimate.
    const tmdbCacheEntries = tmdbCacheCountResp.count ?? 0;
    const tmdbCacheSizeMb =
      Math.round(((tmdbCacheEntries * 5) / 1024) * 100) / 100;

    const stats: AdminStats = {
      total_users: totalUsersResp.count ?? 0,
      active_users: {
        h24: active24hResp.count ?? 0,
        d7: active7dResp.count ?? 0,
        d30: active30dResp.count ?? 0
      },
      total_watchlist_entries: totalVaultResp.count ?? 0,
      movies_vs_tv: {
        movies,
        tv_shows: tvShows
      },
      tmdb_cache: {
        entries: tmdbCacheEntries,
        expired: tmdbCacheExpiredResp.count ?? 0,
        size_mb: tmdbCacheSizeMb
      },
      api_request_count: activityLogCountResp.count ?? 0,
      api_requests_today: activityLogTodayResp.count ?? 0,
      server_status: "online",
      database_size_mb: databaseSizeMb,
      fetched_at: isoNow
    };

    return jsonResponse(stats);
  } catch (err) {
    console.error("[CineLog Admin] Stats error:", err);
    return jsonResponse({ error: "Failed to fetch stats" }, 500);
  }
}
