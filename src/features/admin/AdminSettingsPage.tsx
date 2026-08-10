// src/features/admin/AdminSettingsPage.tsx
//
// CineLog V2 — Admin Settings Page
// ---------------------------------------------------------------------
// The single admin surface for site-wide, non-service, non-feature,
// non-communication settings.
//
//   KEYS ON THIS PAGE (3):
//     1. site_settings      — site name, tagline, contact, social links
//     2. rate_limits        — per-min / per-hour / per-day caps
//     3. retention_policy   — how long to keep soft-deleted rows, logs
//
// SOCIAL LINKS:
//   Dynamic — admin can add any number of social links with custom
//   name, URL, and uploaded SVG icon. No hardcoded platforms.
//   Data structure: SocialLink[] (see src/shared/types/index.ts)
//
// DATA FLOW:
//   • GET /api/admin/settings → { settings: { key: { value, updated_at } } }
//   • PUT /api/admin/settings with { settings: { key: newValue } }
//
// SVG ICON UPLOAD:
//   • Admin selects an SVG file
//   • Client-side sanitization strips <script>, event handlers, etc.
//   • Uploaded to Supabase Storage `social-icons` bucket
//   • Public URL stored in SocialLink.iconUrl
//   • Landing page footer renders the icon via <img> with object-contain

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
import { sanitizeSvg, isValidSvg } from "~/shared/utils/svgSanitize";
import type { SocialLink } from "~/shared/types";

