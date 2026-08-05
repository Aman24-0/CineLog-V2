// src/features/admin/AdminSettingsPage.tsx
//
// CineLog V2 — Admin Settings Page Component
// ---------------------------------------------------------------------
// Editable form for the site-wide settings keys (defined in the
// Phase 3 migration). Phase 9 Chunk 2 enforces the zero-duplication
// rule: service-specific settings belong on the dedicated Services
// Hub page, NOT here. The keys currently editable on this page are:
//   1. site_settings      — site name, tagline, contact, social links
//   2. rate_limits        — per-min / per-hour / per-day caps
//   3. maintenance_window — banner toggle, scheduled time, message
//   4. retention_policy   — how long to keep soft-deleted rows, logs
//
// REMOVED (Phase 9 Chunk 2):
//   • tmdb_settings — moved to /admin/services/tmdb (TmdbServicePage).
//     Same backing key (tmdb_settings) on /api/admin/settings, same
//     PUT shape — only the UI control moved. This is the single source
//     of truth for TMDB config now; editing it on both pages would
//     inevitably drift.
//   • Any future service-specific key (e.g. anilist_settings,
//     resend_settings) should also live on its corresponding
//     /admin/services/<name> page, not here.
//
// DATA FLOW:
//   • GET /api/admin/settings returns { settings: { key: { value, updated_at } } }
//   • On save, we send PUT /api/admin/settings with { settings: { key: newValue } }
//     for only the keys that changed.
//   • The API validates each value; on success we re-fetch the full
//     state so the UI reflects server-side clamping.

import {
  createSignal,
  Show,
  onMount,
  type Component,
  type JSX
} from "solid-js";
import AdminTwoFactorPanel from "~/features/admin/components/AdminTwoFactorPanel";

interface SiteSettings {
  site_name: string;
  tagline: string;
  contact_email: string;
  support_url: string;
  privacy_url: string;
  terms_url: string;
  social_links: { twitter: string; instagram: string; github: string };
}
interface RateLimits {
  api_per_min: number;
  auth_attempts_per_hr: number;
  upload_mb_per_day: number;
}
// TmdbSettings is still part of the SettingsState shape (the server
// returns it), but Phase 9 Chunk 2 removed the editable UI for it
// from this page. The admin edits TMDB config on
// /admin/services/tmdb now. We keep the type here so the fetch
// result is correctly typed; we just don't render inputs for it.
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

interface SettingsState {
  site_settings: { value: SiteSettings; updated_at: string | null };
  rate_limits: { value: RateLimits; updated_at: string | null };
  tmdb_settings: { value: TmdbSettings; updated_at: string | null };
  maintenance_window: { value: MaintenanceWindow; updated_at: string | null };
  retention_policy: { value: RetentionPolicy; updated_at: string | null };
}

