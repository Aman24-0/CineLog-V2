// src/routes/api/anime-settings.ts
//
// CineLog V2 — Public Anime Settings Endpoint
// ---------------------------------------------------------------------
// GET /api/anime-settings → returns the `anime_settings` JSONB blob
// from the app_config table. Public (no auth required) so anonymous
// users on the Discover page can also see anime carousels.
//
// Cached at the edge for 5 min (s-maxage=300), 30s on the client.
// Falls back to DEFAULT_ANIME_SETTINGS (see useAnimeSettings.ts) if
// the row is missing or the DB is unreachable.

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

const DEFAULT_SETTINGS = {
  enabled: true,
  seasonal_carousel: true,
  characters_staff: true,
  relations: true,
  airing_schedule: true,
  opening_ending_themes: true,
  auto_mapping: true,
  api_timeout_ms: 10000,
  cache_ttl_details_hours: 24,
  cache_ttl_trending_hours: 6,
  cache_ttl_seasonal_hours: 6,
  cache_ttl_upcoming_hours: 12,
  rate_limit_buffer_percent: 10
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=600"
    }
  });
}

export async function GET(_event: APIEvent): Promise<Response> {
  // Use the anon client — public read of app_config is allowed by RLS.
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return jsonResponse({ settings: DEFAULT_SETTINGS });
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "anime_settings")
      .maybeSingle();

    if (error || !data?.value) {
      return jsonResponse({ settings: DEFAULT_SETTINGS });
    }
    // Merge with defaults so missing keys always fall back.
    const merged = { ...DEFAULT_SETTINGS, ...(data.value as Record<string, unknown>) };
    return jsonResponse({ settings: merged });
  } catch (err) {
    console.error("[anime-settings] GET error:", err);
    return jsonResponse({ settings: DEFAULT_SETTINGS });
  }
}
