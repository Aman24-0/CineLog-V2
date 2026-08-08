// src/features/admin/AdminSettingsPage.tsx
//
// CineLog V2 — Admin Settings Page (Phase 9 Chunk 6 rewrite)
// ---------------------------------------------------------------------
// The single admin surface for site-wide, non-service, non-feature,
// non-communication settings. Phase 9 Chunk 6 enforces the
// zero-duplication rule:
//
//   KEYS ON THIS PAGE (3):
//     1. site_settings      — site name, tagline, contact, social links
//     2. rate_limits        — per-min / per-hour / per-day caps
//     3. retention_policy   — how long to keep soft-deleted rows, logs
//
//   KEYS REMOVED FROM THIS PAGE (Phase 9 Chunk 6):
//     • maintenance_window — MOVED to /admin/maintenance. The maintenance
//       page now owns the scheduling UI (start/end date + message) for
//       the same backing key. Editing it on both pages would drift.
//     • tmdb_settings       — on /admin/services/tmdb (Chunk 2).
//     • notification_settings — on /admin/communication (Chunk 4).
//     • feature_flags       — on /admin/feature-flags (separate page).
//
// USER-SIDE MAPPING (Strict — every field maps to a real consumer):
//   • site_settings.site_name → header logo text, <title>, email templates
//   • site_settings.tagline → footer + meta description
//   • site_settings.contact_email → "Contact us" links in footer + emails
//   • site_settings.{support,privacy,terms}_url → footer links
//   • site_settings.social_links → footer social icons
//   • rate_limits.api_per_min → API rate-limit middleware
//   • rate_limits.auth_attempts_per_hr → auth throttle
//   • rate_limits.upload_mb_per_day → upload limiter
//   • retention_policy.* → default days cutoff for maintenance purge ops
//
// DATA FLOW:
//   • GET /api/admin/settings → { settings: { key: { value, updated_at } } }
//   • PUT /api/admin/settings with { settings: { key: newValue } }
//
// MOBILE-FIRST: Single-column on phone; two-column field grids on
// tablet+ (540px breakpoint). Each section is a GlassCard with a
// clear heading.

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types ─────────────────────────────────────────────────────────

interface SiteSettings {
  site_name: string;
  tagline: string;
  contact_email: string;
  support_url: string;
  privacy_url: string;
  terms_url: string;
  social_links: {
    facebook: string;
    instagram: string;
    twitter: string;
    discord: string;
  };
}

interface RateLimits {
  api_per_min: number;
  auth_attempts_per_hr: number;
  upload_mb_per_day: number;
}

interface RetentionPolicy {
  soft_deleted_profiles_days: number;
  activity_log_days: number;
  tmdb_cache_days: number;
  admin_actions_days: number;
}

type SettingsKey = "site_settings" | "rate_limits" | "retention_policy";

interface SettingsResponse {
  settings: Record<
    SettingsKey,
    { value: unknown; updated_at: string | null }
  >;
}

// ─── Component ─────────────────────────────────────────────────────

