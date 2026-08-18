// src/features/admin/AdminAiPage.tsx
//
// CineLog V2 — Admin AI Control Center (Phase 16 Chunk 1)
// ---------------------------------------------------------------------
// The SINGLE source of truth for the `ai_settings` row in app_config.
//
// WHY THIS PAGE EXISTS:
//   We are integrating Groq (LLM) to power AI features. Because the
//   app is in testing with only 2-3 users, we're using Groq's free
//   tier — which means we need a hard kill switch in case the free
//   quota runs out, the model misbehaves, or we just want to disable
//   AI for any reason without redeploying.
//
//   This page exposes THREE toggles:
//     1. Master AI Switch        — global kill. When off, NO AI feature
//                                  runs server-side. This is the
//                                  emergency stop.
//     2. User Recommendations     — gates the AI rail on the public
//                                  Discover page. When off, the rail
//                                  is hidden and /api/ai/status
//                                  reports userRecommendationsEnabled=false.
//     3. Admin Assistant          — gates the AI chat assistant inside
//                                  the admin panel (future Chunk 2).
//                                  This flag is NEVER exposed to the
//                                  public status route.
//
// ZERO-DUPLICATION: ai_settings lives ONLY on this page. The
// AdminSettingsPage does NOT render these toggles — they're managed
// here and read by /api/admin/settings (admin) + /api/ai/status
// (public subset) + checkAiSettings() (server-side).
//
// WIRED TO /api/admin/settings PUT:
//   The toggles call the EXISTING /api/admin/settings PUT route with
//   body `{ settings: { ai_settings: {...} } }`. The settings route's
//   validator (validateAiSettings) cleans + persists the value. No
//   new API endpoint was added — reuses the existing config pipeline,
//   including audit logging.
//
// OPTIMISTIC UI:
//   The toggle flips instantly on click. If the PUT fails, the toggle
//   reverts + a toast shows the error. This mirrors the Feature Flags
//   page pattern (admin/feature-flags).
//
// MASTER SWITCH INTERACTION:
//   When the admin turns the Master Switch OFF, the other two toggles
//   visually disable (greyed out, not clickable) but their stored
//   values are preserved. Turning the Master Switch back ON restores
//   interactivity without losing the per-feature state. We do NOT
//   auto-flip the sub-toggles to false — the master switch is checked
//   server-side as a conjunction, so a disabled master makes the
//   sub-toggles' values irrelevant while the master is off.
//
// MOBILE-FIRST:
//   Toggle cards stack vertically. The toggle switch is 48×28px
//   (touch-target friendly) using the shared `.admin-config-toggle`
//   CSS class.

