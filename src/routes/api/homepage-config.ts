// src/routes/api/homepage-config.ts
//
// CineLog V2 — Public Homepage Sections Config (consumer-facing, read-only)
// ---------------------------------------------------------------------
// Returns the admin-controlled homepage_sections config from app_config.
//
//   GET /api/homepage-config
//
// Response:
//   {
//     "sections": {
//       "genre_explorer": { "enabled": true, "order": 1 },
//       "spotlight":      { "enabled": true, "order": 2 },
//       ...
//     }
//   }
//
// Cached at the edge for 60s (s-maxage), and on the client for 30s.
// The consumer app should refetch on a 5-min interval to pick up changes.

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

const DEFAULT_CONFIG = {
  sections: {
    genre_explorer: { enabled: true, order: 1 },
    spotlight: { enabled: true, order: 2 },
    continue_universes: { enabled: true, order: 3 },
    insight_strip: { enabled: true, order: 4 },
    trending: { enabled: true, order: 5 },
    theatres: { enabled: true, order: 6 },
    because_you_love: { enabled: true, order: 7 },
    surprise_me: { enabled: true, order: 8 },
    weekend_picks: { enabled: true, order: 9 },
    step_outside: { enabled: true, order: 10 },
    hidden_gems: { enabled: true, order: 11 },
    top_rated_movies: { enabled: true, order: 12 },
    top_rated_series: { enabled: true, order: 13 },
    new_on_ott: { enabled: true, order: 14 },
    new_seasons: { enabled: true, order: 15 },
    coming_soon: { enabled: true, order: 16 },
  },
};

export async function GET(_event: APIEvent) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "homepage_sections")
      .single();

    if (error || !data) {
      // Fall back to defaults if config row missing
      return jsonResponse({ config: DEFAULT_CONFIG });
    }

    const config = data.value as { sections?: Record<string, { enabled: boolean; order: number }> };

    // Merge with defaults so newly-added sections appear even if DB row is old
    const merged = {
      sections: { ...DEFAULT_CONFIG.sections, ...(config.sections ?? {}) },
    };

    return jsonResponse({ config: merged });
  } catch (err) {
    console.error("[homepage-config] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
