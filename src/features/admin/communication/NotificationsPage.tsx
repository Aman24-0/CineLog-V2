// src/features/admin/communication/NotificationsPage.tsx
//
// CineLog V2 — Admin Communication Hub: Global Notification Settings
// (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// Single source of truth for GLOBAL notification defaults + limits.
// These are ADMIN-controlled values that apply on top of (not
// instead of) user-side notifPrefs.
//
// WHAT THIS PAGE CONTROLS:
//   • Default quiet hours — applied to brand-new users as their
//     initial notifPrefs. Existing users keep their own settings.
//   • Lead time limits — min/max bounds for the user's
//     episodeReminderLead setting. Users can't set a lead time
//     outside this range.
//   • Push category kill switches — when false, NO user receives
//     that push category, regardless of their personal pref. This
//     is the admin "emergency stop" for a notification type.
//   • Email category kill switches — same idea, for the email
//     fallback channel.
//
// WHAT THIS PAGE DOES NOT CONTROL:
//   • Per-user notification preferences — those live in
//     user_preferences.prefs_json and are edited by users on
//     /settings/notifications. The admin can view a user's prefs
//     via the User Detail Drawer.
//   • VAPID keys / Resend API key — those live on the Services Hub
//     pages (zero duplication).
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — global notification settings live ONLY
//     here. AdminSettingsPage does NOT have a notification section.
//   • Strict user-side mapping — the 5 categories (newSeason,
//     continueWatching, weeklyRecap, recommendations, syncStatus)
//     map exactly to the keys in user notifPrefs and the
//     NotificationType union in src/lib/email/renderer.ts.
//   • No OMDB.
//
// RESPONSIVE: all sections stack to 1 column on mobile.

