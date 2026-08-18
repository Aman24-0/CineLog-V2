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
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

// ─── Settings schema (for validation) ────────────────────────────

type SettingsKey =
  | "site_settings"
  | "rate_limits"
  | "tmdb_settings"
  | "maintenance_window"
  | "retention_policy"
  // Phase 9 Chunk 4 — Communication Hub: global notification settings.
  // The Communication Hub → Notifications page is the SINGLE source
  // of truth for these values; they are NOT editable on
  // AdminSettingsPage (zero duplication).
  | "notification_settings"
  // Phase 16 Chunk 1 — AI Integration (Groq): Control Center flags.
  // The Admin AI Control Center (/admin/ai) is the SINGLE source of
  // truth for these values; they are NOT editable on AdminSettingsPage
  // (zero duplication). Server-side AI routes read these flags via
  // checkAiSettings() in src/lib/server/groq.ts.
  | "ai_settings";

const ALL_KEYS: SettingsKey[] = [
  "site_settings",
  "rate_limits",
  "tmdb_settings",
  "maintenance_window",
  "retention_policy",
  "notification_settings",
  "ai_settings"
];

interface SocialLink {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  enabled: boolean;
  order: number;
}

interface SiteSettings {
  site_name: string;
  tagline: string;
  contact_email: string;
  support_url: string;
  privacy_url: string;
  terms_url: string;
  social_links: SocialLink[];
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
  // Phase 9 Chunk 6 — optional end timestamp for the maintenance window.
  // When set, the banner auto-dismisses after this time. Backward-compatible:
  // missing/null means the window stays until an admin disables it manually.
  ends_at: string | null;
  message: string;
}

interface RetentionPolicy {
  soft_deleted_profiles_days: number;
  activity_log_days: number;
  tmdb_cache_days: number;
  admin_actions_days: number;
}

// Phase 9 Chunk 4 — Global notification settings.
//
// These are ADMIN-controlled defaults and limits that apply on top
// of (not instead of) user-side notifPrefs. The mapping is:
//
//   • default_quiet_hours_start / end — applied to brand-new users
//     as their initial notifPrefs.quietHoursStart / End. Existing
//     users keep whatever they've set.
//   • min_lead_time_minutes / max_lead_time_minutes — bounds for
//     the user's episodeReminderLead setting. Users can't set a
//     lead time outside this range.
//   • push_categories_enabled — GLOBAL kill switches per category.
//     When false, NO user receives that category, regardless of
//     their personal pref. This is the admin emergency stop.
//   • email_categories_enabled — same idea, for email fallback.
interface NotificationSettings {
  default_quiet_hours_enabled: boolean;
  default_quiet_hours_start: string; // "HH:MM"
  default_quiet_hours_end: string; // "HH:MM"
  min_lead_time_minutes: number; // 0, 5, 15, 30, 60, 1440
  max_lead_time_minutes: number; // upper bound for user's lead time
  push_categories_enabled: {
    newSeason: boolean;
    continueWatching: boolean;
    weeklyRecap: boolean;
    recommendations: boolean;
    syncStatus: boolean;
  };
  email_categories_enabled: {
    newSeason: boolean;
    continueWatching: boolean;
    weeklyRecap: boolean;
    recommendations: boolean;
    syncStatus: boolean;
  };
}

interface AiSettings {
  masterEnabled: boolean;
  userRecommendationsEnabled: boolean;
  adminAssistantEnabled: boolean;
}

