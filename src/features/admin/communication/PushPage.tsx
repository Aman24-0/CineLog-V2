// src/features/admin/communication/PushPage.tsx
//
// CineLog V2 — Admin Communication Hub: Web Push (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// Communication-side Web Push management. This is the COMPLEMENT to
// /admin/services/web-push — that page is for SERVICE HEALTH (VAPID
// env var status, cleanup expired subs), THIS page is for SENDING
// and DELIVERY TRACKING (test push, per-day delivery chart).
//
// WHAT THIS PAGE HAS (that the Services Hub page does not):
//   • Send Test Push UI — send a real Web Push notification to your
//     own admin devices. Reuses /api/push/send (which enforces
//     callerUid === userId — the admin can only test on themselves,
//     never on another user).
//   • Delivery rate chart — last-7-day success/fail counts from the
//     push_delivery_log table (Phase 9 Chunk 4 schema). If the table
//     is empty we surface an empty state instead of fake data.
//   • Active subscriptions summary — count of push_subscriptions
//     rows, sourced from /api/push/status.
//   • VAPID key status — quick summary (present/missing), with a
//     link to /admin/services/web-push for the full diagnostic.
//
// WHAT THIS PAGE DOES NOT HAVE (kept on the Services Hub page to
// enforce zero duplication):
//   • VAPID key rotation / cleanup of expired subscriptions.
//   • Per-IP rate-limit diagnostics.
//   • Detailed env-var preview (first 8 / last 8 chars).
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — VAPID env var config + expired-sub cleanup
//     live ONLY on /admin/services/web-push. This page only shows
//     summary status + a deep-link to that page.
//   • Strict user-side mapping — the test push is sent to the admin
//     via the SAME /api/push/send endpoint users would use. No
//     "admin-only" send path that bypasses the user-side security
//     checks (callerUid === userId).
//   • No OMDB.
//
// RESPONSIVE: stats grid stacks to 1 col on mobile; chart card
// spans full width; Send Test Push form is single-column.

