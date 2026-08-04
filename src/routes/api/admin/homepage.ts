// src/routes/api/admin/homepage.ts
//
// CineLog V2 — Admin Homepage Sections API
// ---------------------------------------------------------------------
// Manages the `homepage_sections` row in `app_config`.
//
// Endpoints:
//   GET /api/admin/homepage        — returns current config
//   PUT /api/admin/homepage        — replaces the entire config
//
// Shape stored in DB (app_config.key = 'homepage_sections'):
//   {
//     "sections": {
//       "genre_explorer": { "enabled": true, "order": 1 },
//       "spotlight":      { "enabled": true, "order": 2 },
//       ...
//     }
//   }
//
// All 16 Discover sections are pre-seeded. Missing keys in client requests
// are preserved (merge), so partial updates are safe.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface SectionConfig {
  enabled: boolean;
  order: number;
}

interface HomepageConfig {
  sections: Record<string, SectionConfig>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Default config used if the DB row is somehow missing
const DEFAULT_CONFIG: HomepageConfig = {
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
    coming_soon: { enabled: true, order: 16 }
  }
};

export const SECTION_KEYS = Object.keys(DEFAULT_CONFIG.sections);

export const SECTION_LABELS: Record<string, string> = {
  genre_explorer: "Genre Explorer",
  spotlight: "Spotlight",
  continue_universes: "Continue Your Universes",
  insight_strip: "Insight Strip",
  trending: "Trending This Week",
  theatres: "In Theatres Now",
  because_you_love: "Because You Love…",
  surprise_me: "Surprise Me",
  weekend_picks: "Weekend Picks",
  step_outside: "Step Outside Your Taste",
  hidden_gems: "Hidden Gems",
  top_rated_movies: "Top Rated Movies",
  top_rated_series: "Top Rated Series",
  new_on_ott: "New on OTT",
  new_seasons: "New Seasons",
  coming_soon: "Coming Soon"
};

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "homepage_sections")
      .single();

    if (error || !data) {
      // Row missing — return defaults (will be re-seeded on next PUT)
      return jsonResponse({ config: DEFAULT_CONFIG, defaults: true });
    }

    const config = data.value as HomepageConfig;
    // Merge with defaults so newly-added sections appear even if DB row is old
    const merged: HomepageConfig = {
      sections: { ...DEFAULT_CONFIG.sections, ...(config.sections ?? {}) }
    };

    return jsonResponse({ config: merged });
  } catch (err) {
    console.error("[admin/homepage] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PUT ───────────────────────────────────────────────────────────

export async function PUT(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "homepage.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      sections?: Record<string, SectionConfig>;
    };

    if (!body.sections || typeof body.sections !== "object") {
      return jsonResponse({ error: "sections object is required" }, 400);
    }

    // Validate keys — only known section keys allowed
    const validKeys = new Set(SECTION_KEYS);
    for (const key of Object.keys(body.sections)) {
      if (!validKeys.has(key)) {
        return jsonResponse({ error: `Unknown section key: ${key}` }, 400);
      }
      const sec = body.sections[key];
      if (typeof sec.enabled !== "boolean" || typeof sec.order !== "number") {
        return jsonResponse(
          {
            error: `Section "${key}" must have { enabled: boolean, order: number }`
          },
          400
        );
      }
    }

    const config: HomepageConfig = { sections: body.sections };

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "homepage_sections",
          value: config as unknown as never,
          updated_by: adminResult.admin.id
        },
        { onConflict: "key" }
      )
      .select("value")
      .single();

    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "homepage.update",
      entity_type: "app_config",
      entity_id: "homepage_sections",
      payload: { sections_count: Object.keys(config.sections).length }
    });

    return jsonResponse({ config: data.value as HomepageConfig });
  } catch (err) {
    console.error("[admin/homepage] PUT error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