import {
  createSignal,
  Show,
  onMount,
  For,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";

// ─── Types ───────────────────────────────────────────────────────

interface CategoryToggles {
  newSeason: boolean;
  continueWatching: boolean;
  weeklyRecap: boolean;
  recommendations: boolean;
  syncStatus: boolean;
}

interface NotificationSettings {
  default_quiet_hours_enabled: boolean;
  default_quiet_hours_start: string; // "HH:MM"
  default_quiet_hours_end: string; // "HH:MM"
  min_lead_time_minutes: number;
  max_lead_time_minutes: number;
  push_categories_enabled: CategoryToggles;
  email_categories_enabled: CategoryToggles;
}

interface SettingsResponse {
  settings: {
    notification_settings: { value: NotificationSettings; updated_at: string | null };
  };
}

interface PutResponse {
  ok: boolean;
  updated?: string[];
  errors?: { key: string; error: string }[];
  error?: string;
}

const ALLOWED_LEAD_TIMES = [
  { value: 0, label: "At air time" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "Day before" }
];

const CATEGORY_INFO: { key: keyof CategoryToggles; label: string; description: string }[] = [
  {
    key: "newSeason",
    label: "New Season",
    description: "A tracked series has a new season premiering."
  },
  {
    key: "continueWatching",
    label: "Continue Watching",
    description: "Re-engagement nudge for paused series."
  },
  {
    key: "weeklyRecap",
    label: "Weekly Recap",
    description: "Monday-morning digest of past-week activity."
  },
  {
    key: "recommendations",
    label: "Recommendations",
    description: "Weekly personalized recommendations."
  },
  {
    key: "syncStatus",
    label: "Sync Status",
    description: "Cloud sync completion / failure confirmation."
  }
];

const DEFAULT_SETTINGS: NotificationSettings = {
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
};

// ─── Component ───────────────────────────────────────────────────

const NotificationsPage: Component = () => {
  const [settings, setSettings] = createSignal<NotificationSettings>(DEFAULT_SETTINGS);
  const [updatedAt, setUpdatedAt] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/settings", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as SettingsResponse;
      setSettings(data.settings.notification_settings.value);
      setUpdatedAt(data.settings.notification_settings.updated_at);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchSettings);

  // ─── Update helpers ──────────────────────────────────────

  const updateQuietHours = (patch: Partial<NotificationSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  };

  const updateLeadTime = (field: "min_lead_time_minutes" | "max_lead_time_minutes", value: number) => {
    setSettings((s) => ({ ...s, [field]: value }));
  };

  const updatePushCategory = (key: keyof CategoryToggles, value: boolean) => {
    setSettings((s) => ({
      ...s,
      push_categories_enabled: {
        ...s.push_categories_enabled,
        [key]: value
      }
    }));
  };

  const updateEmailCategory = (key: keyof CategoryToggles, value: boolean) => {
    setSettings((s) => ({
      ...s,
      email_categories_enabled: {
        ...s.email_categories_enabled,
        [key]: value
      }
    }));
  };

  // ─── Save ────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            notification_settings: settings()
          }
        })
      });
      const json = (await resp.json()) as PutResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(
          json.error ?? json.errors?.[0]?.error ?? `HTTP ${resp.status}`
        );
      }
      setSuccess("Saved. Changes apply to new notifications immediately.");
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "never";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div class="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 class="m-0 text-2xl font-bold text-text-strong">
            Global Notification Settings
          </h1>
          <p class="mt-1 text-sm text-text-muted">
            Admin-controlled defaults and limits that apply on top of each
            user's notification preferences. Per-user preferences live on
            the user-side Settings page.
          </p>
        </div>
        <GlassButton
          variant="primary"
          size="default"
          icon={saving() ? "progress_activity" : "save"}
          onClick={() => void save()}
          disabled={saving() || loading()}
          loading={saving()}
        >
          {saving() ? "Saving…" : "Save all"}
        </GlassButton>
      </header>

      {/* ─── Error / success ────────────────────────────────── */}
      <Show when={error()}>
        <GlassCard
          variant="glass"
          size="compact"
          class="border-danger/30 bg-danger-bg text-danger"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            {error()}
          </div>
        </GlassCard>
      </Show>
      <Show when={success()}>
        <GlassCard
          variant="glass"
          size="compact"
          class="border-success/30 bg-success-bg text-success"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined" aria-hidden="true">
              check_circle
            </span>
            {success()}
          </div>
        </GlassCard>
      </Show>

      {/* ─── Default quiet hours ────────────────────────────── */}
      <GlassCard variant="glass" size="comfortable">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-base font-semibold text-text-strong">
              Default Quiet Hours
            </h2>
            <p class="mt-1 text-xs text-text-muted">
              Applied to brand-new users as their initial preference. Existing
              users keep their own settings.
            </p>
          </div>
          <GlassBadge intent="default" size="compact">
            Updated: {formatDate(updatedAt())}
          </GlassBadge>
        </div>

        <div class="flex flex-col gap-4">
          <label class="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              class="h-4 w-4 accent-primary"
              checked={settings().default_quiet_hours_enabled}
              onChange={(e) =>
                updateQuietHours({
                  default_quiet_hours_enabled: e.currentTarget.checked
                })
              }
            />
            <span class="text-sm text-text">
              Enable quiet hours by default for new users
            </span>
          </label>

          <Show when={settings().default_quiet_hours_enabled}>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Default start
                </label>
                <input
                  type="time"
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={settings().default_quiet_hours_start}
                  onInput={(e) =>
                    updateQuietHours({
                      default_quiet_hours_start: e.currentTarget.value
                    })
                  }
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Default end
                </label>
                <input
                  type="time"
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={settings().default_quiet_hours_end}
                  onInput={(e) =>
                    updateQuietHours({
                      default_quiet_hours_end: e.currentTarget.value
                    })
                  }
                />
              </div>
            </div>
          </Show>
        </div>
      </GlassCard>

      {/* ─── Lead time limits ───────────────────────────────── */}
      <GlassCard variant="glass" size="comfortable">
        <div class="mb-4">
          <h2 class="m-0 text-base font-semibold text-text-strong">
            Lead Time Limits
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            Bounds for the user's "Remind me before" setting. Users can't set
            a lead time outside this range.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
              Minimum lead time
            </label>
            <select
              class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
              value={settings().min_lead_time_minutes}
              onChange={(e) =>
                updateLeadTime(
                  "min_lead_time_minutes",
                  Number(e.currentTarget.value)
                )
              }
            >
              <For each={ALLOWED_LEAD_TIMES}>
                {(opt) => (
                  <option value={opt.value} disabled={opt.value > settings().max_lead_time_minutes}>
                    {opt.label}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
              Maximum lead time
            </label>
            <select
              class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
              value={settings().max_lead_time_minutes}
              onChange={(e) =>
                updateLeadTime(
                  "max_lead_time_minutes",
                  Number(e.currentTarget.value)
                )
              }
            >
              <For each={ALLOWED_LEAD_TIMES}>
                {(opt) => (
                  <option value={opt.value} disabled={opt.value < settings().min_lead_time_minutes}>
                    {opt.label}
                  </option>
                )}
              </For>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── Push category kill switches ────────────────────── */}
      <GlassCard variant="glass" size="comfortable">
        <div class="mb-4">
          <h2 class="m-0 text-base font-semibold text-text-strong">
            Push Categories — Global Kill Switches
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            When OFF, NO user receives that push category, regardless of their
            personal preference. Use as an emergency stop.
          </p>
        </div>
        <div class="flex flex-col gap-3">
          <For each={CATEGORY_INFO}>
            {(cat) => {
              const enabled = () => settings().push_categories_enabled[cat.key];
              return (
                <div class="flex items-center justify-between gap-3 rounded-md border border-glass-border bg-tier-2 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-text-strong">{cat.label}</div>
                    <div class="text-xs text-text-muted">{cat.description}</div>
                  </div>
                  <label class="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-primary"
                      checked={enabled()}
                      onChange={(e) => updatePushCategory(cat.key, e.currentTarget.checked)}
                    />
                    <span
                      class="text-xs font-semibold"
                      classList={{
                        "text-success": enabled(),
                        "text-danger": !enabled()
                      }}
                    >
                      {enabled() ? "ENABLED" : "DISABLED"}
                    </span>
                  </label>
                </div>
              );
            }}
          </For>
        </div>
      </GlassCard>

      {/* ─── Email category kill switches ───────────────────── */}
      <GlassCard variant="glass" size="comfortable">
        <div class="mb-4">
          <h2 class="m-0 text-base font-semibold text-text-strong">
            Email Categories — Global Kill Switches
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            When OFF, NO user receives that email category, regardless of their
            personal preference. Applies to the email fallback channel only.
          </p>
        </div>
        <div class="flex flex-col gap-3">
          <For each={CATEGORY_INFO}>
            {(cat) => {
              const enabled = () => settings().email_categories_enabled[cat.key];
              return (
                <div class="flex items-center justify-between gap-3 rounded-md border border-glass-border bg-tier-2 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-text-strong">{cat.label}</div>
                    <div class="text-xs text-text-muted">{cat.description}</div>
                  </div>
                  <label class="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-primary"
                      checked={enabled()}
                      onChange={(e) => updateEmailCategory(cat.key, e.currentTarget.checked)}
                    />
                    <span
                      class="text-xs font-semibold"
                      classList={{
                        "text-success": enabled(),
                        "text-danger": !enabled()
                      }}
                    >
                      {enabled() ? "ENABLED" : "DISABLED"}
                    </span>
                  </label>
                </div>
              );
            }}
          </For>
        </div>
      </GlassCard>

      {/* ─── Sticky save bar ────────────────────────────────── */}
      <div class="flex justify-end gap-3 border-t border-glass-border pt-4">
        <GlassButton
          variant="glass"
          size="default"
          onClick={() => void fetchSettings()}
          disabled={saving()}
        >
          Revert
        </GlassButton>
        <GlassButton
          variant="primary"
          size="default"
          icon={saving() ? "progress_activity" : "save"}
          onClick={() => void save()}
          disabled={saving()}
          loading={saving()}
        >
          {saving() ? "Saving…" : "Save all"}
        </GlassButton>
      </div>
    </div>
  );
};

export default NotificationsPage;
