// src/features/admin/AdminFeatureFlagsPage.tsx
//
// CineLog V2 — Admin Feature Flags Page (Phase 9 Chunk 6 rewrite)
// ---------------------------------------------------------------------
// Glass UI rewrite of the feature-flag toggle surface.
//
// ZERO-DUPLICATION: Feature flags live ONLY on this page. No other
// admin page edits the `feature_flags` key in app_config.
//
// USER-SIDE MAPPING (Strict): The flag list comes from
// src/core/feature-flags/defaults.ts → FEATURE_FLAG_METADATA — the
// single source of truth shared with the admin API. Each flag's
// `enforced_in` field documents exactly which user-side component
// consumes it. No dummy flags are rendered.
//
// ROLLOUT %: The backend stores flags as a plain Record<string,
// boolean> (see /api/admin/feature-flags PUT body schema). There is
// no per-flag rollout_percentage column in the DB or in the API
// contract. Per the Chunk 6 spec ("add a rollout % slider for each
// flag, OR just a clean toggle if not applicable"), we render a
// clean toggle — a slider with no backend persistence would be a
// dummy control, which the Zero-Duplication / Strict-Mapping rules
// forbid.
//
// FLAG HISTORY: For each flag we fetch the last 5 audit-log entries
// with action="feature_flag.toggle" and entity_id=<flag_name> from
// /api/admin/logs. The history is loaded lazily — the admin clicks
// "Show history" to expand the per-flag history panel.
//
// MOBILE-FIRST: Flag cards stack vertically on all breakpoints. The
// toggle switch is 48×28px (touch-target friendly). History items
// wrap gracefully on narrow screens.

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
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";
import {
  FEATURE_FLAG_METADATA,
  type FlagMeta
} from "~/core/feature-flags/defaults";

const FLAG_METADATA: readonly FlagMeta[] = FEATURE_FLAG_METADATA;

// ─── Audit log types ───────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  admin_username: string | null;
  admin_display_name: string | null;
}

interface LogsResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ─── Component ─────────────────────────────────────────────────────