const AdminSettingsPage: Component = () => {
  const [site, setSite] = createSignal<SiteSettings | null>(null);
  const [limits, setLimits] = createSignal<RateLimits | null>(null);
  const [retention, setRetention] = createSignal<RetentionPolicy | null>(
    null
  );
  const [updatedAt, setUpdatedAt] = createSignal<Record<string, string | null>>(
    {}
  );
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const toast = signalToast();

  // Track original values to detect dirty state
  const [origSite, setOrigSite] = createSignal<string>("");
  const [origLimits, setOrigLimits] = createSignal<string>("");
  const [origRetention, setOrigRetention] = createSignal<string>("");

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
      const data = (await resp.json()) as SettingsResponse;

      const s = data.settings.site_settings.value as SiteSettings;
      const r = data.settings.rate_limits.value as RateLimits;
      const ret = data.settings.retention_policy.value as RetentionPolicy;

      setSite(s);
      setLimits(r);
      setRetention(ret);
      setUpdatedAt({
        site_settings: data.settings.site_settings.updated_at,
        rate_limits: data.settings.rate_limits.updated_at,
        retention_policy: data.settings.retention_policy.updated_at
      });
      setOrigSite(JSON.stringify(s));
      setOrigLimits(JSON.stringify(r));
      setOrigRetention(JSON.stringify(ret));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchSettings);

  const isDirty = createMemo(() => {
    if (!site() || !limits() || !retention()) return false;
    return (
      JSON.stringify(site()) !== origSite() ||
      JSON.stringify(limits()) !== origLimits() ||
      JSON.stringify(retention()) !== origRetention()
    );
  });

  const save = async () => {
    if (!site() || !limits() || !retention()) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    if (JSON.stringify(site()) !== origSite())
      updates.site_settings = site();
    if (JSON.stringify(limits()) !== origLimits())
      updates.rate_limits = limits();
    if (JSON.stringify(retention()) !== origRetention())
      updates.retention_policy = retention();

    try {
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: updates })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        toast.show(body.error || "Failed to save", "error");
      } else {
        // Re-fetch to get server-validated values + updated_at
        await fetchSettings();
        toast.show("Settings saved", "success");
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!isDirty()) return;
    if (!confirm("Discard unsaved changes?")) return;
    fetchSettings();
  };

  const formatUpdated = (key: string) => {
    const ts = updatedAt()[key];
    if (!ts) return "Never";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  // ─── Field updaters ──────────────────────────────────────────

  const updateSite = (patch: Partial<SiteSettings>) => {
    setSite({ ...(site() as SiteSettings), ...patch });
  };

  const updateSocial = (key: keyof SiteSettings["social_links"], val: string) => {
    const current = site() as SiteSettings;
    setSite({
      ...current,
      social_links: { ...current.social_links, [key]: val }
    });
  };

  const updateLimit = (key: keyof RateLimits, val: number) => {
    setLimits({ ...(limits() as RateLimits), [key]: val });
  };

  const updateRetention = (key: keyof RetentionPolicy, val: number) => {
    setRetention({ ...(retention() as RetentionPolicy), [key]: val });
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>App Settings</h2>
          <p>
            Site-wide configuration for branding, rate limits, and data
            retention. Service-specific settings live on the Services Hub;
            maintenance scheduling lives on the Maintenance page.
          </p>
        </div>
        <div class="admin-config-actions">
          <GlassButton
            variant="secondary"
            size="compact"
            onClick={reset}
            disabled={!isDirty() || saving() || loading()}
          >
            Reset
          </GlassButton>
          <GlassButton
            variant="primary"
            size="compact"
            onClick={save}
            disabled={!isDirty() || saving() || loading()}
            loading={saving()}
            icon="save"
          >
            {saving() ? "Saving…" : "Save Changes"}
          </GlassButton>
        </div>
      </div>

      <Show when={error()}>
        <div class="admin-config-alert" role="alert">
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
          <For each={Array.from({ length: 3 })}>
            {() => <GlassSkeleton variant="card" />}
          </For>
        </div>
      </Show>

      <Show when={!loading() && site() && limits() && retention()}>
        {/* ─── Site Settings ─────────────────────────────────── */}
        <GlassCard class="admin-config-card" padding="comfortable">
          <div class="admin-config-card-header">
            <h3>Site Identity</h3>
            <GlassBadge
              intent="default"
              label={`Updated ${formatUpdated("site_settings")}`}
              size="compact"
            />
          </div>
          <p class="admin-config-card-desc">
            Branding shown in the header, footer, and email templates.
            Maps to <code>site_settings</code> in app_config.
          </p>

          <div class="admin-config-field-grid two-col">
            <div class="admin-config-field">
              <label>Site Name</label>
              <input
                type="text"
                value={site()!.site_name}
                onInput={(e) => updateSite({ site_name: e.currentTarget.value })}
                maxlength={60}
              />
              <span class="admin-config-field-hint">
                Shown in the header logo and email subject lines.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Tagline</label>
              <input
                type="text"
                value={site()!.tagline}
                onInput={(e) => updateSite({ tagline: e.currentTarget.value })}
                maxlength={120}
              />
              <span class="admin-config-field-hint">
                Shown in the footer and meta description.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Contact Email</label>
              <input
                type="email"
                value={site()!.contact_email}
                onInput={(e) =>
                  updateSite({ contact_email: e.currentTarget.value })
                }
                maxlength={120}
              />
              <span class="admin-config-field-hint">
                "Contact us" links in footer and emails.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Support URL</label>
              <input
                type="url"
                value={site()!.support_url}
                placeholder="https://help.cinelog.app"
                onInput={(e) =>
                  updateSite({ support_url: e.currentTarget.value })
                }
              />
            </div>
            <div class="admin-config-field">
              <label>Privacy URL</label>
              <input
                type="url"
                value={site()!.privacy_url}
                placeholder="https://cinelog.app/privacy"
                onInput={(e) =>
                  updateSite({ privacy_url: e.currentTarget.value })
                }
              />
            </div>
            <div class="admin-config-field">
              <label>Terms URL</label>
              <input
                type="url"
                value={site()!.terms_url}
                placeholder="https://cinelog.app/terms"
                onInput={(e) => updateSite({ terms_url: e.currentTarget.value })}
              />
            </div>
          </div>

          <div
            style={{
              "margin-top": "var(--sp-4)",
              "padding-top": "var(--sp-4)",
              "border-top": "1px solid var(--hairline)"
            }}
          >
            <label
              style={{
                display: "block",
                "font-size": "0.75rem",
                "font-weight": "600",
                "text-transform": "uppercase",
                "letter-spacing": "0.05em",
                color: "var(--text-secondary)",
                "margin-bottom": "var(--sp-3)"
              }}
            >
              Social Links
            </label>
            <div class="admin-config-field-grid two-col">
              <div class="admin-config-field">
                <label>Facebook</label>
                <input
                  type="url"
                  value={site()!.social_links.facebook}
                  placeholder="https://facebook.com/cinelog"
                  onInput={(e) => updateSocial("facebook", e.currentTarget.value)}
                />
              </div>
              <div class="admin-config-field">
                <label>Instagram</label>
                <input
                  type="url"
                  value={site()!.social_links.instagram}
                  placeholder="https://instagram.com/cinelog"
                  onInput={(e) =>
                    updateSocial("instagram", e.currentTarget.value)
                  }
                />
              </div>
              <div class="admin-config-field">
                <label>Twitter / X</label>
                <input
                  type="url"
                  value={site()!.social_links.twitter}
                  placeholder="https://x.com/cinelog"
                  onInput={(e) => updateSocial("twitter", e.currentTarget.value)}
                />
              </div>
              <div class="admin-config-field">
                <label>Discord</label>
                <input
                  type="url"
                  value={site()!.social_links.discord}
                  placeholder="https://discord.gg/cinelog"
                  onInput={(e) => updateSocial("discord", e.currentTarget.value)}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* ─── Rate Limits ───────────────────────────────────── */}
        <GlassCard class="admin-config-card" padding="comfortable">
          <div class="admin-config-card-header">
            <h3>Rate Limits</h3>
            <GlassBadge
              intent="default"
              label={`Updated ${formatUpdated("rate_limits")}`}
              size="compact"
            />
          </div>
          <p class="admin-config-card-desc">
            API and auth throttling enforced by the server middleware.
            Maps to <code>rate_limits</code> in app_config.
          </p>

          <div class="admin-config-field-grid two-col">
            <div class="admin-config-field">
              <label>API requests / min</label>
              <input
                type="number"
                min={5}
                max={600}
                value={limits()!.api_per_min}
                onInput={(e) =>
                  updateLimit("api_per_min", Number(e.currentTarget.value))
                }
              />
              <span class="admin-config-field-hint">
                Per-user cap on API calls. Range: 5–600.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Auth attempts / hr</label>
              <input
                type="number"
                min={3}
                max={100}
                value={limits()!.auth_attempts_per_hr}
                onInput={(e) =>
                  updateLimit(
                    "auth_attempts_per_hr",
                    Number(e.currentTarget.value)
                  )
                }
              />
              <span class="admin-config-field-hint">
                Login/signup attempts before throttle. Range: 3–100.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Upload MB / day</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={limits()!.upload_mb_per_day}
                onInput={(e) =>
                  updateLimit("upload_mb_per_day", Number(e.currentTarget.value))
                }
              />
              <span class="admin-config-field-hint">
                Avatar/banner upload cap. Range: 1–1000 MB.
              </span>
            </div>
          </div>
        </GlassCard>

        {/* ─── Retention Policy ──────────────────────────────── */}
        <GlassCard class="admin-config-card" padding="comfortable">
          <div class="admin-config-card-header">
            <h3>Retention Policy</h3>
            <GlassBadge
              intent="default"
              label={`Updated ${formatUpdated("retention_policy")}`}
              size="compact"
            />
          </div>
          <p class="admin-config-card-desc">
            Default day cutoffs for maintenance purge operations. These
            values pre-fill the "days" inputs on the Maintenance page.
            Maps to <code>retention_policy</code> in app_config.
          </p>

          <div class="admin-config-field-grid two-col">
            <div class="admin-config-field">
              <label>Soft-deleted profiles (days)</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={retention()!.soft_deleted_profiles_days}
                onInput={(e) =>
                  updateRetention(
                    "soft_deleted_profiles_days",
                    Number(e.currentTarget.value)
                  )
                }
              />
              <span class="admin-config-field-hint">
                Profiles soft-deleted longer than this get purged.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Activity log (days)</label>
              <input
                type="number"
                min={7}
                max={3650}
                value={retention()!.activity_log_days}
                onInput={(e) =>
                  updateRetention(
                    "activity_log_days",
                    Number(e.currentTarget.value)
                  )
                }
              />
              <span class="admin-config-field-hint">
                Activity feed entries older than this get pruned.
              </span>
            </div>
            <div class="admin-config-field">
              <label>TMDB cache (days)</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={retention()!.tmdb_cache_days}
                onInput={(e) =>
                  updateRetention(
                    "tmdb_cache_days",
                    Number(e.currentTarget.value)
                  )
                }
              />
              <span class="admin-config-field-hint">
                Cached TMDB responses older than this get purged.
              </span>
            </div>
            <div class="admin-config-field">
              <label>Admin actions (days)</label>
              <input
                type="number"
                min={30}
                max={36500}
                value={retention()!.admin_actions_days}
                onInput={(e) =>
                  updateRetention(
                    "admin_actions_days",
                    Number(e.currentTarget.value)
                  )
                }
              />
              <span class="admin-config-field-hint">
                Audit log entries older than this get cleaned up.
              </span>
            </div>
          </div>
        </GlassCard>

        {/* ─── Save bar ──────────────────────────────────────── */}
        <div class="admin-settings-save-bar">
          <Show
            when={isDirty()}
            fallback={
              <span class="clean-indicator">No unsaved changes</span>
            }
          >
            <span class="dirty-indicator">● Unsaved changes</span>
          </Show>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <GlassButton
              variant="ghost"
              size="compact"
              onClick={reset}
              disabled={!isDirty() || saving()}
            >
              Discard
            </GlassButton>
            <GlassButton
              variant="primary"
              size="compact"
              onClick={save}
              disabled={!isDirty() || saving()}
              loading={saving()}
              icon="save"
            >
              {saving() ? "Saving…" : "Save All"}
            </GlassButton>
          </div>
        </div>
      </Show>

      {/* ─── Toast ──────────────────────────────────────────────── */}
      <Show when={toast.msg()}>
        {(m) => (
          <div class={`admin-config-toast ${m().type}`}>{m().text}</div>
        )}
      </Show>
    </div>
  );
};

// ─── Toast helper ──────────────────────────────────────────────────

function signalToast() {
  const [msg, setMsg] = createSignal<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (text: string, type: "success" | "error") => {
    setMsg({ text, type });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setMsg(null), 2800);
  };
  return { msg, show };
}

export default AdminSettingsPage;