import {
  createSignal,
  Show,
  For,
  onMount,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { BarChartV, type BarVItem } from "~/features/stats/components/SvgChart";

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

interface DailyDeliveryPoint {
  date: string; // ISO yyyy-mm-dd
  sent: number;
  failed: number;
}

interface DeliveryResponse {
  ok: boolean;
  days?: DailyDeliveryPoint[];
  error?: string;
}

interface SendTestResponse {
  sent?: number;
  failed?: number;
  error?: string;
  mock?: boolean;
}

// ─── Component ───────────────────────────────────────────────────

const PushPage: Component = () => {
  const [status, setStatus] = createSignal<PushStatusResponse | null>(null);
  const [days, setDays] = createSignal<DailyDeliveryPoint[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Send Test Push form state
  const [testTitle, setTestTitle] = createSignal("CineLog test push");
  const [testBody, setTestBody] = createSignal(
    "If you can read this, push is working."
  );
  const [testUrl, setTestUrl] = createSignal("/");
  const [sending, setSending] = createSignal(false);
  const [sendResult, setSendResult] = createSignal<{
    ok: boolean;
    sent?: number;
    failed?: number;
    mock?: boolean;
    error?: string;
    message?: string;
  } | null>(null);

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

  // Fetch last-7-day delivery stats. The endpoint returns 200 with
  // an empty `days` array when no data has been logged yet — that's
  // a valid state, not an error.
  const fetchDelivery = async () => {
    try {
      const resp = await fetch("/api/admin/communication/push/delivery", {
        credentials: "include"
      });
      if (resp.status === 404) {
        // Endpoint not deployed yet — surface as empty state.
        setDays([]);
        return;
      }
      if (!resp.ok) return;
      const data = (await resp.json()) as DeliveryResponse;
      setDays(data.days ?? []);
    } catch {
      // Non-fatal.
    }
  };

  onMount(() => {
    void fetchStatus();
    void fetchDelivery();
  });

  // Build chart items from the delivery data. Each bar shows total
  // sent (primary) and failed (secondary) per day.
  const chartItems = (): BarVItem[] => {
    return days().map((d) => {
      const date = new Date(d.date);
      return {
        label: date.toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric"
        }),
        value: d.sent,
        secondary: d.failed,
        tooltipLabel: date.toLocaleDateString(),
        tooltipRows: [
          { name: "Sent", value: String(d.sent) },
          { name: "Failed", value: String(d.failed) }
        ]
      };
    });
  };

  // Aggregate stats for the headline cards.
  const totalSent = () => days().reduce((s, d) => s + d.sent, 0);
  const totalFailed = () => days().reduce((s, d) => s + d.failed, 0);
  const deliveryRate = () => {
    const total = totalSent() + totalFailed();
    if (total === 0) return null;
    return Math.round((totalSent() / total) * 100);
  };

  // Send a test push to the admin's own devices. Uses the dedicated
  // admin endpoint /api/admin/communication/push/test which:
  //   1. Authenticates via the admin cookie (not the user session).
  //   2. Derives the admin's profile id from the admin token.
  //   3. Sends to all of the admin's own push_subscriptions.
  //   4. BYPASSES the admin's notifPrefs (the admin is explicitly
  //      testing the channel — preferences shouldn't block a test).
  const sendTest = async () => {
    if (!testTitle().trim()) {
      setSendResult({ ok: false, error: "Title is required" });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const resp = await fetch("/api/admin/communication/push/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: testTitle().trim(),
          body: testBody().trim() || undefined,
          url: testUrl().trim() || undefined
        })
      });
      const data = (await resp.json().catch(() => ({}))) as SendTestResponse & {
        message?: string;
      };
      if (!resp.ok || data.error) {
        setSendResult({
          ok: false,
          error: data.error ?? `HTTP ${resp.status}`
        });
        return;
      }
      setSendResult({
        ok: true,
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        mock: data.mock
      });
    } catch (err) {
      setSendResult({
        ok: false,
        error: err instanceof Error ? err.message : "Network error"
      });
    } finally {
      setSending(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div class="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header>
        <h1 class="m-0 text-2xl font-bold text-text-strong">Web Push</h1>
        <p class="mt-1 text-sm text-text-muted">
          Send test notifications to your devices, and review delivery
          performance over the last 7 days. VAPID key rotation and
          subscription cleanup live on the{" "}
          <a
            href="/admin/services/web-push"
            class="text-primary underline hover:no-underline"
          >
            Web Push service page
          </a>
          .
        </p>
      </header>

      {/* ─── Headline stats ─────────────────────────────────── */}
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Web Push statistics"
      >
        <GlassStatCard
          value={status()?.pushSubscriptionsCount ?? "—"}
          label="Active subscriptions"
          icon="notifications_active"
          variant="accent"
          size="compact"
        />
        <GlassStatCard
          value={totalSent()}
          label="Sent (7d)"
          icon="send"
          variant="glass"
          size="compact"
          trend={totalSent() > 0 ? "up" : "neutral"}
        />
        <GlassStatCard
          value={totalFailed()}
          label="Failed (7d)"
          icon="error"
          variant="glass"
          size="compact"
          trend={totalFailed() > 0 ? "down" : "neutral"}
        />
        <GlassStatCard
          value={deliveryRate() === null ? "—" : `${deliveryRate()}%`}
          label="Delivery rate (7d)"
          icon="trending_up"
          variant="glass"
          size="compact"
          trend={
            deliveryRate() === null
              ? "neutral"
              : deliveryRate()! >= 90
                ? "up"
                : "down"
          }
        />
      </section>

      {/* ─── Error ──────────────────────────────────────────── */}
      <Show when={error()}>
        <GlassCard
          variant="glass"
          size="compact"
          class="border-danger/30 bg-danger-bg text-danger"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined" aria-hidden="true">
              error
            </span>
            {error()}
          </div>
        </GlassCard>
      </Show>

      {/* ─── VAPID status summary ───────────────────────────── */}
      <Show when={status()}>
        {(s) => (
          <GlassCard variant="glass" size="default">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-3">
                <span
                  class="material-symbols-outlined text-2xl"
                  classList={{
                    "text-success": s().vapidConfigured,
                    "text-danger": !s().vapidConfigured
                  }}
                  aria-hidden="true"
                >
                  {s().vapidConfigured ? "verified" : "gpp_bad"}
                </span>
                <div>
                  <div class="font-semibold text-text-strong">
                    VAPID keys{" "}
                    <GlassBadge
                      intent={s().vapidConfigured ? "success" : "danger"}
                      size="compact"
                    >
                      {s().vapidConfigured ? "Configured" : "Missing"}
                    </GlassBadge>
                  </div>
                  <div class="text-xs text-text-muted">
                    {s().vapidConfigured
                      ? "Public + private env vars are set."
                      : s().vapidConfigError ??
                        "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not found."}
                  </div>
                </div>
              </div>
              <GlassButton
                variant="glass"
                size="compact"
                icon="arrow_forward"
                onClick={() => {
                  window.location.href = "/admin/services/web-push";
                }}
              >
                Service details
              </GlassButton>
            </div>
          </GlassCard>
        )}
      </Show>

      {/* ─── Delivery chart ─────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Delivery — last 7 days
        </h2>
        <GlassCard variant="glass" size="comfortable">
          <Show
            when={chartItems().length > 0}
            fallback={
              <GlassEmptyState
                icon="bar_chart"
                title="No delivery data yet"
                message="Once push notifications start sending, daily success/failure counts will appear here."
                variant="compact"
              />
            }
          >
            <BarChartV
              items={chartItems()}
              split
              height={240}
              color="var(--p)"
              yTickFormat={(v) => String(v)}
            />
            <div class="mt-3 flex items-center gap-4 text-xs text-text-muted">
              <span class="flex items-center gap-1.5">
                <span
                  class="inline-block h-2 w-2 rounded-full"
                  style={{ background: "var(--p)" }}
                  aria-hidden="true"
                />
                Sent
              </span>
              <span class="flex items-center gap-1.5">
                <span
                  class="inline-block h-2 w-2 rounded-full"
                  style={{ background: "var(--danger)" }}
                  aria-hidden="true"
                />
                Failed
              </span>
            </div>
          </Show>
        </GlassCard>
      </section>

      {/* ─── Send Test Push ─────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Send Test Push
        </h2>
        <GlassCard variant="glass" size="comfortable">
          <div class="flex flex-col gap-4">
            <p class="m-0 text-sm text-text-muted">
              Sends a real Web Push notification to{" "}
              <strong class="text-text">your own admin devices</strong>. You
              must have at least one active subscription (subscribe via
              Settings → Notifications).
            </p>
            <GlassInput
              label="Title"
              value={testTitle()}
              onInput={(e) => setTestTitle(e.currentTarget.value)}
              placeholder="CineLog test push"
            />
            <GlassInput
              label="Body"
              value={testBody()}
              onInput={(e) => setTestBody(e.currentTarget.value)}
              placeholder="Message body…"
            />
            <GlassInput
              label="Click-through URL"
              value={testUrl()}
              onInput={(e) => setTestUrl(e.currentTarget.value)}
              placeholder="/"
            />
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <GlassButton
                variant="primary"
                size="default"
                icon={sending() ? "progress_activity" : "send"}
                onClick={() => void sendTest()}
                disabled={sending() || !status()?.vapidConfigured}
                loading={sending()}
              >
                {sending() ? "Sending…" : "Send to my devices"}
              </GlassButton>
              <Show when={!status()?.vapidConfigured}>
                <span class="text-xs text-danger">
                  VAPID keys not configured — sending is disabled.
                </span>
              </Show>
            </div>

            {/* Send result */}
            <Show when={sendResult()}>
              {(r) => (
                <div
                  class="rounded-md border p-3 text-sm"
                  classList={{
                    "border-success/30 bg-success-bg text-success": r().ok,
                    "border-danger/30 bg-danger-bg text-danger": !r().ok
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <Show
                    when={r().ok}
                    fallback={
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined" aria-hidden="true">
                          error
                        </span>
                        {r().error}
                      </div>
                    }
                  >
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center gap-2 font-semibold">
                        <span class="material-symbols-outlined" aria-hidden="true">
                          check_circle
                        </span>
                        Push sent
                      </div>
                      <div class="text-xs opacity-90">
                        Delivered: {r().sent} • Failed: {r().failed}
                        <Show when={r().mock}> (mock mode — no API key)</Show>
                      </div>
                      <Show when={r().sent === 0}>
                        <div class="text-xs opacity-90">
                          No devices received the push. Make sure you have an
                          active subscription (Settings → Notifications →
                          Enable push).
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </GlassCard>
      </section>
    </div>
  );
};

export default PushPage;
