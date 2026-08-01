// src/routes/api/admin/anime-settings.ts
//
// CineLog V2 — Admin Anime Settings API
// ---------------------------------------------------------------------
// GET  /api/admin/anime-settings — return the `anime_settings` JSONB
// PUT  /api/admin/anime-settings — update one or more fields
//
// Stored in app_config table (key='anime_settings'). Same pattern as
// the existing /api/admin/feature-flags and /api/admin/settings routes.
//
// SECURITY:
//   • Reads/writes use the service-role client.
//   • All PUTs are audit-logged.
//   • We validate the shape of every field before writing.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

interface AnimeSettings {
  enabled: boolean;
  seasonal_carousel: boolean;
  characters_staff: boolean;
  relations: boolean;
  airing_schedule: boolean;
  opening_ending_themes: boolean;
  auto_mapping: boolean;
  api_timeout_ms: number;
  cache_ttl_details_hours: number;
  cache_ttl_trending_hours: number;
  cache_ttl_seasonal_hours: number;
  cache_ttl_upcoming_hours: number;
  rate_limit_buffer_percent: number;
}

const DEFAULTS: AnimeSettings = {
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
    headers: { "Content-Type": "application/json" }
  });
}

function validateAnimeSettings(input: unknown): AnimeSettings {
  if (typeof input !== "object" || input === null) {
    throw new Error("must be an object");
  }
  const obj = input as Record<string, unknown>;
  const bool = (k: keyof AnimeSettings): boolean => {
    const v = obj[k as string];
    return typeof v === "boolean" ? v : DEFAULTS[k] as boolean;
  };
  const num = (k: keyof AnimeSettings, min: number, max: number): number => {
    const v = obj[k as string];
    if (typeof v !== "number" || Number.isNaN(v)) return DEFAULTS[k] as number;
    return Math.max(min, Math.min(max, Math.floor(v)));
  };
  return {
    enabled: bool("enabled"),
    seasonal_carousel: bool("seasonal_carousel"),
    characters_staff: bool("characters_staff"),
    relations: bool("relations"),
    airing_schedule: bool("airing_schedule"),
    opening_ending_themes: bool("opening_ending_themes"),
    auto_mapping: bool("auto_mapping"),
    api_timeout_ms: num("api_timeout_ms", 1000, 60000),
    cache_ttl_details_hours: num("cache_ttl_details_hours", 1, 168),
    cache_ttl_trending_hours: num("cache_ttl_trending_hours", 1, 72),
    cache_ttl_seasonal_hours: num("cache_ttl_seasonal_hours", 1, 72),
    cache_ttl_upcoming_hours: num("cache_ttl_upcoming_hours", 1, 168),
    rate_limit_buffer_percent: num("rate_limit_buffer_percent", 0, 90)
  };
}

// ─── GET /api/admin/anime-settings ──────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "anime_settings")
      .maybeSingle();

    if (error || !data?.value) {
      return jsonResponse({ settings: DEFAULTS });
    }
    return jsonResponse({ settings: { ...DEFAULTS, ...(data.value as Record<string, unknown>) } });
  } catch (err) {
    console.error("[CineLog Admin] Anime settings GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PUT /api/admin/anime-settings ──────────────────────────────────
//
// Body: { settings: { ...partial AnimeSettings } }
// Merges with the existing settings — only the provided fields are
// updated. Returns the full merged settings object.

export async function PUT(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { settings?: unknown };
  try {
    body = await event.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!body.settings || typeof body.settings !== "object") {
    return jsonResponse({ error: "Missing `settings` object in body" }, 400);
  }

  try {
    const supabase = createAdminClient();

    // Read existing settings to merge with.
    const { data: existing } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "anime_settings")
      .maybeSingle();
    const merged = { ...DEFAULTS, ...(existing?.value as Record<string, unknown> | null ?? {}), ...body.settings as Record<string, unknown> };

    let validated: AnimeSettings;
    try {
      validated = validateAnimeSettings(merged);
    } catch (err) {
      return jsonResponse(
        { error: `Validation failed: ${(err as Error).message}` },
        400
      );
    }

    const { error: upsertError } = await supabase
      .from("app_config")
      .upsert(
        { key: "anime_settings", value: validated as unknown as Record<string, unknown> },
        { onConflict: "key" }
      );
    if (upsertError) {
      console.error("[CineLog Admin] Anime settings PUT upsert error:", upsertError);
      return jsonResponse({ error: "Failed to save settings" }, 500);
    }

    // Audit log.
    await logAdminAction(event, adminResult.admin, {
      action: "admin_settings_update",
      entity_type: "app_config",
      entity_id: "anime_settings",
      payload: { updatedFields: Object.keys(body.settings as object) }
    }).catch(() => {
      // Audit log failure is non-fatal.
    });

    return jsonResponse({ settings: validated });
  } catch (err) {
    console.error("[CineLog Admin] Anime settings PUT error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