const AdminSettingsPage: Component = () => {
  const [settings, setSettings] = createSignal<SettingsState | null>(null);
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
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { settings: SettingsState };
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchSettings);

  // ─── Local mutation helpers ────────────────────────────────
  const updateSite = (patch: Partial<SiteSettings>) => {
    setSettings((s) =>
      s
        ? {
            ...s,
            site_settings: {
              ...s.site_settings,
              value: { ...s.site_settings.value, ...patch }
            }
          }
        : s
    );
  };
  const updateSocial = (
    key: keyof SiteSettings["social_links"],
    val: string
  ) => {
    setSettings((s) =>
      s
        ? {
            ...s,
            site_settings: {
              ...s.site_settings,
              value: {
                ...s.site_settings.value,
                social_links: {
                  ...s.site_settings.value.social_links,
                  [key]: val
                }
              }
            }
          }
        : s
    );
  };
  const updateRateLimits = (patch: Partial<RateLimits>) => {
    setSettings((s) =>
      s
        ? {
            ...s,
            rate_limits: {
              ...s.rate_limits,
              value: { ...s.rate_limits.value, ...patch }
            }
          }
        : s
    );
  };
  // updateTmdb was removed in Phase 9 Chunk 2 — TMDB settings are now
  // edited on /admin/services/tmdb (TmdbServicePage). The
  // tmdb_settings key is still loaded from the API (so the type is
  // correct) but is read-only on this page.
  const updateMaintenance = (patch: Partial<MaintenanceWindow>) => {
    setSettings((s) =>
      s
        ? {
            ...s,
            maintenance_window: {
              ...s.maintenance_window,
              value: { ...s.maintenance_window.value, ...patch }
            }
          }
        : s
    );
  };
  const updateRetention = (patch: Partial<RetentionPolicy>) => {
    setSettings((s) =>
      s
        ? {
            ...s,
            retention_policy: {
              ...s.retention_policy,
              value: { ...s.retention_policy.value, ...patch }
            }
          }
        : s
    );
  };

  // ─── Save handler ──────────────────────────────────────────
  const save = async () => {
    const s = settings();
    if (!s) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Phase 9 Chunk 2 — tmdb_settings is intentionally omitted
      // from the PUT body. Editing it here would re-introduce the
      // duplication the Services Hub was created to prevent. The
      // TmdbServicePage sends its own PUT for tmdb_settings.
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            site_settings: s.site_settings.value,
            rate_limits: s.rate_limits.value,
            maintenance_window: s.maintenance_window.value,
            retention_policy: s.retention_policy.value
          }
        })
      });
      const json = (await resp.json()) as {
        ok: boolean;
        updated?: string[];
        errors?: { key: string; error: string }[];
        error?: string;
      };
      if (!resp.ok || !json.ok) {
        throw new Error(
          json.error ?? json.errors?.[0]?.error ?? `HTTP ${resp.status}`
        );
      }
      setSuccess(`Saved ${json.updated?.length ?? 0} settings.`);
      // Re-fetch to reflect server-side clamping
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
    <div
      class="admin-settings-page"
      style={{ padding: "var(--sp-6)", "max-width": "900px" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "var(--sp-6)",
          "flex-wrap": "wrap",
          gap: "var(--sp-3)"
        }}
      >
        <div>
          <h1
            style={{ margin: 0, "font-size": "1.75rem", color: "var(--text)" }}
          >
            Settings
          </h1>
          <p
            style={{
              margin: "var(--sp-1) 0 0 0",
              color: "var(--text-muted)",
              "font-size": "0.875rem"
            }}
          >
            Site-wide configuration. Changes are audit-logged.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving() || !settings()}
          style={btnStyle(saving() || !settings())}
        >
          {saving() ? "Saving…" : "💾 Save all"}
        </button>
      </div>

      <Show when={error()}>
        <div style={errorStyle}>{error()}</div>
      </Show>
      <Show when={success()}>
        <div style={successStyle}>{success()}</div>
      </Show>

      <Show when={loading() && !settings()} fallback={null}>
        <div style={loadingStyle}>Loading settings…</div>
      </Show>

      <Show when={settings()}>
        {/* ─── Site settings ─────────────────────────────── */}
        <Section
          title="Site settings"
          subtitle="Brand and contact details shown across the app."
          updated={formatDate(settings()!.site_settings.updated_at)}
        >
          <Field label="Site name">
            <input
              type="text"
              value={settings()!.site_settings.value.site_name}
              onInput={(e) => updateSite({ site_name: e.currentTarget.value })}
              style={inputStyle}
              maxlength={60}
            />
          </Field>
          <Field label="Tagline">
            <input
              type="text"
              value={settings()!.site_settings.value.tagline}
              onInput={(e) => updateSite({ tagline: e.currentTarget.value })}
              style={inputStyle}
              maxlength={120}
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={settings()!.site_settings.value.contact_email}
              onInput={(e) =>
                updateSite({ contact_email: e.currentTarget.value })
              }
              style={inputStyle}
              maxlength={120}
            />
          </Field>
          <div style={fieldGridStyle}>
            <Field label="Support URL">
              <input
                type="url"
                value={settings()!.site_settings.value.support_url}
                onInput={(e) =>
                  updateSite({ support_url: e.currentTarget.value })
                }
                style={inputStyle}
                placeholder="https://"
              />
            </Field>
            <Field label="Privacy URL">
              <input
                type="url"
                value={settings()!.site_settings.value.privacy_url}
                onInput={(e) =>
                  updateSite({ privacy_url: e.currentTarget.value })
                }
                style={inputStyle}
                placeholder="https://"
              />
            </Field>
            <Field label="Terms URL">
              <input
                type="url"
                value={settings()!.site_settings.value.terms_url}
                onInput={(e) =>
                  updateSite({ terms_url: e.currentTarget.value })
                }
                style={inputStyle}
                placeholder="https://"
              />
            </Field>
          </div>
          <Field label="Social links">
            <div style={fieldGridStyle}>
              <input
                type="url"
                value={settings()!.site_settings.value.social_links.twitter}
                onInput={(e) => updateSocial("twitter", e.currentTarget.value)}
                style={inputStyle}
                placeholder="Twitter/X URL"
              />
              <input
                type="url"
                value={settings()!.site_settings.value.social_links.instagram}
                onInput={(e) =>
                  updateSocial("instagram", e.currentTarget.value)
                }
                style={inputStyle}
                placeholder="Instagram URL"
              />
              <input
                type="url"
                value={settings()!.site_settings.value.social_links.github}
                onInput={(e) => updateSocial("github", e.currentTarget.value)}
                style={inputStyle}
                placeholder="GitHub URL"
              />
            </div>
          </Field>
        </Section>

        {/* ─── Rate limits ───────────────────────────────── */}
        <Section
          title="Rate limits"
          subtitle="Per-user request caps. The server enforces these."
          updated={formatDate(settings()!.rate_limits.updated_at)}
        >
          <div style={fieldGridStyle}>
            <Field label="API requests / min">
              <input
                type="number"
                min={5}
                max={600}
                value={settings()!.rate_limits.value.api_per_min}
                onInput={(e) =>
                  updateRateLimits({
                    api_per_min: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Auth attempts / hour">
              <input
                type="number"
                min={3}
                max={100}
                value={settings()!.rate_limits.value.auth_attempts_per_hr}
                onInput={(e) =>
                  updateRateLimits({
                    auth_attempts_per_hr: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Upload MB / day">
              <input
                type="number"
                min={1}
                max={1000}
                value={settings()!.rate_limits.value.upload_mb_per_day}
                onInput={(e) =>
                  updateRateLimits({
                    upload_mb_per_day: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
          </div>
        </Section>

        {/* ─── TMDB settings ────────────────────────────────────
            Phase 9 Chunk 2: removed from this page to enforce the
            zero-duplication rule. TMDB settings are now edited on
            /admin/services/tmdb (TmdbServicePage), which is the
            single source of truth for all TMDB operational config
            (status, cache, API key, cache TTL, fallback language,
            include_adult). Keeping them here too would inevitably
            drift. The link below takes the operator there. */}
        <Section
          title="TMDB settings"
          subtitle="Moved to the Services Hub (zero duplication)."
          updated={formatDate(settings()!.tmdb_settings.updated_at)}
        >
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "var(--sp-3)",
              "flex-wrap": "wrap"
            }}
          >
            <div
              style={{
                "font-size": "0.875rem",
                color: "var(--text-muted)"
              }}
            >
              Cache TTL, fallback language, and adult content toggle
              now live on the dedicated TMDB service page.
            </div>
            <a
              href="/admin/services/tmdb"
              style={{
                color: "var(--p)",
                "text-decoration": "none",
                "font-size": "0.8125rem",
                "font-weight": 600,
                "border": "1px solid var(--hairline-2)",
                padding: "var(--sp-2) var(--sp-4)",
                "border-radius": "var(--radius-md)",
                background: "var(--tier-2)"
              }}
            >
              Open TMDB Service →
            </a>
          </div>
        </Section>

        {/* ─── Maintenance window ─────────────────────────── */}
        <Section
          title="Maintenance window"
          subtitle="Show a banner to users when maintenance is scheduled."
          updated={formatDate(settings()!.maintenance_window.updated_at)}
        >
          <Field label="Enabled">
            <label
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-2)",
                "font-size": "0.875rem",
                color: "var(--text)"
              }}
            >
              <input
                type="checkbox"
                checked={settings()!.maintenance_window.value.enabled}
                onChange={(e) =>
                  updateMaintenance({ enabled: e.currentTarget.checked })
                }
              />
              Show maintenance banner to users
            </label>
          </Field>
          <Field label="Scheduled at (UTC)">
            <input
              type="datetime-local"
              value={
                settings()!.maintenance_window.value.scheduled_at
                  ? new Date(settings()!.maintenance_window.value.scheduled_at!)
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onInput={(e) =>
                updateMaintenance({
                  scheduled_at: e.currentTarget.value
                    ? new Date(e.currentTarget.value).toISOString()
                    : null
                })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Banner message">
            <textarea
              value={settings()!.maintenance_window.value.message}
              onInput={(e) =>
                updateMaintenance({ message: e.currentTarget.value })
              }
              style={{
                ...inputStyle,
                "min-height": "80px",
                resize: "vertical"
              }}
              maxlength={500}
              placeholder="We'll be performing scheduled maintenance. Some features may be unavailable."
            />
          </Field>
        </Section>

        {/* ─── Retention policy ───────────────────────────── */}
        <Section
          title="Retention policy"
          subtitle="How long to keep soft-deleted rows, logs, and cache. Used by Maintenance operations as default cutoffs."
          updated={formatDate(settings()!.retention_policy.updated_at)}
        >
          <div style={fieldGridStyle}>
            <Field label="Soft-deleted profiles (days)">
              <input
                type="number"
                min={1}
                max={3650}
                value={
                  settings()!.retention_policy.value.soft_deleted_profiles_days
                }
                onInput={(e) =>
                  updateRetention({
                    soft_deleted_profiles_days: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Activity log (days)">
              <input
                type="number"
                min={7}
                max={3650}
                value={settings()!.retention_policy.value.activity_log_days}
                onInput={(e) =>
                  updateRetention({
                    activity_log_days: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="TMDB cache (days)">
              <input
                type="number"
                min={1}
                max={3650}
                value={settings()!.retention_policy.value.tmdb_cache_days}
                onInput={(e) =>
                  updateRetention({
                    tmdb_cache_days: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Admin actions (days)">
              <input
                type="number"
                min={30}
                max={36500}
                value={settings()!.retention_policy.value.admin_actions_days}
                onInput={(e) =>
                  updateRetention({
                    admin_actions_days: Number(e.currentTarget.value)
                  })
                }
                style={inputStyle}
              />
            </Field>
          </div>
        </Section>

        {/* Sticky save bar at bottom */}
        <div
          style={{
            "margin-top": "var(--sp-8)",
            "padding-top": "var(--sp-4)",
            "border-top": "1px solid var(--hairline)",
            display: "flex",
            "justify-content": "flex-end",
            gap: "var(--sp-3)"
          }}
        >
          <button
            type="button"
            onClick={fetchSettings}
            disabled={saving()}
            style={cancelBtnStyle}
          >
            Revert
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving()}
            style={btnStyle(saving())}
          >
            {saving() ? "Saving…" : "💾 Save all"}
          </button>
        </div>
      </Show>

      {/* Phase 6 Part 3 — Task 4: Admin 2FA enrollment panel.
          Always rendered (independent of the site-wide settings above),
          because 2FA is per-admin, not site-wide. */}
      <div style={{ "margin-top": "var(--sp-6)" }}>
        <AdminTwoFactorPanel />
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────

const Section: Component<{
  title: string;
  subtitle?: string;
  updated?: string;
  children: JSX.Element;
}> = (props) => (
  <section
    style={{
      "margin-bottom": "var(--sp-8)",
      background: "var(--tier-1)",
      border: "1px solid var(--hairline)",
      "border-radius": "var(--radius-md)",
      padding: "var(--sp-6)"
    }}
  >
    <div style={{ "margin-bottom": "var(--sp-4)" }}>
      <h2 style={{ margin: 0, "font-size": "1.125rem", color: "var(--text)" }}>
        {props.title}
      </h2>
      <Show when={props.subtitle}>
        <p
          style={{
            margin: "var(--sp-1) 0 0 0",
            "font-size": "0.8125rem",
            color: "var(--text-muted)"
          }}
        >
          {props.subtitle}
        </p>
      </Show>
      <Show when={props.updated}>
        <p
          style={{
            margin: "var(--sp-1) 0 0 0",
            "font-size": "0.75rem",
            color: "var(--text-muted)"
          }}
        >
          Last updated: {props.updated}
        </p>
      </Show>
    </div>
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--sp-4)"
      }}
    >
      {props.children}
    </div>
  </section>
);

const Field: Component<{ label: string; children: JSX.Element }> = (props) => (
  <div
    style={{
      display: "flex",
      "flex-direction": "column",
      gap: "var(--sp-2)",
      flex: 1,
      "min-width": 0
    }}
  >
    <label
      style={{
        "font-size": "0.8125rem",
        color: "var(--text-secondary)",
        "font-weight": "500"
      }}
    >
      {props.label}
    </label>
    {props.children}
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "var(--sp-2) var(--sp-3)",
  background: "var(--tier-2)",
  border: "1px solid var(--hairline-2)",
  "border-radius": "var(--radius-md)",
  color: "var(--text)",
  "font-size": "0.875rem",
  "font-family": "inherit",
  outline: "none",
  "box-sizing": "border-box" as const
} as const;

const fieldGridStyle = {
  display: "grid",
  "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--sp-4)"
} as const;

const errorStyle = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-3) var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  color: "rgb(252, 165, 165)",
  "font-size": "0.875rem"
} as const;

const successStyle = {
  background: "rgba(74, 222, 128, 0.1)",
  border: "1px solid rgba(74, 222, 128, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-3) var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  color: "rgb(187, 247, 208)",
  "font-size": "0.875rem"
} as const;

const loadingStyle = {
  padding: "var(--sp-8)",
  "text-align": "center",
  color: "var(--text-muted)",
  "font-size": "0.875rem"
} as const;

const cancelBtnStyle = {
  padding: "var(--sp-2) var(--sp-4)",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--hairline-2)",
  "border-radius": "var(--radius-md)",
  "font-size": "0.8125rem",
  "font-weight": "500",
  cursor: "pointer"
} as const;

function btnStyle(disabled: boolean) {
  return {
    padding: "var(--sp-2) var(--sp-4)",
    background: disabled ? "var(--tier-3)" : "var(--p)",
    color: disabled ? "var(--text-muted)" : "var(--on-primary)",
    border: "none",
    "border-radius": "var(--radius-md)",
    "font-size": "0.8125rem",
    "font-weight": "600",
    cursor: disabled ? "not-allowed" : "pointer"
  } as const;
}

export default AdminSettingsPage;
