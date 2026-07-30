// src/routes/api/admin/settings.ts
//
// CineLog V2 — Admin Settings API
// ---------------------------------------------------------------------
// GET  /api/admin/settings — return all site-wide settings (from app_config)
// PUT  /api/admin/settings — update one or more settings keys
//
// Settings keys (defined in the Phase 3 migration):
//   site_settings      — site name, tagline, contact email, social links
//   rate_limits        — API rate limit thresholds
//   tmdb_settings      — cache TTL, fallback language, include_adult
//   maintenance_window — scheduled maintenance banner config
//   retention_policy   — how long to keep soft-deleted rows, logs, etc.
//
// The feature_flags key (Phase 1) is NOT managed here — it has its
// own endpoint at /api/admin/feature-flags.
//
// SECURITY:
//   • Reads/writes use the service_role client.
//   • All PUTs are audit-logged.
//   • We validate the shape of each settings object before writing
//     to prevent malformed config from breaking the app.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

// ─── Settings schema (for validation) ────────────────────────────

type SettingsKey =
  | "site_settings"
  | "rate_limits"
  | "tmdb_settings"
  | "maintenance_window"
  | "retention_policy";

const ALL_KEYS: SettingsKey[] = [
  "site_settings",
  "rate_limits",
  "tmdb_settings",
  "maintenance_window",
  "retention_policy"
];

interface SiteSettings {
  site_name: string;
  tagline: string;
  contact_email: string;
  support_url: string;
  privacy_url: string;
  terms_url: string;
  social_links: {
    twitter: string;
    instagram: string;
    github: string;
  };
}

interface RateLimits {
  api_per_min: number;
  auth_attempts_per_hr: number;
  upload_mb_per_day: number;
}

interface TmdbSettings {
  cache_ttl_days: number;
  fallback_language: string;
  include_adult: boolean;
}

interface MaintenanceWindow {
  enabled: boolean;
  scheduled_at: string | null;
  message: string;
}

interface RetentionPolicy {
  soft_deleted_profiles_days: number;
  activity_log_days: number;
  tmdb_cache_days: number;
  admin_actions_days: number;
}

interface AllSettings {
  site_settings: SiteSettings;
  rate_limits: RateLimits;
  tmdb_settings: TmdbSettings;
  maintenance_window: MaintenanceWindow;
  retention_policy: RetentionPolicy;
}

// ─── Default values (used if a key is missing from app_config) ────

const DEFAULTS: AllSettings = {
  site_settings: {
    site_name: "CineLog",
    tagline: "Your personal cinema universe",
    contact_email: "support@cinelog.app",
    support_url: "",
    privacy_url: "",
    terms_url: "",
    social_links: { twitter: "", instagram: "", github: "" }
  },
  rate_limits: {
    api_per_min: 60,
    auth_attempts_per_hr: 20,
    upload_mb_per_day: 50
  },
  tmdb_settings: {
    cache_ttl_days: 30,
    fallback_language: "en",
    include_adult: false
  },
  maintenance_window: { enabled: false, scheduled_at: null, message: "" },
  retention_policy: {
    soft_deleted_profiles_days: 90,
    activity_log_days: 180,
    tmdb_cache_days: 30,
    admin_actions_days: 365
  }
};

// ─── Validators ──────────────────────────────────────────────────
//
// Each validator returns a cleaned object (with defaults filled in
// for missing fields) or throws if a field is grossly malformed.

function validateSiteSettings(input: unknown): SiteSettings {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  const defaults = DEFAULTS.site_settings;
  const social = (
    obj.social_links && typeof obj.social_links === "object"
      ? obj.social_links
      : {}
  ) as Record<string, unknown>;
  return {
    site_name:
      typeof obj.site_name === "string"
        ? obj.site_name.slice(0, 60)
        : defaults.site_name,
    tagline:
      typeof obj.tagline === "string"
        ? obj.tagline.slice(0, 120)
        : defaults.tagline,
    contact_email:
      typeof obj.contact_email === "string"
        ? obj.contact_email.slice(0, 120)
        : defaults.contact_email,
    support_url:
      typeof obj.support_url === "string" ? obj.support_url.slice(0, 500) : "",
    privacy_url:
      typeof obj.privacy_url === "string" ? obj.privacy_url.slice(0, 500) : "",
    terms_url:
      typeof obj.terms_url === "string" ? obj.terms_url.slice(0, 500) : "",
    social_links: {
      twitter:
        typeof social.twitter === "string" ? social.twitter.slice(0, 200) : "",
      instagram:
        typeof social.instagram === "string"
          ? social.instagram.slice(0, 200)
          : "",
      github:
        typeof social.github === "string" ? social.github.slice(0, 200) : ""
    }
  };
}

function validateRateLimits(input: unknown): RateLimits {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  const clamp = (v: unknown, min: number, max: number, def: number) => {
    const n = typeof v === "number" ? v : def;
    return Math.max(min, Math.min(max, Math.floor(n)));
  };
  return {
    api_per_min: clamp(obj.api_per_min, 5, 600, 60),
    auth_attempts_per_hr: clamp(obj.auth_attempts_per_hr, 3, 100, 20),
    upload_mb_per_day: clamp(obj.upload_mb_per_day, 1, 1000, 50)
  };
}

