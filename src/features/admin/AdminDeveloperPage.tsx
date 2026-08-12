// src/features/admin/AdminDeveloperPage.tsx
//
// CineLog V2 — Admin Developer Tools Page
// ---------------------------------------------------------------------
// Moved here from /settings/about so developer tools live behind
// admin auth instead of being visible to regular users.
//
// SECTIONS:
//   1. Environment Variables — display key env vars (secrets redacted).
//   2. Feature Flags — quick links to the existing /admin/feature-flags page.
//   3. Diagnostics — app version, build info, basic stats.
//   4. API Cache Management — quick link to /admin/tmdb-cache.
//   5. Admin Logs — quick link to /admin/logs.

import {
  createSignal,
  onMount,
  Show,
  For,
  type Component
} from "solid-js";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";

interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

interface DiagnosticInfo {
  appVersion: string;
  userAgent: string;
  platform: string;
  language: string;
  online: boolean;
  viewport: string;
  pixelRatio: string;
  localStorageSize: string;
}

function redact(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••••••" + value.slice(-4);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getLocalStorageSize(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      total += key.length + value.length;
    }
    // Characters → bytes (rough; most are 1 byte in UTF-8 for ASCII keys).
    return total * 2;
  } catch {
    return 0;
  }
}

const AdminDeveloperPage: Component = () => {
  const [envVars, setEnvVars] = createSignal<EnvVar[]>([]);
  const [diagnostics, setDiagnostics] = createSignal<DiagnosticInfo | null>(
    null
  );
  const [showSecrets, setShowSecrets] = createSignal(false);

  onMount(() => {
    // Read env vars from import.meta.env (Vite exposes VITE_* vars
    // to the client; server-only vars are NOT accessible here).
    const env = import.meta.env;
    const vars: EnvVar[] = [
      {
        key: "VITE_SUPABASE_URL",
        value: env.VITE_SUPABASE_URL ?? "",
        isSecret: false
      },
      {
        key: "VITE_SUPABASE_ANON_KEY",
        value: env.VITE_SUPABASE_ANON_KEY ?? "",
        isSecret: true
      },
      {
        key: "VITE_TMDB_API_KEY",
        value: env.VITE_TMDB_API_KEY ?? "",
        isSecret: true
      },
      {
        key: "VITE_APP_VERSION",
        value: env.VITE_APP_VERSION ?? "",
        isSecret: false
      }
    ];
    setEnvVars(vars);

    // Collect diagnostic info from the browser.
    setDiagnostics({
      appVersion: env.VITE_APP_VERSION ?? "unknown",
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      pixelRatio: `${window.devicePixelRatio}x`,
      localStorageSize: formatBytes(getLocalStorageSize())
    });
  });

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => { /* success — no production log needed */ },
      (err) => console.warn("[dev] clipboard failed:", err)
    );
  }

  return (
    <div class="admin-developer">
      <header class="admin-developer-header">
        <h1>Developer Tools</h1>
        <p class="admin-developer-subtitle">
          Environment, diagnostics, and cache management. Secrets are
          redacted by default.
        </p>
      </header>

      {/* Environment Variables */}
      <section class="admin-developer-section">
        <div class="admin-developer-section-header">
          <h2>Environment Variables</h2>
          <GlassButton
            variant="ghost"
            size="compact"
            icon={showSecrets() ? "visibility_off" : "visibility"}
            onClick={() => setShowSecrets(!showSecrets())}
            aria-label={showSecrets() ? "Hide secret values" : "Show secret values"}
          >
            {showSecrets() ? "Hide secrets" : "Show secrets"}
          </GlassButton>
        </div>
        <div class="admin-developer-env-list">
          <For each={envVars()}>
            {(v) => (
              <div class="admin-developer-env-row">
                <span class="admin-developer-env-key">{v.key}</span>
                <span class="admin-developer-env-value">
                  {v.isSecret && !showSecrets() ? redact(v.value) : v.value || "(not set)"}
                </span>
                <GlassButton
                  variant="ghost"
                  size="compact"
                  icon="content_copy"
                  onClick={() => copyToClipboard(v.value)}
                  aria-label={`Copy ${v.key} value to clipboard`}
                />
              </div>
            )}
          </For>
        </div>
      </section>

      {/* Diagnostics */}
      <section class="admin-developer-section">
        <h2>Diagnostics</h2>
        <Show when={diagnostics()} fallback={<GlassLoadingState size="small" message="Loading diagnostics…" />}>
          {(d) => (
            <div class="admin-developer-diag-grid">
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">App Version</span>
                <span class="admin-developer-diag-value">{d().appVersion}</span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">Platform</span>
                <span class="admin-developer-diag-value">{d().platform}</span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">Language</span>
                <span class="admin-developer-diag-value">{d().language}</span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">Online</span>
                <span class="admin-developer-diag-value">
                  {d().online ? "Yes" : "No"}
                </span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">Viewport</span>
                <span class="admin-developer-diag-value">{d().viewport}</span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">Pixel Ratio</span>
                <span class="admin-developer-diag-value">{d().pixelRatio}</span>
              </div>
              <div class="admin-developer-diag-row">
                <span class="admin-developer-diag-label">localStorage Size</span>
                <span class="admin-developer-diag-value">{d().localStorageSize}</span>
              </div>
              <div class="admin-developer-diag-row admin-developer-diag-row-wide">
                <span class="admin-developer-diag-label">User Agent</span>
                <span class="admin-developer-diag-value admin-developer-diag-mono">
                  {d().userAgent}
                </span>
              </div>
            </div>
          )}
        </Show>
      </section>

      {/* Quick Links */}
      <section class="admin-developer-section">
        <h2>Cache & Logs</h2>
        <div class="admin-developer-links">
          <a
            href="/admin/tmdb-cache"
            class="admin-developer-link focus-ring"
            aria-label="TMDB Cache — View and invalidate cached TMDB responses"
          >
            <span class="material-symbols-outlined" aria-hidden="true">storage</span>
            <div>
              <span class="admin-developer-link-title">TMDB Cache</span>
              <span class="admin-developer-link-desc">
                View and invalidate cached TMDB responses
              </span>
            </div>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </a>
          <a
            href="/admin/feature-flags"
            class="admin-developer-link focus-ring"
            aria-label="Feature Flags — Enable or disable app features per user or globally"
          >
            <span class="material-symbols-outlined" aria-hidden="true">flag</span>
            <div>
              <span class="admin-developer-link-title">Feature Flags</span>
              <span class="admin-developer-link-desc">
                Enable or disable app features per user or globally
              </span>
            </div>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </a>
          <a
            href="/admin/logs"
            class="admin-developer-link focus-ring"
            aria-label="Admin Audit Logs — View admin actions and system events"
          >
            <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
            <div>
              <span class="admin-developer-link-title">Admin Audit Logs</span>
              <span class="admin-developer-link-desc">
                View admin actions and system events
              </span>
            </div>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </a>
          <a
            href="/admin/maintenance"
            class="admin-developer-link focus-ring"
            aria-label="Maintenance — Run maintenance tasks and view system health"
          >
            <span class="material-symbols-outlined" aria-hidden="true">build</span>
            <div>
              <span class="admin-developer-link-title">Maintenance</span>
              <span class="admin-developer-link-desc">
                Run maintenance tasks and view system health
              </span>
            </div>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </a>
        </div>
      </section>
    </div>
  );
};

export default AdminDeveloperPage;