const AdminFeatureFlagsPage: Component = () => {
  const [flags, setFlags] = createSignal<Record<string, boolean>>({});
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal<Record<string, boolean>>({});
  const [toast, setToast] = createSignal<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Per-flag history state
  const [histories, setHistories] = createSignal<
    Record<string, AuditLogEntry[]>
  >({});
  const [expandedFlags, setExpandedFlags] = createSignal<
    Record<string, boolean>
  >({});
  const [historyLoading, setHistoryLoading] = createSignal<
    Record<string, boolean>
  >({});

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2800);
  };

  const fetchFlags = async () => {
    try {
      const resp = await fetch("/api/admin/feature-flags", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { flags: Record<string, boolean> };
      setFlags(data.flags);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchFlags);

  // ─── Flag toggle (optimistic) ────────────────────────────────

  const toggleFlag = async (name: string, newValue: boolean) => {
    const oldValue = flags()[name];
    setFlags({ ...flags(), [name]: newValue });
    setSaving({ ...saving(), [name]: true });

    try {
      const resp = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: { [name]: newValue } })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        setFlags({ ...flags(), [name]: oldValue });
        showToast(body.error || "Failed to update flag", "error");
      } else {
        showToast(`'${name}' is now ${newValue ? "ON" : "OFF"}`, "success");
        if (body.flags) setFlags(body.flags);
        // Invalidate cached history for this flag so the next expand
        // re-fetches.
        setHistories({
          ...histories(),
          [name]: []
        });
      }
    } catch {
      setFlags({ ...flags(), [name]: oldValue });
      showToast("Network error", "error");
    } finally {
      setSaving({ ...saving(), [name]: false });
    }
  };

  const resetToDefaults = async () => {
    if (
      !confirm(
        "Reset ALL feature flags to their default values? This affects every user immediately."
      )
    )
      return;
    const defaults: Record<string, boolean> = {};
    for (const f of FLAG_METADATA) defaults[f.name] = f.default_value;
    setSaving(
      Object.fromEntries(FLAG_METADATA.map((f) => [f.name, true]))
    );
    try {
      const resp = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: defaults })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed to reset", "error");
      } else {
        setFlags(body.flags ?? defaults);
        showToast("All flags reset to defaults", "success");
        setHistories({});
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving({});
    }
  };

  // ─── Flag history (lazy load) ────────────────────────────────

  const fetchHistory = async (flagName: string) => {
    setHistoryLoading({ ...historyLoading(), [flagName]: true });
    try {
      const params = new URLSearchParams({
        action: "feature_flag.toggle",
        entity_type: "feature_flag",
        limit: "5"
      });
      const resp = await fetch(
        `/api/admin/logs?${params.toString()}`,
        { credentials: "include" }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as LogsResponse;
      // Filter to just this flag (entity_id === flagName)
      const filtered = data.logs.filter((l) => l.entity_id === flagName);
      setHistories({ ...histories(), [flagName]: filtered });
    } catch {
      setHistories({ ...histories(), [flagName]: [] });
    } finally {
      setHistoryLoading({ ...historyLoading(), [flagName]: false });
    }
  };

  const toggleHistory = (flagName: string) => {
    const isExpanded = expandedFlags()[flagName] === true;
    if (!isExpanded && histories()[flagName] === undefined) {
      fetchHistory(flagName);
    }
    setExpandedFlags({
      ...expandedFlags(),
      [flagName]: !isExpanded
    });
  };

  const modifiedCount = createMemo(() => {
    let count = 0;
    for (const f of FLAG_METADATA) {
      if ((flags()[f.name] ?? f.default_value) !== f.default_value) count++;
    }
    return count;
  });

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>Feature Flags</h2>
          <p>
            Toggle features on/off without redeploying. Changes take
            effect within 60 seconds for active users. Each flag maps
            to a real user-side consumer (no dummy toggles).
          </p>
        </div>
        <div class="admin-config-actions">
          <Show when={modifiedCount() > 0}>
            <GlassBadge
              intent="warning"
              label={`${modifiedCount()} modified`}
              size="compact"
            />
          </Show>
          <GlassButton
            variant="secondary"
            size="compact"
            onClick={resetToDefaults}
            disabled={loading()}
            icon="restart_alt"
          >
            Reset All
          </GlassButton>
        </div>
      </div>

      <Show when={error()}>
        <div class="admin-config-alert" role="alert">
          Failed to load flags: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
          <For each={Array.from({ length: 6 })}>
            {() => <GlassSkeleton variant="card" />}
          </For>
        </div>
      </Show>

      <Show when={!loading()}>
        <div class="admin-flag-list">
          <For each={FLAG_METADATA}>
            {(flag) => {
              const value = () => flags()[flag.name] ?? flag.default_value;
              const isSaving = () => saving()[flag.name] === true;
              const isExpanded = () => expandedFlags()[flag.name] === true;
              const flagHistory = () => histories()[flag.name] ?? [];
              const isHistoryLoading = () =>
                historyLoading()[flag.name] === true;

              return (
                <GlassCard class="admin-flag-card" padding="default">
                  <div class="admin-flag-row">
                    <div class="admin-flag-icon">{flag.icon}</div>
                    <div class="admin-flag-body">
                      <div class="admin-flag-name">
                        <h4>{flag.name}</h4>
                        <Show when={value() !== flag.default_value}>
                          <GlassBadge
                            intent="primary"
                            label="Modified"
                            size="compact"
                          />
                        </Show>
                        <Show when={isSaving()}>
                          <span
                            style={{
                              "font-size": "0.75rem",
                              color: "var(--text-muted)"
                            }}
                          >
                            Saving…
                          </span>
                        </Show>
                      </div>
                      <p class="admin-flag-desc">{flag.description}</p>
                      <p class="admin-flag-enforced">
                        Enforced in: <code>{flag.enforced_in}</code>
                      </p>
                    </div>
                    <button
                      class="admin-config-toggle"
                      role="switch"
                      aria-checked={value()}
                      aria-label={`Toggle ${flag.name}`}
                      disabled={isSaving()}
                      onClick={() => toggleFlag(flag.name, !value())}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  {/* History toggle + panel */}
                  <div class="admin-flag-history">
                    <button
                      class={`admin-flag-history-toggle ${isExpanded() ? "expanded" : ""}`}
                      onClick={() => toggleHistory(flag.name)}
                      aria-expanded={isExpanded()}
                    >
                      <span class="material-symbols-outlined">
                        chevron_right
                      </span>
                      {isExpanded() ? "Hide history" : "Show history"}
                    </button>

                    <Show when={isExpanded()}>
                      <div class="admin-flag-history-list">
                        <Show
                          when={isHistoryLoading()}
                          fallback={
                            <Show
                              when={flagHistory().length > 0}
                              fallback={
                                <div
                                  style={{
                                    "font-size": "0.75rem",
                                    color: "var(--text-muted)",
                                    padding: "var(--sp-1) var(--sp-2)",
                                    "font-style": "italic"
                                  }}
                                >
                                  No changes recorded for this flag.
                                </div>
                              }
                            >
                              <For each={flagHistory()}>
                                {(entry) => {
                                  const payload = entry.payload as {
                                    old?: boolean | null;
                                    new?: boolean;
                                  };
                                  return (
                                    <div class="admin-flag-history-item">
                                      <span
                                        class={`change-arrow ${
                                          payload.new
                                            ? "change-on"
                                            : "change-off"
                                        }`}
                                      >
                                        {payload.old === null ||
                                        payload.old === undefined
                                          ? "○"
                                          : payload.old
                                            ? "●"
                                            : "○"}
                                        →
                                        {payload.new ? "●" : "○"}
                                      </span>
                                      <span>
                                        {payload.old === true
                                          ? "ON"
                                          : payload.old === false
                                            ? "OFF"
                                            : "default"}
                                        {" → "}
                                        {payload.new ? "ON" : "OFF"}
                                      </span>
                                      <span class="history-meta">
                                        {entry.admin_display_name ??
                                          entry.admin_username ??
                                          "Unknown"}{" "}
                                        ·{" "}
                                        {new Date(
                                          entry.created_at
                                        ).toLocaleString()}
                                      </span>
                                    </div>
                                  );
                                }}
                              </For>
                            </Show>
                          }
                        >
                          <div
                            style={{
                              "font-size": "0.75rem",
                              color: "var(--text-muted)",
                              padding: "var(--sp-1) var(--sp-2)"
                            }}
                          >
                            Loading history…
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>

        <GlassCard
          class="admin-config-card"
          padding="default"
          style={{ "margin-top": "var(--sp-5)" }}
        >
          <p
            style={{
              "font-size": "0.8125rem",
              color: "var(--text-muted)",
              margin: 0,
              "line-height": "1.5"
            }}
          >
            <strong style={{ color: "var(--text-secondary)" }}>
              Note:
            </strong>{" "}
            Feature flag changes take effect within 60 seconds for active
            users (when their client re-fetches flags). New page loads
            reflect changes immediately. The flag registry is defined in{" "}
            <code>src/core/feature-flags/defaults.ts</code> — adding a new
            flag requires editing that file AND the migration seed.
          </p>
        </GlassCard>
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div class={`admin-config-toast ${t().type}`}>{t().text}</div>
        )}
      </Show>
    </div>
  );
};

export default AdminFeatureFlagsPage;