interface AllSettings {
  site_settings: SiteSettings;
  rate_limits: RateLimits;
  tmdb_settings: TmdbSettings;
  maintenance_window: MaintenanceWindow;
  retention_policy: RetentionPolicy;
  notification_settings: NotificationSettings;
  ai_settings: AiSettings;
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
    social_links: []
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
  maintenance_window: { enabled: false, scheduled_at: null, ends_at: null, message: "" },
  retention_policy: {
    soft_deleted_profiles_days: 90,
    activity_log_days: 180,
    tmdb_cache_days: 30,
    admin_actions_days: 365
  },
  // Phase 9 Chunk 4 — Communication Hub defaults.
  // The quiet-hours defaults mirror DEFAULT_NOTIF_PREFS from
  // core/preferences/notifications.ts so brand-new users start with
  // the same experience regardless of which side they're configured
  // on. The push/email category kill switches default to true
  // (all channels enabled) — the admin can disable a category
  // globally only when there's a specific reason to.
  notification_settings: {
    default_quiet_hours_enabled: false,
    default_quiet_hours_start: "22:00",
    default_quiet_hours_end: "07:00",
    min_lead_time_minutes: 5,
    max_lead_time_minutes: 1440,
    push_categories_enabled: {
      newSeason: true,
      continueWatching: true,
      weeklyRecap: true,
      recommendations: true,
      syncStatus: true
    },
    email_categories_enabled: {
      newSeason: true,
      continueWatching: true,
      weeklyRecap: true,
      recommendations: true,
      syncStatus: true
    }
  },
  // Phase 16 Chunk 1 — AI defaults: ALL OFF. AI must be explicitly
  // opted-in via /admin/ai. This mirrors the seed in
  // supabase/migrations/20260815_add_ai_settings.sql and the
  // DEFAULT_AI_SETTINGS in src/lib/server/groq.ts.
  ai_settings: {
    masterEnabled: false,
    userRecommendationsEnabled: false,
    adminAssistantEnabled: false,
    defaultModel: "openai/gpt-oss-20b",
    enabledModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
    fallbackModel: "openai/gpt-oss-120b",
    featureModels: {}
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

  // Validate social_links — only the dynamic array format is supported.
  // Legacy { facebook, instagram, twitter, discord } format is no longer
  // recognized. The migration has been completed.
  let socialLinks: SocialLink[] = [];
  if (Array.isArray(obj.social_links)) {
    socialLinks = obj.social_links
      .filter((item: unknown) => typeof item === "object" && item !== null)
      .map((item: unknown, idx: number) => {
        const link = item as Record<string, unknown>;
        return {
          id:
            typeof link.id === "string" && link.id.length > 0
              ? link.id.slice(0, 64)
              : `link-${idx}`,
          name:
            typeof link.name === "string"
              ? link.name.slice(0, 60)
              : "",
          url:
            typeof link.url === "string"
              ? link.url.slice(0, 500)
              : "",
          iconUrl:
            typeof link.iconUrl === "string"
              ? link.iconUrl.slice(0, 500)
              : "",
          enabled:
            typeof link.enabled === "boolean"
              ? link.enabled
              : true,
          order:
            typeof link.order === "number" && Number.isFinite(link.order)
              ? Math.floor(link.order)
              : idx,
        };
      })
      // Cap at 20 social links to prevent abuse
      .slice(0, 20);
  }
  // If social_links is not an array (e.g. legacy object format or null),
  // it becomes an empty array — admin must re-add links in dynamic format.

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
    social_links: socialLinks,
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
  const scheduledAt =
    typeof obj.scheduled_at === "string" && obj.scheduled_at.length > 0
      ? obj.scheduled_at
      : null;
  let endsAt: string | null = null;
  if (typeof obj.ends_at === "string" && obj.ends_at.length > 0) {
    // If ends_at is before scheduled_at, ignore it (treat as null) rather
    // than rejecting the whole payload — the admin UI prevents this
    // client-side, but we defend here too.
    if (scheduledAt && new Date(obj.ends_at) > new Date(scheduledAt)) {
      endsAt = obj.ends_at;
    } else if (!scheduledAt) {
      endsAt = obj.ends_at;
    }
  }
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    scheduled_at: scheduledAt,
    ends_at: endsAt,
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

// Phase 9 Chunk 4 — notification settings validator.
// Validates the shape of the notification_settings key. Unknown
// fields are dropped; missing fields fall back to defaults.
function validateNotificationSettings(input: unknown): NotificationSettings {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  const defaults = DEFAULTS.notification_settings;

  // Validate HH:MM time strings.
  const validateTime = (v: unknown, def: string): string => {
    if (typeof v !== "string") return def;
    const m = v.match(/^(\d{2}):(\d{2})$/);
    if (!m) return def;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return def;
    return v;
  };

  // Validate lead time minutes — must be one of the allowed values.
  const ALLOWED_LEAD_TIMES = [0, 5, 15, 30, 60, 1440];
  const validateLeadTime = (v: unknown, def: number): number => {
    const n = typeof v === "number" ? v : def;
    return ALLOWED_LEAD_TIMES.includes(n) ? n : def;
  };

  // Validate a category-enabled sub-object.
  const validateCategories = (
    sub: unknown,
    def: NotificationSettings["push_categories_enabled"]
  ): NotificationSettings["push_categories_enabled"] => {
    const o =
      sub && typeof sub === "object" ? (sub as Record<string, unknown>) : {};
    return {
      newSeason: typeof o.newSeason === "boolean" ? o.newSeason : def.newSeason,
      continueWatching:
        typeof o.continueWatching === "boolean"
          ? o.continueWatching
          : def.continueWatching,
      weeklyRecap:
        typeof o.weeklyRecap === "boolean" ? o.weeklyRecap : def.weeklyRecap,
      recommendations:
        typeof o.recommendations === "boolean"
          ? o.recommendations
          : def.recommendations,
      syncStatus:
        typeof o.syncStatus === "boolean" ? o.syncStatus : def.syncStatus
    };
  };

  const minLead = validateLeadTime(
    obj.min_lead_time_minutes,
    defaults.min_lead_time_minutes
  );
  const maxLead = validateLeadTime(
    obj.max_lead_time_minutes,
    defaults.max_lead_time_minutes
  );

  return {
    default_quiet_hours_enabled:
      typeof obj.default_quiet_hours_enabled === "boolean"
        ? obj.default_quiet_hours_enabled
        : defaults.default_quiet_hours_enabled,
    default_quiet_hours_start: validateTime(
      obj.default_quiet_hours_start,
      defaults.default_quiet_hours_start
    ),
    default_quiet_hours_end: validateTime(
      obj.default_quiet_hours_end,
      defaults.default_quiet_hours_end
    ),
    // Ensure min <= max. If they're swapped, fall back to defaults.
    min_lead_time_minutes:
      minLead <= maxLead ? minLead : defaults.min_lead_time_minutes,
    max_lead_time_minutes:
      minLead <= maxLead ? maxLead : defaults.max_lead_time_minutes,
    push_categories_enabled: validateCategories(
      obj.push_categories_enabled,
      defaults.push_categories_enabled
    ),
    email_categories_enabled: validateCategories(
      obj.email_categories_enabled,
      defaults.email_categories_enabled
    )
  };
}

// Phase 16 Chunk 1 — AI settings validator.
// Validates the shape of the ai_settings key. Unknown fields are
// dropped; missing/non-boolean fields default to false. We NEVER
// default a flag to true here — AI is off until an admin explicitly
// turns it on. This matches the migration seed and the server-side
// DEFAULT_AI_SETTINGS.
function validateAiSettings(input: unknown): AiSettings {
  if (typeof input !== "object" || input === null)
    throw new Error("must be an object");
  const obj = input as Record<string, unknown>;
  const asBool = (v: unknown): boolean =>
    typeof v === "boolean" ? v : false;

  // Known model IDs — accept any non-empty string for forward
  // compatibility (new models may be added to Groq at any time).
  const asString = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
  const asStringArray = (v: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(v)) return fallback;
    const filtered = v.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    );
    return filtered.length > 0 ? filtered : fallback;
  };

  return {
    masterEnabled: asBool(obj.masterEnabled),
    userRecommendationsEnabled: asBool(obj.userRecommendationsEnabled),
    adminAssistantEnabled: asBool(obj.adminAssistantEnabled),
    defaultModel: asString(obj.defaultModel, "openai/gpt-oss-20b"),
    enabledModels: asStringArray(obj.enabledModels, [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b"
    ]),
    fallbackModel: asString(obj.fallbackModel, "openai/gpt-oss-120b"),
    featureModels: typeof obj.featureModels === "object" && obj.featureModels !== null
      ? obj.featureModels as Record<string, string>
      : {}
  };
}

const VALIDATORS: Record<SettingsKey, (input: unknown) => unknown> = {
  site_settings: validateSiteSettings,
  rate_limits: validateRateLimits,
  tmdb_settings: validateTmdbSettings,
  maintenance_window: validateMaintenanceWindow,
  retention_policy: validateRetentionPolicy,
  notification_settings: validateNotificationSettings,
  ai_settings: validateAiSettings
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

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "settings.update"
  );
  if (rateLimited) return rateLimited;

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