import {
  createSignal,
  Show,
  For,
  onMount,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types ───────────────────────────────────────────────────────────

/** Shape of the ai_settings row in app_config. Mirrors the
 *  AiSettings interface in src/lib/server/groq.ts. Kept inline here
 *  (not imported) because importing from ~/lib/server/groq would
 *  pull the server-only module into the client bundle. */
interface AiSettings {
  masterEnabled: boolean;
  userRecommendationsEnabled: boolean;
  adminAssistantEnabled: boolean;
  defaultModel: string;
  enabledModels: string[];
  fallbackModel: string;
}

/** Models availability info from the server. */
interface ModelsAvailability {
  groqAvailable: string[];
  cilogEnabled: string[];
  defaultModel: string;
  fallbackModel: string;
  unavailableInGroq: string[];
}

/** Response shape from GET /api/admin/settings, narrowed to just the
 *  ai_settings key. The actual response contains all settings keys;
 *  we only read the one we care about. */
interface SettingsResponse {
  settings: {
    ai_settings?: {
      value: AiSettings;
      updated_at: string | null;
    };
  };
}

interface ToastState {
  text: string;
  type: "success" | "error";
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULTS: AiSettings = {
  masterEnabled: false,
  userRecommendationsEnabled: false,
  adminAssistantEnabled: false,
  defaultModel: "openai/gpt-oss-120b",
  enabledModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
  fallbackModel: "openai/gpt-oss-120b"
};

/** All known Groq models — shown as toggle options. */
const KNOWN_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b"
];

/** Friendly display names for models. */
const MODEL_LABELS: Record<string, string> = {
  "openai/gpt-oss-120b": "GPT-OSS 120B",
  "openai/gpt-oss-20b": "GPT-OSS 20B",
  "qwen/qwen3.6-27b": "Qwen 3.6 27B"
};

// ─── Component ──────────────────────────────────────────────────────

const AdminAiPage: Component = () => {
  const [settings, setSettings] = createSignal<AiSettings>({ ...DEFAULTS });
  const [updatedAt, setUpdatedAt] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  // Per-toggle saving state — disables just the toggle being saved
  // so the admin can't double-click and the UI shows feedback.
  const [saving, setSaving] = createSignal<Record<string, boolean>>({});
  const [toast, setToast] = createSignal<ToastState | null>(null);
  // Model availability info from the Groq API.
  const [availability, setAvailability] = createSignal<ModelsAvailability | null>(null);

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2800);
  };

  // ─── Fetch current settings ─────────────────────────────────────
  const fetchSettings = async () => {
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
      const ai = data.settings?.ai_settings?.value ?? DEFAULTS;
      setSettings({
        masterEnabled: !!ai.masterEnabled,
        userRecommendationsEnabled: !!ai.userRecommendationsEnabled,
        adminAssistantEnabled: !!ai.adminAssistantEnabled,
        defaultModel: typeof ai.defaultModel === "string" ? ai.defaultModel : DEFAULTS.defaultModel,
        enabledModels: Array.isArray(ai.enabledModels) ? ai.enabledModels : DEFAULTS.enabledModels,
        fallbackModel: typeof ai.fallbackModel === "string" ? ai.fallbackModel : DEFAULTS.fallbackModel
      });
      setUpdatedAt(data.settings?.ai_settings?.updated_at ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(async () => {
    await fetchSettings();
    // Fetch model availability (best-effort — non-blocking).
    try {
      const resp = await fetch("/api/admin/ai/models", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json() as ModelsAvailability;
        setAvailability(data);
      }
    } catch {
      // Best-effort — availability warnings just won't show.
    }
  });

  // ─── Persist a single flag change ───────────────────────────────
  //
  // Sends `{ settings: { ai_settings: { ...all three flags } } }` to
  // the existing /api/admin/settings PUT route. We always send ALL
  // three flags (not just the changed one) because the validator
  // replaces the whole JSONB value — sending a partial object would
  // wipe the unchanged flags to their (false) defaults.
  const persistSettings = async (
    newSettings: AiSettings,
    flagName: string
  ): Promise<boolean> => {
    setSaving({ ...saving(), [flagName]: true });
    try {
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ai_settings: newSettings }
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(
          body.error || `Failed to update (HTTP ${resp.status})`,
          "error"
        );
        return false;
      }
      // The settings route returns `{ ok, updated }` — no echo of the
      // value. We trust our local state on success.
      return true;
    } catch {
      showToast("Network error — change not saved", "error");
      return false;
    } finally {
      setSaving({ ...saving(), [flagName]: false });
    }
  };

  // ─── Toggle handlers ────────────────────────────────────────────
  //
  // Each handler:
  //   1. Builds the new settings object (immutable — never mutates
  //      the current signal value).
  //   2. Optimistically sets the local signal.
  //   3. Calls persistSettings. On failure, reverts to the previous
  //      value.
  //
  // The Master Switch handler is special: when turning it OFF, we
  // visually disable the sub-toggles (handled in render via Show),
  // but we do NOT change their stored values. The master switch is
  // checked as a conjunction server-side, so the sub-toggles'
  // values are simply irrelevant while the master is off.

  const toggleMaster = async () => {
    const prev = settings();
    const next: AiSettings = { ...prev, masterEnabled: !prev.masterEnabled };
    setSettings(next);
    const ok = await persistSettings(next, "masterEnabled");
    if (!ok) setSettings(prev);
    else
      showToast(
        `Master AI switch is now ${next.masterEnabled ? "ON" : "OFF"}`,
        "success"
      );
  };

  const toggleRecommendations = async () => {
    const prev = settings();
    // Guard: can't toggle sub-features when master is off.
    if (!prev.masterEnabled) {
      showToast("Turn on the Master AI Switch first", "error");
      return;
    }
    const next: AiSettings = {
      ...prev,
      userRecommendationsEnabled: !prev.userRecommendationsEnabled
    };
    setSettings(next);
    const ok = await persistSettings(next, "userRecommendationsEnabled");
    if (!ok) setSettings(prev);
    else
      showToast(
        `User Recommendations are now ${
          next.userRecommendationsEnabled ? "ON" : "OFF"
        }`,
        "success"
      );
  };

  const toggleAdminAssistant = async () => {
    const prev = settings();
    if (!prev.masterEnabled) {
      showToast("Turn on the Master AI Switch first", "error");
      return;
    }
    const next: AiSettings = {
      ...prev,
      adminAssistantEnabled: !prev.adminAssistantEnabled
    };
    setSettings(next);
    const ok = await persistSettings(next, "adminAssistantEnabled");
    if (!ok) setSettings(prev);
    else
      showToast(
        `Admin Assistant is now ${
          next.adminAssistantEnabled ? "ON" : "OFF"
        }`,
        "success"
      );
  };

  // ─── Model configuration handlers ─────────────────────────────

  const changeDefaultModel = async (model: string) => {
    const prev = settings();
    if (!prev.enabledModels.includes(model)) {
      showToast("Enable the model first before setting it as default", "error");
      return;
    }
    // Prevent setting an unavailable model as default.
    const groq = availability()?.groqAvailable;
    if (groq && groq.length > 0 && !groq.includes(model)) {
      showToast(`Cannot set ${MODEL_LABELS[model] ?? model} as default — it is not available in the Groq project`, "error");
      return;
    }
    const next: AiSettings = { ...prev, defaultModel: model };
    setSettings(next);
    setSaving({ ...saving(), modelConfig: true });
    const ok = await persistSettings(next, "modelConfig");
    if (!ok) setSettings(prev);
    else showToast(`Default model set to ${MODEL_LABELS[model] ?? model}`, "success");
    setSaving({ ...saving(), modelConfig: false });
  };

  const changeFallbackModel = async (model: string) => {
    const prev = settings();
    if (!prev.enabledModels.includes(model)) {
      showToast("Enable the model first before setting it as fallback", "error");
      return;
    }
    const next: AiSettings = { ...prev, fallbackModel: model };
    setSettings(next);
    setSaving({ ...saving(), modelConfig: true });
    const ok = await persistSettings(next, "modelConfig");
    if (!ok) setSettings(prev);
    else showToast(`Fallback model set to ${MODEL_LABELS[model] ?? model}`, "success");
    setSaving({ ...saving(), modelConfig: false });
  };

  const toggleModel = async (model: string) => {
    const prev = settings();
    const isEnabled = prev.enabledModels.includes(model);

    // Prevent disabling the last enabled model.
    if (isEnabled && prev.enabledModels.length <= 1) {
      showToast("At least one model must be enabled", "error");
      return;
    }

    // Prevent disabling the default or fallback model.
    if (isEnabled && (model === prev.defaultModel || model === prev.fallbackModel)) {
      showToast(`Cannot disable the ${model === prev.defaultModel ? "default" : "fallback"} model. Change it first.`, "error");
      return;
    }

    const newEnabled = isEnabled
      ? prev.enabledModels.filter((m) => m !== model)
      : [...prev.enabledModels, model];

    const next: AiSettings = { ...prev, enabledModels: newEnabled };
    setSettings(next);
    setSaving({ ...saving(), modelConfig: true });
    const ok = await persistSettings(next, "modelConfig");
    if (!ok) setSettings(prev);
    else
      showToast(
        `${MODEL_LABELS[model] ?? model} ${isEnabled ? "disabled" : "enabled"}`,
        "success"
      );
    setSaving({ ...saving(), modelConfig: false });
  };

  // ─── Render ─────────────────────────────────────────────────────

  const masterOn = () => settings().masterEnabled;
  // Sub-toggles are interactive only when master is on AND not currently
  // saving. We don't disable them when their own save is in flight —
  // we just disable the specific one being saved.
  const subDisabled = (flagKey: string) =>
    !masterOn() || saving()[flagKey] === true;

  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>AI Control Center</h2>
          <p>
            Toggle AI features on/off instantly — no redeploy required.
            Powered by Groq (free tier). The Master Switch is the
            global emergency stop; sub-toggles are only respected when
            the Master Switch is ON. Changes propagate to active users
            within ~60 seconds.
          </p>
        </div>
        <Show when={updatedAt()}>
          {(ts) => (
            <GlassBadge
              intent="default"
              label={`Updated ${new Date(ts()).toLocaleString()}`}
              size="compact"
            />
          )}
        </Show>
      </div>

      <Show when={error()}>
        <div class="admin-config-alert" role="alert">
          Failed to load AI settings: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-3)"
          }}
        >
          <For3 />
        </div>
      </Show>

      <Show when={!loading()}>
        {/* ─── Master Switch ──────────────────────────────────── */}
        <GlassCard class="admin-config-card" padding="default">
          <div class="admin-flag-row">
            <div class="admin-flag-icon">
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "1.5rem",
                  color: masterOn()
                    ? "var(--accent, #00d9a3)"
                    : "var(--text-muted)"
                }}
                aria-hidden="true"
              >
                bolt
              </span>
            </div>
            <div class="admin-flag-body">
              <div class="admin-flag-name">
                <h4>Master AI Switch</h4>
                <Show when={masterOn()}>
                  <GlassBadge intent="success" label="ON" size="compact" />
                </Show>
                <Show when={!masterOn()}>
                  <GlassBadge intent="default" label="OFF" size="compact" />
                </Show>
                <Show when={saving().masterEnabled}>
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
              <p class="admin-flag-desc">
                The global kill switch. When OFF, <strong>all</strong> AI
                features are disabled server-side — no Groq API calls are
                made, regardless of the sub-toggles below. Use this as
                the emergency stop.
              </p>
              <p class="admin-flag-enforced">
                Enforced in:{" "}
                <code>src/lib/server/groq.ts → isAiFeatureEnabled()</code>
              </p>
            </div>
            <button
              class="admin-config-toggle"
              role="switch"
              aria-checked={masterOn()}
              aria-label="Toggle Master AI Switch"
              disabled={saving().masterEnabled}
              onClick={toggleMaster}
            >
              <span class="toggle-knob" />
            </button>
          </div>
        </GlassCard>

        {/* ─── User Recommendations ─────────────────────────── */}
        <GlassCard
          class="admin-config-card"
          padding="default"
          style={{ opacity: masterOn() ? "1" : "0.55" }}
        >
          <div class="admin-flag-row">
            <div class="admin-flag-icon">
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "1.5rem",
                  color: settings().userRecommendationsEnabled
                    ? "var(--accent, #00d9a3)"
                    : "var(--text-muted)"
                }}
                aria-hidden="true"
              >
                recommendations
              </span>
            </div>
            <div class="admin-flag-body">
              <div class="admin-flag-name">
                <h4>User Recommendations</h4>
                <Show when={settings().userRecommendationsEnabled}>
                  <GlassBadge intent="success" label="ON" size="compact" />
                </Show>
                <Show when={!settings().userRecommendationsEnabled}>
                  <GlassBadge intent="default" label="OFF" size="compact" />
                </Show>
                <Show when={saving().userRecommendationsEnabled}>
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
              <p class="admin-flag-desc">
                Gates the AI recommendations rail on the public Discover
                page. When ON, the Discover page may render AI-powered
                suggestions. When OFF, the rail is hidden and the
                <code>/api/ai/status</code> route reports
                <code>userRecommendationsEnabled=false</code> so the
                client short-circuits.
              </p>
              <p class="admin-flag-enforced">
                Enforced in:{" "}
                <code>/api/ai/status</code> +{" "}
                <code>src/features/discover/*</code>
              </p>
            </div>
            <button
              class="admin-config-toggle"
              role="switch"
              aria-checked={settings().userRecommendationsEnabled}
              aria-label="Toggle User Recommendations"
              disabled={subDisabled("userRecommendationsEnabled")}
              onClick={toggleRecommendations}
            >
              <span class="toggle-knob" />
            </button>
          </div>
          <Show when={!masterOn()}>
            <p
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)",
                margin: "var(--sp-2) 0 0 0",
                "font-style": "italic"
              }}
            >
              Disabled because the Master AI Switch is OFF.
            </p>
          </Show>
        </GlassCard>

        {/* ─── Admin Assistant ───────────────────────────────── */}
        <GlassCard
          class="admin-config-card"
          padding="default"
          style={{ opacity: masterOn() ? "1" : "0.55" }}
        >
          <div class="admin-flag-row">
            <div class="admin-flag-icon">
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "1.5rem",
                  color: settings().adminAssistantEnabled
                    ? "var(--accent, #00d9a3)"
                    : "var(--text-muted)"
                }}
                aria-hidden="true"
              >
                smart_toy
              </span>
            </div>
            <div class="admin-flag-body">
              <div class="admin-flag-name">
                <h4>Admin Assistant</h4>
                <Show when={settings().adminAssistantEnabled}>
                  <GlassBadge intent="success" label="ON" size="compact" />
                </Show>
                <Show when={!settings().adminAssistantEnabled}>
                  <GlassBadge intent="default" label="OFF" size="compact" />
                </Show>
                <Show when={saving().adminAssistantEnabled}>
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
              <p class="admin-flag-desc">
                Gates the AI chat assistant inside this admin panel
                (coming in Chunk 2). This flag is{" "}
                <strong>never</strong> exposed to the public{" "}
                <code>/api/ai/status</code> route — it is read
                server-side only via <code>checkAiSettings()</code>.
              </p>
              <p class="admin-flag-enforced">
                Enforced in:{" "}
                <code>src/lib/server/groq.ts → checkAiSettings()</code>
              </p>
            </div>
            <button
              class="admin-config-toggle"
              role="switch"
              aria-checked={settings().adminAssistantEnabled}
              aria-label="Toggle Admin Assistant"
              disabled={subDisabled("adminAssistantEnabled")}
              onClick={toggleAdminAssistant}
            >
              <span class="toggle-knob" />
            </button>
          </div>
          <Show when={!masterOn()}>
            <p
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)",
                margin: "var(--sp-2) 0 0 0",
                "font-style": "italic"
              }}
            >
              Disabled because the Master AI Switch is OFF.
            </p>
          </Show>
        </GlassCard>

        {/* ─── AI Model Configuration ─────────────────────────── */}
        <GlassCard
          class="admin-config-card"
          padding="default"
          style={{ opacity: masterOn() ? "1" : "0.55" }}
        >
          <div class="admin-flag-row">
            <div class="admin-flag-icon">
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "1.5rem",
                  color: masterOn()
                    ? "var(--accent, #00d9a3)"
                    : "var(--text-muted)"
                }}
                aria-hidden="true"
              >
                tune
              </span>
            </div>
            <div class="admin-flag-body">
              <div class="admin-flag-name">
                <h4>AI Model Configuration</h4>
                <Show when={saving().modelConfig}>
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
              <p class="admin-flag-desc">
                Configure which Groq models CineLog can use and set
                the default model for AI features.
              </p>
            </div>
          </div>

          {/* Availability warnings */}
          <Show when={availability()?.unavailableInGroq?.length ?? 0 > 0}>
            <div
              role="alert"
              style={{
                margin: "var(--sp-3) 0 0 0",
                padding: "var(--sp-3)",
                "border-radius": "var(--radius-md)",
                border: "1px solid #f59e0b",
                background: "rgba(245, 158, 11, 0.08)",
                "font-size": "0.8125rem",
                color: "#f59e0b",
                "line-height": "1.5"
              }}
            >
              <strong>⚠️ Model availability issue:</strong> The following
              model(s) are enabled in CineLog but not available in your
              Groq project: {availability()!.unavailableInGroq.join(", ")}.
              They will be skipped automatically. Update your Groq project
              settings or disable them below.
            </div>
          </Show>
          <Show when={
            availability() &&
            !availability()!.groqAvailable.includes(settings().defaultModel) &&
            availability()!.groqAvailable.length > 0
          }>
            <div
              role="alert"
              style={{
                margin: "var(--sp-3) 0 0 0",
                padding: "var(--sp-3)",
                "border-radius": "var(--radius-md)",
                border: "1px solid #ef4444",
                background: "rgba(239, 68, 68, 0.08)",
                "font-size": "0.8125rem",
                color: "#ef4444",
                "line-height": "1.5"
              }}
            >
              <strong>⚠️ Default model unavailable:</strong> {settings().defaultModel} is
              not available in the Groq project. Select another available model as default.
            </div>
          </Show>

          {/* Default Model selector */}
          <div
            style={{
              margin: "var(--sp-4) 0 0 0",
              display: "flex",
              "flex-direction": "column",
              gap: "var(--sp-3)"
            }}
          >
            <div>
              <label
                style={{
                  "font-size": "0.8125rem",
                  "font-weight": "600",
                  color: "var(--text-secondary)",
                  "margin-bottom": "var(--sp-1)",
                  display: "block"
                }}
              >
                Default Model
              </label>
              <select
                class="admin-model-select"
                disabled={!masterOn() || saving().modelConfig}
                value={settings().defaultModel}
                onChange={(e) => changeDefaultModel(e.currentTarget.value)}
                style={{
                  width: "100%",
                  padding: "var(--sp-2) var(--sp-3)",
                  "border-radius": "var(--radius-md)",
                  border: "1px solid var(--hairline)",
                  background: "var(--glass-bg)",
                  color: "var(--text)",
                  "font-size": "0.875rem"
                }}
              >
                <For each={settings().enabledModels}>
                  {(m) => (
                    <option value={m}>
                      {MODEL_LABELS[m] ?? m}
                    </option>
                  )}
                </For>
              </select>
              <p
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-muted)",
                  margin: "var(--sp-1) 0 0 0"
                }}
              >
                Used by User Recommendations and as the default for
                Admin Assistant. Must be an enabled model.
              </p>
            </div>

            {/* Fallback Model selector */}
            <div>
              <label
                style={{
                  "font-size": "0.8125rem",
                  "font-weight": "600",
                  color: "var(--text-secondary)",
                  "margin-bottom": "var(--sp-1)",
                  display: "block"
                }}
              >
                Fallback Model
              </label>
              <select
                class="admin-model-select"
                disabled={!masterOn() || saving().modelConfig}
                value={settings().fallbackModel}
                onChange={(e) => changeFallbackModel(e.currentTarget.value)}
                style={{
                  width: "100%",
                  padding: "var(--sp-2) var(--sp-3)",
                  "border-radius": "var(--radius-md)",
                  border: "1px solid var(--hairline)",
                  background: "var(--glass-bg)",
                  color: "var(--text)",
                  "font-size": "0.875rem"
                }}
              >
                <For each={settings().enabledModels}>
                  {(m) => (
                    <option value={m}>
                      {MODEL_LABELS[m] ?? m}
                    </option>
                  )}
                </For>
              </select>
              <p
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-muted)",
                  margin: "var(--sp-1) 0 0 0"
                }}
              >
                Used when the default model fails or is unavailable.
              </p>
            </div>

            {/* Enabled Models toggles */}
            <div>
              <label
                style={{
                  "font-size": "0.8125rem",
                  "font-weight": "600",
                  color: "var(--text-secondary)",
                  "margin-bottom": "var(--sp-2)",
                  display: "block"
                }}
              >
                Enabled Models
              </label>
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--sp-2)"
                }}
              >
                <For each={KNOWN_MODELS}>
                  {(m) => {
                    const isEnabled = () =>
                      settings().enabledModels.includes(m);
                    const isAvailableInGroq = () => {
                      const groq = availability()?.groqAvailable;
                      // If we couldn't fetch, assume available.
                      if (!groq || groq.length === 0) return true;
                      return groq.includes(m);
                    };
                    return (
                      <div
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "space-between",
                          padding: "var(--sp-2) var(--sp-3)",
                          border: `1px solid ${isAvailableInGroq() ? "var(--hairline)" : "#f59e0b"}`,
                          "border-radius": "var(--radius-md)",
                          background: isEnabled()
                            ? "rgba(0, 217, 163, 0.05)"
                            : "var(--glass-bg)"
                        }}
                      >
                        <div>
                          <span
                            style={{
                              "font-size": "0.875rem",
                              "font-weight": "500",
                              color: isAvailableInGroq() ? "var(--text)" : "#f59e0b"
                            }}
                          >
                            {MODEL_LABELS[m] ?? m}
                          </span>
                          <Show when={!isAvailableInGroq()}>
                            <GlassBadge
                              intent="warning"
                              label="UNAVAILABLE"
                              size="compact"
                              style={{ "margin-left": "var(--sp-2)" }}
                            />
                          </Show>
                          <Show when={m === settings().defaultModel}>
                            <GlassBadge
                              intent="success"
                              label="DEFAULT"
                              size="compact"
                              style={{ "margin-left": "var(--sp-2)" }}
                            />
                          </Show>
                          <Show when={m === settings().fallbackModel && m !== settings().defaultModel}>
                            <GlassBadge
                              intent="default"
                              label="FALLBACK"
                              size="compact"
                              style={{ "margin-left": "var(--sp-2)" }}
                            />
                          </Show>
                        </div>
                        <button
                          class="admin-config-toggle"
                          role="switch"
                          aria-checked={isEnabled()}
                          aria-label={`Toggle ${MODEL_LABELS[m] ?? m}`}
                          disabled={!masterOn() || saving().modelConfig}
                          onClick={() => toggleModel(m)}
                        >
                          <span class="toggle-knob" />
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
              <p
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-muted)",
                  margin: "var(--sp-2) 0 0 0"
                }}
              >
                Disable models you don't want CineLog to use, even if
                Groq allows them. The default and fallback models must
                be enabled.
              </p>
            </div>
          </div>

          <Show when={!masterOn()}>
            <p
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)",
                margin: "var(--sp-3) 0 0 0",
                "font-style": "italic"
              }}
            >
              Disabled because the Master AI Switch is OFF.
            </p>
          </Show>
        </GlassCard>

        {/* ─── Info card ─────────────────────────────────────── */}
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
              How this works:
            </strong>{" "}
            All three flags are stored in the <code>app_config</code>{" "}
            table under the <code>ai_settings</code> key (JSONB). They
            are read by server-side AI routes via{" "}
            <code>checkAiSettings()</code> before any Groq API call is
            made. The public <code>/api/ai/status</code> route exposes
            only the master + recommendations flags (never the
            admin-assistant flag) so the Discover page can decide
            whether to render its AI rail. The Groq API key
            (<code>GROQ_API_KEY</code>) is server-only and never
            reaches the browser bundle.
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

// Small helper component — renders 3 skeleton cards while loading.
// Inlined (not exported) because it's only used here.
const For3: Component = () => {
  return (
    <>
      <GlassSkeleton variant="card" />
      <GlassSkeleton variant="card" />
      <GlassSkeleton variant="card" />
    </>
  );
};

export default AdminAiPage;
