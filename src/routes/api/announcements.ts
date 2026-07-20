// src/routes/api/announcements.ts
//
// CineLog V2 — Public Announcements API (consumer-facing, read-only)
// ---------------------------------------------------------------------
// Returns active announcements that should be shown right now.
//
//   GET /api/announcements?audience=all|guests|authenticated
//
// Filtering rules:
//   • is_active = TRUE
//   • deleted_at IS NULL
//   • starts_at IS NULL OR starts_at <= now
//   • ends_at   IS NULL OR ends_at >= now
//   • target_audience matches the request (or 'all')

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const audience = url.searchParams.get("audience") || "all";
    if (!["all", "guests", "authenticated"].includes(audience)) {
      return jsonResponse({ error: "Invalid audience" }, 400);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();

    let query = supabase
      .from("announcements")
      .select("id, type, severity, title, body, cta_label, cta_href, is_dismissible, starts_at, ends_at, target_audience")
      .eq("is_active", true)
      .is("deleted_at", null)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false });

    if (audience !== "all") {
      // Show both 'all' announcements and ones targeted at the requested audience
      query = query.in("target_audience", ["all", audience]);
    }

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ announcements: data ?? [] });
  } catch (err) {
    console.error("[announcements] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