// ─── Types ─────────────────────────────────────────────────────────

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

  // SVG upload state
  const [uploadingIcon, setUploadingIcon] = createSignal<string | null>(null); // id of link being uploaded

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

      // The API may return social_links in either the new array format
      // or the legacy { facebook, instagram, twitter, discord } format.
      // We normalize to the array format here.
      const rawSite = data.settings.site_settings.value as Record<string, unknown>;
      const r = data.settings.rate_limits.value as RateLimits;
      const ret = data.settings.retention_policy.value as RetentionPolicy;

      // Build a clean SiteSettings object with array social_links
      const s: SiteSettings = {
        site_name: typeof rawSite.site_name === "string" ? rawSite.site_name : "CineLog",
        tagline: typeof rawSite.tagline === "string" ? rawSite.tagline : "",
        contact_email: typeof rawSite.contact_email === "string" ? rawSite.contact_email : "",
        support_url: typeof rawSite.support_url === "string" ? rawSite.support_url : "",
        privacy_url: typeof rawSite.privacy_url === "string" ? rawSite.privacy_url : "",
        terms_url: typeof rawSite.terms_url === "string" ? rawSite.terms_url : "",
        social_links: Array.isArray(rawSite.social_links)
          ? (rawSite.social_links as SocialLink[])
          : migrateLegacySocialLinks(rawSite.social_links),
      };

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

  const updateLimit = (key: keyof RateLimits, val: number) => {
    setLimits({ ...(limits() as RateLimits), [key]: val });
  };

  const updateRetention = (key: keyof RetentionPolicy, val: number) => {
    setRetention({ ...(retention() as RetentionPolicy), [key]: val });
  };

  // ─── Social Links CRUD ────────────────────────────────────────

  /** Add a new empty social link */
  const addSocialLink = () => {
    const current = site() as SiteSettings;
    const newLink: SocialLink = {
      id: crypto.randomUUID(),
      name: "",
      url: "",
      iconUrl: "",
      enabled: true,
      order: current.social_links.length,
    };
    setSite({
      ...current,
      social_links: [...current.social_links, newLink],
    });
  };

  /** Update a single social link by id */
  const updateSocialLink = (id: string, patch: Partial<SocialLink>) => {
    const current = site() as SiteSettings;
    setSite({
      ...current,
      social_links: current.social_links.map((link) =>
        link.id === id ? { ...link, ...patch } : link
      ),
    });
  };

  /** Delete a social link by id */
  const deleteSocialLink = (id: string) => {
    const current = site() as SiteSettings;
    const updated = current.social_links
      .filter((link) => link.id !== id)
      .map((link, idx) => ({ ...link, order: idx })); // Re-index order
    setSite({
      ...current,
      social_links: updated,
    });
  };

  /** Move a social link up in order */
  const moveSocialLinkUp = (id: string) => {
    const current = site() as SiteSettings;
    const links = [...current.social_links];
    const idx = links.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    // Swap with previous
    [links[idx - 1], links[idx]] = [links[idx], links[idx - 1]];
    // Re-index order
    const reindexed = links.map((link, i) => ({ ...link, order: i }));
    setSite({ ...current, social_links: reindexed });
  };

  /** Move a social link down in order */
  const moveSocialLinkDown = (id: string) => {
    const current = site() as SiteSettings;
    const links = [...current.social_links];
    const idx = links.findIndex((l) => l.id === id);
    if (idx < 0 || idx >= links.length - 1) return;
    // Swap with next
    [links[idx], links[idx + 1]] = [links[idx + 1], links[idx]];
    // Re-index order
    const reindexed = links.map((link, i) => ({ ...link, order: i }));
    setSite({ ...current, social_links: reindexed });
  };

  /** Handle SVG file selection and upload */
  const handleIconUpload = async (linkId: string, file: File) => {
    // Validate file type
    if (!file.name.endsWith(".svg") && file.type !== "image/svg+xml") {
      toast.show("Only SVG files are allowed", "error");
      return;
    }

    // Read and sanitize the SVG
    const rawText = await file.text();
    const sanitized = sanitizeSvg(rawText);
    if (!sanitized) {
      toast.show("Invalid or unsafe SVG file", "error");
      return;
    }

    setUploadingIcon(linkId);

    try {
      // Upload to Supabase Storage via the admin API
      // We use a dedicated endpoint for social icon uploads
      const formData = new FormData();
      formData.append("svg", new Blob([sanitized], { type: "image/svg+xml" }), `${linkId}.svg`);
      formData.append("linkId", linkId);

      const resp = await fetch("/api/admin/social-icon-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        toast.show(body.error || "Upload failed", "error");
        return;
      }

      // Update the social link with the new iconUrl
      updateSocialLink(linkId, { iconUrl: body.iconUrl });
      toast.show("Icon uploaded", "success");
    } catch {
      toast.show("Upload failed", "error");
    } finally {
      setUploadingIcon(null);
    }
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

          {/* ─── Dynamic Social Links Manager ─────────────────── */}
          <div
            style={{
              "margin-top": "var(--sp-4)",
              "padding-top": "var(--sp-4)",
              "border-top": "1px solid var(--hairline)"
            }}
          >
            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "var(--sp-3)" }}>
              <label
                style={{
                  "font-size": "0.75rem",
                  "font-weight": "600",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.05em",
                  color: "var(--text-secondary)",
                }}
              >
                Social Links
              </label>
              <GlassButton
                variant="ghost"
                size="compact"
                onClick={addSocialLink}
                icon="add"
              >
                Add Link
              </GlassButton>
            </div>

            <p class="admin-config-field-hint" style={{ "margin-bottom": "var(--sp-3)" }}>
              Add custom social links with any name, URL, and SVG icon.
              These appear in the landing page footer. Drag to reorder.
            </p>

            <Show
              when={site()!.social_links.length > 0}
              fallback={
                <div style={{
                  padding: "var(--sp-4)",
                  "text-align": "center",
                  color: "var(--text-secondary)",
                  "font-size": "0.875rem",
                  background: "rgba(255,255,255,0.02)",
                  "border-radius": "var(--radius-lg)",
                  border: "1px dashed var(--hairline)",
                }}>
                  No social links configured. Click "Add Link" to create one.
                </div>
              }
            >
              <div class="social-links-list">
                <For each={site()!.social_links}>
                  {(link, idx) => (
                    <div class="social-link-item">
                      {/* Row header: icon preview + name + controls */}
                      <div class="social-link-item-header">
                        {/* Icon preview */}
                        <div class="social-link-icon-preview">
                          <Show
                            when={link.iconUrl}
                            fallback={
                              <span class="social-link-icon-placeholder">
                                {link.name ? link.name.charAt(0).toUpperCase() : "?"}
                              </span>
                            }
                          >
                            <img
                              src={link.iconUrl}
                              alt={link.name}
                              class="social-link-icon-img"
                            />
                          </Show>
                        </div>

                        {/* Name display */}
                        <span class="social-link-name">
                          {link.name || "Unnamed link"}
                        </span>

                        {/* Enabled badge */}
                        <span
                          class="social-link-enabled-badge"
                          classList={{
                            enabled: link.enabled,
                            disabled: !link.enabled,
                          }}
                        >
                          {link.enabled ? "On" : "Off"}
                        </span>

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Reorder buttons */}
                        <button
                          class="social-link-action-btn"
                          onClick={() => moveSocialLinkUp(link.id)}
                          disabled={idx() === 0}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          class="social-link-action-btn"
                          onClick={() => moveSocialLinkDown(link.id)}
                          disabled={idx() === site()!.social_links.length - 1}
                          title="Move down"
                        >
                          ▼
                        </button>

                        {/* Delete */}
                        <button
                          class="social-link-action-btn danger"
                          onClick={() => deleteSocialLink(link.id)}
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Expandable fields */}
                      <div class="social-link-item-fields">
                        <div class="admin-config-field-grid two-col">
                          <div class="admin-config-field">
                            <label>Name</label>
                            <input
                              type="text"
                              value={link.name}
                              placeholder="Instagram"
                              onInput={(e) => updateSocialLink(link.id, { name: e.currentTarget.value })}
                              maxlength={60}
                            />
                            <span class="admin-config-field-hint">
                              Display name for the link.
                            </span>
                          </div>
                          <div class="admin-config-field">
                            <label>URL</label>
                            <input
                              type="url"
                              value={link.url}
                              placeholder="https://instagram.com/cinelog"
                              onInput={(e) => updateSocialLink(link.id, { url: e.currentTarget.value })}
                            />
                            <span class="admin-config-field-hint">
                              Full URL opened when the icon is clicked.
                            </span>
                          </div>
                        </div>

                        <div class="admin-config-field-grid two-col" style={{ "margin-top": "var(--sp-2)" }}>
                          {/* SVG Icon Upload */}
                          <div class="admin-config-field">
                            <label>Icon (SVG)</label>
                            <div style={{ display: "flex", gap: "var(--sp-2)", "align-items": "center" }}>
                              <label class="social-link-upload-btn">
                                <Show
                                  when={uploadingIcon() === link.id}
                                  fallback={link.iconUrl ? "Replace" : "Upload SVG"}
                                >
                                  Uploading…
                                </Show>
                                <input
                                  type="file"
                                  accept=".svg,image/svg+xml"
                                  style={{ display: "none" }}
                                  disabled={uploadingIcon() === link.id}
                                  onChange={(e) => {
                                    const file = e.currentTarget.files?.[0];
                                    if (file) handleIconUpload(link.id, file);
                                  }}
                                />
                              </label>
                              <Show when={link.iconUrl}>
                                <button
                                  class="social-link-action-btn"
                                  onClick={() => updateSocialLink(link.id, { iconUrl: "" })}
                                  title="Remove icon"
                                >
                                  Remove
                                </button>
                              </Show>
                            </div>
                            <span class="admin-config-field-hint">
                              Upload a custom SVG icon. Sanitized for security.
                            </span>
                          </div>

                          {/* Enable/Disable toggle */}
                          <div class="admin-config-field">
                            <label>Visibility</label>
                            <label class="social-link-toggle">
                              <input
                                type="checkbox"
                                checked={link.enabled}
                                onChange={(e) => updateSocialLink(link.id, { enabled: e.currentTarget.checked })}
                              />
                              <span class="social-link-toggle-label">
                                {link.enabled ? "Visible on landing page" : "Hidden"}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
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

// ─── Legacy social links migration helper ─────────────────────────

function migrateLegacySocialLinks(legacy: unknown): SocialLink[] {
  if (!legacy || typeof legacy !== "object") return [];
  const obj = legacy as Record<string, unknown>;
  const result: SocialLink[] = [];
  const order: Array<{ key: string; name: string }> = [
    { key: "facebook", name: "Facebook" },
    { key: "instagram", name: "Instagram" },
    { key: "twitter", name: "Twitter" },
    { key: "discord", name: "Discord" },
  ];
  order.forEach(({ key, name }, idx) => {
    const val = typeof obj[key] === "string" ? (obj[key] as string) : "";
    if (val) {
      result.push({ id: key, name, url: val, iconUrl: "", enabled: true, order: idx });
    }
  });
  return result;
}

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
