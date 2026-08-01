// src/routes/api/admin/analytics.ts
//
// CineLog V2 — Admin Analytics API
// ---------------------------------------------------------------------
// GET /api/admin/analytics — return aggregated analytics for the admin
// dashboard's Analytics page.
//
// Data sources:
//   • mv_admin_user_growth        — daily signups + cumulative
//   • mv_admin_active_users       — DAU/WAU/MAU per day
//   • mv_admin_content_engagement — vault/collection actions per day
//   • mv_admin_top_titles         — top 100 most-vaulted titles (30d)
//   • app_config[analytics_last_refresh] — last refresh timestamp
//   • admin_actions               — recent admin activity (for sidebar)
//
// All queries use the service_role client to bypass RLS. The
// materialized views are refreshed hourly by pg_cron; the admin can
// also trigger a manual refresh via POST /api/admin/analytics/refresh.
//
// The response is a single JSON object so the page can render with
// one round-trip.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

interface AnalyticsResponse {
  // User growth (last 90 days)
  user_growth: {
    day: string; // ISO date (yyyy-mm-dd)
    new_users: number;
    cumulative_users: number;
  }[];
  // Active users (last 90 days)
  active_users: {
    day: string;
    dau: number;
    wau: number;
    mau: number;
  }[];
  // Content engagement (last 90 days, top 200 rows)
  content_engagement: {
    day: string;
    action: string;
    count: number;
    unique_users: number;
  }[];
  // Top titles (last 30 days, top 100)
  top_titles: {
    tmdb_id: number;
    media_type: string;
    vault_count: number;
    completed_count: number;
    planned_count: number;
    watching_count: number;
    unique_users: number;
    avg_rating: number | null;
  }[];
  // Summary cards
  summary: {
    total_users: number;
    total_vault_items: number;
    total_collections: number;
    dau_today: number;
    /**
     * ISO date (yyyy-mm-dd) of the row in mv_admin_active_users that
     * `dau_today` was taken from. Equal to "today" (UTC) when the MV
     * has been refreshed today; otherwise equal to the most recent
     * available day — and `dau_today_is_fallback` will be true.
     */
    dau_today_date: string | null;
    /**
     * True when `dau_today_date` is NOT today's UTC date — i.e. the
     * MV hasn't been refreshed yet today. The UI uses this to render
     * an "as of <date>" hint instead of implying the number is from
     * today.
     */
    dau_today_is_fallback: boolean;
    wau_this_week: number;
    mau_this_month: number;
    new_users_30d: number;
    new_users_7d: number;
    new_users_24h: number;
  };
  // Refresh metadata
  last_refresh: string | null;
  next_refresh_eta_minutes: number; // estimated minutes until next cron tick
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

