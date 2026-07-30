// src/routes/api/featured-content.ts
//
// CineLog V2 — Public Featured Content API (consumer-facing, read-only)
// ---------------------------------------------------------------------
// Returns active featured content for a given slot (or all slots).
//
//   GET /api/featured-content                    — all active slots
//   GET /api/featured-content?slot=hero          — single slot
//   GET /api/featured-content?slot=rail&limit=10 — limit number of results per slot
//
// Filtering rules:
//   • is_active = TRUE
//   • deleted_at IS NULL
//   • starts_at IS NULL OR starts_at <= now
//   • ends_at   IS NULL OR ends_at >= now
//   • Ordered by position ASC

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=60, s-maxage=120, stale-while-revalidate=600"
    }
  });
}

const VALID_SLOTS = new Set([
  "hero",
  "spotlight",
  "rail",
  "pinned",
  "editor_pick"
]);

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const slot = url.searchParams.get("slot");
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10))
    );

    if (slot && !VALID_SLOTS.has(slot)) {
      return jsonResponse({ error: "Invalid slot" }, 400);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const now = new Date().toISOString();

    let query = supabase
      .from("featured_content")
      .select(
        "id, slot, tmdb_id, media_type, title_override, tagline, position, starts_at, ends_at"
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("slot", { ascending: true })
      .order("position", { ascending: true })
      .limit(limit * 5); // pre-fetch enough for all slots if no slot filter

    if (slot) {
      query = query.eq("slot", slot).limit(limit);
    }

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    // Group by slot for the no-slot case
    if (!slot) {
      const grouped: Record<string, typeof data> = {
        hero: [],
        spotlight: [],
        rail: [],
        pinned: [],
        editor_pick: []
      };
      for (const row of data ?? []) {
        if (grouped[row.slot]) grouped[row.slot].push(row);
      }
      // Apply per-slot limit
      for (const k of Object.keys(grouped)) {
        grouped[k] = grouped[k].slice(0, limit);
      }
      return jsonResponse({ featured: grouped });
    }

    return jsonResponse({ featured: data ?? [] });
  } catch (err) {
    console.error("[featured-content] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
