// src/features/admin/services/WebPushServicePage.tsx
//
// CineLog V2 — Web Push Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for Web Push operational status:
//   • Status (live probe from /api/admin/services/status — checks
//      VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY env vars + the
//      app_config.vapid_public_key row)
//   • VAPID key status (env vars + app_config row)
//   • Active subscriptions count (count of push_subscriptions rows)
//   • Expired subscriptions cleanup button — calls
//      POST /api/admin/services/web-push/cleanup-expired which deletes
//      rows where expires_at < now OR (expires_at IS NULL AND
//      created_at < now - 90d).
//
// WHAT THIS PAGE IS NOT:
//   • It does NOT let the admin set VAPID keys. Those are Vercel env
//      vars. The admin rotates them via the Vercel dashboard, then
//      updates app_config.vapid_public_key via a SQL query (the env
//      key is server-only; the app_config row is what the browser
//      fetches during subscribe()).
//   • It does NOT duplicate the per-category push toggles on the
//      user-side settings page.
//
// RESPONSIVE: stacks to 1 column on mobile; the cleanup button spans
// full width on small screens.

import {
  createSignal,
  Show,
  onMount,
  For,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import ServicePageHeader from "./ServicePageHeader";
import ServiceKeyStatus from "./ServiceKeyStatus";

// ─── Types ───────────────────────────────────────────────────────

interface PushStatusResponse {
  ok: boolean;
  vapidConfigured: boolean;
  vapidConfigError: string | null;
  vapidPublicKeyEnvVar: { present: boolean; length: number; preview: string };
  vapidPrivateKeyEnvVar: { present: boolean; length: number };
  appConfigVapidKey: {
    present: boolean;
    length: number;
    preview: string;
    matchesEnv: boolean | null;
    error: string | null;
  };
  pushSubscriptionsCount: number | null;
  pushSubscriptionsError: string | null;
}

interface CleanupResponse {
  ok: boolean;
  deleted?: number;
  error?: string;
}

// ─── Component ───────────────────────────────────────────────────

const WebPushServicePage: Component = () => {
  const [status, setStatus] = createSignal<PushStatusResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [cleanupLoading, setCleanupLoading] = createSignal(false);
  const [cleanupResult, setCleanupResult] = createSignal<{
    deleted: number;
    at: Date;
  } | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const fetchStatus = async () => {
    try {
      const resp = await fetch("/api/push/status");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as PushStatusResponse;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load push status");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchStatus);

  const runCleanup = async () => {
    if (
      !confirm(
        "Delete all expired push subscriptions?\n\n" +
          "This removes rows where expires_at < now OR " +
          "expires_at IS NULL AND created_at < (now - 90d).\n\n" +
          "Users with expired subscriptions will need to re-subscribe " +
          "via Settings → Notifications."
      )
    ) {
      return;
    }
    setCleanupLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        "/api/admin/services/web-push/cleanup-expired",
        {
          method: "POST",
          credentials: "include"
        }
      );
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = (await resp.json()) as CleanupResponse;
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      setCleanupResult({ deleted: data.deleted ?? 0, at: new Date() });
      // Re-fetch status to refresh the active subscriptions count
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleanupLoading(false);
    }
  };

  // ─── Derived display values ───────────────────────────────────
  const vapidEnvOk = () => {
    const s = status();
    return !!s && s.vapidPublicKeyEnvVar.present && s.vapidPrivateKeyEnvVar.present;
  };
  const appConfigOk = () => {
    const s = status();
    return !!s && s.appConfigVapidKey.present;
  };
  const activeSubs = () => status()?.pushSubscriptionsCount ?? null;

  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="notifications"
        name="Web Push"
        description="Browser push notifications. VAPID keys sign the push payload; subscriptions are stored in push_subscriptions. Health probe verifies env vars + app_config row."
        actions={
          <GlassButton
            variant="glass"
            size="compact"
            icon="cleaning_services"
            onClick={runCleanup}
            loading={cleanupLoading()}
            disabled={cleanupLoading()}
            aria-label="Clean up expired subscriptions"
          >
            <span class="hidden sm:inline">Clean up expired</span>
            <span class="sm:hidden">Cleanup</span>
          </GlassButton>
        }
      />

      <Show when={error()}>
        <div
          role="alert"
          class="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          <span class="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          {error()}
        </div>
      </Show>

      <Show when={cleanupResult()}>
        {(r) => (
          <div
            role="status"
            class="flex items-center gap-2 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
          >
            <span class="material-symbols-outlined text-base" aria-hidden="true">
              check_circle
            </span>
            Deleted {r().deleted} expired subscription
            {r().deleted === 1 ? "" : "s"}.
            <span class="ml-auto text-[11px] text-success/70">
              {r().at.toLocaleTimeString()}
            </span>
          </div>
        )}
      </Show>

      {/* ─── Headline stats ─────────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Subscriptions
        </h2>
        <Show when={loading() && !status()}>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={Array.from({ length: 4 })}>
              {() => <GlassStatCard value="" label="Loading" loading />}
            </For>
          </div>
        </Show>
        <Show when={!loading() || status()}>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GlassStatCard
              value={activeSubs() !== null ? activeSubs()!.toLocaleString() : "—"}
              label="Active subscriptions"
              icon="notifications_active"
              variant="glass"
            />
            <GlassStatCard
              value={vapidEnvOk() ? "Set" : "Missing"}
              label="VAPID env vars"
              icon="key"
              variant="glass"
            />
            <GlassStatCard
              value={appConfigOk() ? "Set" : "Missing"}
              label="app_config row"
              icon="database"
              variant="glass"
            />
            <GlassStatCard
              value={status()?.vapidConfigured ? "Valid" : "Invalid"}
              label="Key pair validity"
              icon="verified_key"
              variant="glass"
            />
          </div>
        </Show>
      </section>

      {/* ─── VAPID key detail ───────────────────────────────────── */}
      <GlassCard padding="comfortable">
        <div class="mb-4 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            vpn_key
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            VAPID key status
          </h3>
        </div>

        <Show when={status()}>
          {(s) => (
            <div class="flex flex-col gap-4">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ServiceKeyStatus
                  present={s().vapidPublicKeyEnvVar.present}
                  label="VAPID_PUBLIC_KEY"
                  hint={
                    s().vapidPublicKeyEnvVar.present
                      ? `Preview: ${s().vapidPublicKeyEnvVar.preview} (${s().vapidPublicKeyEnvVar.length} chars)`
                      : "Set in Vercel env vars + redeploy"
                  }
                />
                <ServiceKeyStatus
                  present={s().vapidPrivateKeyEnvVar.present}
                  label="VAPID_PRIVATE_KEY"
                  hint={
                    s().vapidPrivateKeyEnvVar.present
                      ? `Present (${s().vapidPrivateKeyEnvVar.length} chars)`
                      : "Set in Vercel env vars + redeploy"
                  }
                />
                <ServiceKeyStatus
                  present={s().appConfigVapidKey.present}
                  label="app_config.vapid_public_key"
                  hint={
                    s().appConfigVapidKey.present
                      ? `Preview: ${s().appConfigVapidKey.preview}`
                      : s().appConfigVapidKey.error ?? "Row not found in app_config"
                  }
                />
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-text-secondary">Env ↔ DB match</span>
                    <Show
                      when={s().appConfigVapidKey.matchesEnv === true}
                      fallback={
                        <Show
                          when={s().appConfigVapidKey.matchesEnv === false}
                          fallback={
                            <GlassBadge intent="default" icon="help" label="N/A" size="compact" glass />
                          }
                        >
                          <GlassBadge intent="danger" icon="close" label="Mismatch" size="compact" />
                        </Show>
                      }
                    >
                      <GlassBadge intent="success" icon="check" label="Match" size="compact" />
                    </Show>
                  </div>
                  <span class="font-mono text-[11px] text-text-soft">
                    Browser uses app_config value to subscribe
                  </span>
                </div>
              </div>

              <Show when={s().vapidConfigError}>
                <div class="rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
                  <strong>Config error:</strong> {s().vapidConfigError}
                </div>
              </Show>

              <Show when={s().pushSubscriptionsError}>
                <div class="rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
                  <strong>Subscriptions count error:</strong>{" "}
                  {s().pushSubscriptionsError}
                </div>
              </Show>
            </div>
          )}
        </Show>

        <Show when={!status() && !loading()}>
          <div class="px-3 py-4 text-center text-xs text-text-muted">
            Failed to load VAPID status.
          </div>
        </Show>

        <p class="mt-4 max-w-3xl text-xs text-text-soft">
          The browser fetches the public key from{" "}
          <code class="font-mono">app_config.vapid_public_key</code>{" "}
          during subscribe(); the server uses the env vars to sign the
          push payload. All three values must be set + match for push
          to work end-to-end.
        </p>
      </GlassCard>

      {/* ─── Cleanup info ───────────────────────────────────────── */}
      <GlassCard padding="default">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            cleaning_services
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Expired subscriptions cleanup
          </h3>
        </div>
        <p class="m-0 text-sm text-text-secondary">
          Click <strong>Clean up expired</strong> in the header to
          remove dead push subscriptions. A row is considered expired
          if:
        </p>
        <ul class="m-0 mt-2 flex flex-col gap-1 text-xs text-text-muted">
          <li>
            <code class="font-mono">expires_at</code> is set AND in the
            past (Firefox/Mozilla set this — usually 24h)
          </li>
          <li>
            <code class="font-mono">expires_at</code> is NULL AND{" "}
            <code class="font-mono">created_at</code> is older than 90
            days (Chrome never sets an expiry — we use 90d as a stale
            cutoff)
          </li>
        </ul>
        <p class="m-0 mt-3 text-xs text-text-soft">
          Affected users will see "Push notifications are not
          configured" until they re-subscribe via Settings →
          Notifications. The cleanup is audit-logged.
        </p>
      </GlassCard>
    </div>
  );
};

export default WebPushServicePage;