    // ─── Pull from materialized views (parallel) ───────────────
    const [
      userGrowthResp,
      activeUsersResp,
      engagementResp,
      topTitlesResp,
      lastRefreshResp,
      summaryUsersResp,
      summaryVaultResp,
      summaryCollectionsResp,
      recentSignupsResp
    ] = await Promise.all([
      supabase
        .from("mv_admin_user_growth")
        .select("*")
        .order("day", { ascending: true }),
      supabase
        .from("mv_admin_active_users")
        .select("*")
        .order("day", { ascending: true }),
      supabase
        .from("mv_admin_content_engagement")
        .select("*")
        .order("day", { ascending: false })
        .limit(200),
      supabase
        .from("mv_admin_top_titles")
        .select("*")
        .order("vault_count", { ascending: false }),
      supabase
        .from("app_config")
        .select("value")
        .eq("key", "analytics_last_refresh")
        .single(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("vault")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("collections")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      // Recent signups — not from MV (we want real-time)
      supabase
        .from("profiles")
        .select("created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500)
    ]);

    // Errors from MVs are non-fatal — the page just renders with empty arrays
    if (userGrowthResp.error) {
      console.error(
        "[admin/analytics] mv_admin_user_growth error:",
        userGrowthResp.error
      );
    }

    // ─── Compute summary metrics ───────────────────────────────
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentSignups = (recentSignupsResp.data ?? []) as {
      created_at: string;
    }[];
    const newUsers24h = recentSignups.filter(
      (r) => new Date(r.created_at) >= cutoff24h
    ).length;
    const newUsers7d = recentSignups.filter(
      (r) => new Date(r.created_at) >= cutoff7d
    ).length;
    const newUsers30d = recentSignups.filter(
      (r) => new Date(r.created_at) >= cutoff30d
    ).length;

    // DAU/WAU/MAU from mv_admin_active_users.
    //
    // v2 (Phase 4 Task 22) fix: previously we took the LAST row of the
    // MV and labeled its `dau` as "today". If the MV hadn't been
    // refreshed yet today (pg_cron runs at minute 5 of each hour, but
    // the admin may open the page before that), the "today" number
    // was actually yesterday's DAU — silently wrong.
    //
    // Now: we look for a row whose `day` equals today's UTC date. If
    // found, that's `dau_today` and `dau_today_is_fallback` is false.
    // If NOT found, we fall back to the most recent available day,
    // set `dau_today_is_fallback` = true, and surface `dau_today_date`
    // so the UI can render "as of <date>" instead of misleadingly
    // labeling yesterday's (or older) DAU as "today".
    //
    // WAU and MAU are 7-day / 30-day rolling windows, so the date
    // attached to the row matters less — we still use the latest row
    // (or today's row when present) so the numbers are as fresh as
    // possible.
    const activeUsersRows = (activeUsersResp.data ?? []) as {
      day: string;
      dau: number;
      wau: number;
      mau: number;
    }[];

    // Use UTC date for the "today" comparison — mv_admin_active_users
    // stores `day` as a DATE column populated from
    // `date_trunc('day', created_at)` which is server-local. The
    // server runs in UTC on Supabase, so this matches.
    const todayUtc = now.toISOString().slice(0, 10);

    const todaysRow = activeUsersRows.find((r) => r.day === todayUtc);
    let dauToday = 0;
    let dauTodayDate: string | null = null;
    let dauTodayIsFallback = false;
    let wauThisWeek = 0;
    let mauThisMonth = 0;

    if (todaysRow) {
      // MV has been refreshed today — use today's numbers directly.
      dauToday = todaysRow.dau ?? 0;
      dauTodayDate = todaysRow.day;
      dauTodayIsFallback = false;
      wauThisWeek = todaysRow.wau ?? 0;
      mauThisMonth = todaysRow.mau ?? 0;
    } else if (activeUsersRows.length > 0) {
      // MV hasn't been refreshed today — fall back to the most recent
      // available day and flag it so the UI can show "as of <date>".
      // The rows are ordered ascending by `day` (see query above), so
      // the last element is the most recent.
      const latest = activeUsersRows[activeUsersRows.length - 1];
      dauToday = latest.dau ?? 0;
      dauTodayDate = latest.day;
      dauTodayIsFallback = true;
      wauThisWeek = latest.wau ?? 0;
      mauThisMonth = latest.mau ?? 0;
    }

    // ─── Refresh metadata ──────────────────────────────────────
    const lastRefreshRaw =
      (lastRefreshResp.data?.value as { at?: string | null } | null) ?? null;
    const lastRefresh = lastRefreshRaw?.at ?? null;

    // pg_cron runs at minute 5 of every hour. Estimate minutes remaining.
    const minutesUntilNextRefresh = (() => {
      const min = now.getMinutes();
      if (min < 5) return 5 - min;
      return 60 - (min - 5);
    })();

    const response: AnalyticsResponse = {
      user_growth: (userGrowthResp.data ??
        []) as AnalyticsResponse["user_growth"],
      active_users: activeUsersRows,
      content_engagement: (engagementResp.data ??
        []) as AnalyticsResponse["content_engagement"],
      top_titles: (topTitlesResp.data ?? []) as AnalyticsResponse["top_titles"],
      summary: {
        total_users: summaryUsersResp.count ?? 0,
        total_vault_items: summaryVaultResp.count ?? 0,
        total_collections: summaryCollectionsResp.count ?? 0,
        dau_today: dauToday,
        dau_today_date: dauTodayDate,
        dau_today_is_fallback: dauTodayIsFallback,
        wau_this_week: wauThisWeek,
        mau_this_month: mauThisMonth,
        new_users_30d: newUsers30d,
        new_users_7d: newUsers7d,
        new_users_24h: newUsers24h
      },
      last_refresh: lastRefresh,
      next_refresh_eta_minutes: minutesUntilNextRefresh,
      fetched_at: now.toISOString()
    };

    return jsonResponse(response, 200);
  } catch (err) {
    console.error("[admin/analytics] error:", err);
    return jsonResponse({ error: "Failed to fetch analytics" }, 500);
  }
}