function validateTmdbSettings(input: unknown): TmdbSettings {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  return {
    cache_ttl_days:
      typeof obj.cache_ttl_days === "number"
        ? Math.max(1, Math.min(365, Math.floor(obj.cache_ttl_days)))
        : 30,
    fallback_language:
      typeof obj.fallback_language === "string" &&
      obj.fallback_language.length <= 10
        ? obj.fallback_language
        : "en",
    include_adult:
      typeof obj.include_adult === "boolean" ? obj.include_adult : false
  };
}

function validateMaintenanceWindow(input: unknown): MaintenanceWindow {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    scheduled_at:
      typeof obj.scheduled_at === "string" && obj.scheduled_at.length > 0
        ? obj.scheduled_at
        : null,
    message: typeof obj.message === "string" ? obj.message.slice(0, 500) : ""
  };
}

function validateRetentionPolicy(input: unknown): RetentionPolicy {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  const clamp = (v: unknown, min: number, max: number, def: number) => {
    const n = typeof v === "number" ? v : def;
    return Math.max(min, Math.min(max, Math.floor(n)));
  };
  return {
    soft_deleted_profiles_days: clamp(
      obj.soft_deleted_profiles_days,
      1,
      3650,
      90
    ),
    activity_log_days: clamp(obj.activity_log_days, 7, 3650, 180),
    tmdb_cache_days: clamp(obj.tmdb_cache_days, 1, 3650, 30),
    admin_actions_days: clamp(obj.admin_actions_days, 30, 36500, 365)
  };
}

const VALIDATORS: Record<SettingsKey, (input: unknown) => unknown> = {
  site_settings: validateSiteSettings,
  rate_limits: validateRateLimits,
  tmdb_settings: validateTmdbSettings,
  maintenance_window: validateMaintenanceWindow,
  retention_policy: validateRetentionPolicy
};

// ─── Helpers ─────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET /api/admin/settings ─────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("key, value, updated_at")
      .in("key", ALL_KEYS);

    if (error) {
      console.error("[admin/settings] fetch error:", error);
      return jsonResponse({ error: "Failed to fetch settings" }, 500);
    }

    // Merge with defaults
    const result: Record<
      string,
      { value: unknown; updated_at: string | null }
    > = {};
    for (const key of ALL_KEYS) {
      const row = (data ?? []).find((r) => r.key === key);
      if (row) {
        try {
          result[key] = {
            value: VALIDATORS[key](row.value),
            updated_at: row.updated_at
          };
        } catch {
          result[key] = { value: DEFAULTS[key], updated_at: row.updated_at };
        }
      } else {
        result[key] = { value: DEFAULTS[key], updated_at: null };
      }
    }

    return jsonResponse({ settings: result }, 200);
  } catch (err) {
    console.error("[admin/settings] error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PUT /api/admin/settings ─────────────────────────────────────
//
// Body: { settings: { site_settings?: {...}, rate_limits?: {...}, ... } }
// Only the keys present in the body are updated. Validation is
// applied to each provided key.

interface PutBody {
  settings?: unknown;
}

export async function PUT(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = (await event.request.json().catch(() => ({}))) as PutBody;
    if (typeof body.settings !== "object" || body.settings === null) {
      return jsonResponse({ error: "settings object is required" }, 400);
    }

    const input = body.settings as Record<string, unknown>;
    const updates: { key: SettingsKey; value: unknown }[] = [];

    for (const key of ALL_KEYS) {
      if (input[key] !== undefined) {
        try {
          const validated = VALIDATORS[key](input[key]);
          updates.push({ key, value: validated });
        } catch (err) {
          return jsonResponse(
            {
              error: `Invalid value for '${key}': ${err instanceof Error ? err.message : "validation failed"}`
            },
            400
          );
        }
      }
    }

    if (updates.length === 0) {
      return jsonResponse({ error: "No settings to update" }, 400);
    }

    // Upsert each key
    const supabase = createAdminClient();
    const updated: string[] = [];
    const errors: { key: string; error: string }[] = [];

    for (const u of updates) {
      const { error } = await supabase.from("app_config").upsert(
        {
          key: u.key,
          value: u.value,
          // updated_by — the admin's profile id
          // (Supabase will fill updated_at via the trigger)
          updated_by: adminResult.admin.id
        },
        { onConflict: "key" }
      );

      if (error) {
        errors.push({ key: u.key, error: error.message });
      } else {
        updated.push(u.key);
      }
    }

    // Audit log (one entry per updated key)
    for (const u of updates) {
      if (!updated.includes(u.key)) continue;
      await logAdminAction(event, adminResult.admin, {
        action: `settings.update`,
        entity_type: "app_config",
        entity_id: u.key,
        payload: { new_value: u.value }
      });
    }

    if (errors.length > 0) {
      return jsonResponse(
        {
          ok: false,
          updated,
          errors
        },
        500
      );
    }

    return jsonResponse({ ok: true, updated }, 200);
  } catch (err) {
    console.error("[admin/settings] PUT error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
