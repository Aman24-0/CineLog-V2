// src/features/admin/communication/EmailPage.tsx
//
// CineLog V2 — Admin Communication Hub: Email (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// Email center. The COMPLEMENT to /admin/services/resend — that page
// is for SERVICE HEALTH (API key, from email, domain status), THIS
// page is for SENDING and DELIVERY TRACKING (test emails, per-day
// delivery chart, template registry).
//
// WHAT THIS PAGE HAS (that the Services Hub page does not):
//   • Send Test Email — pick a template, send a sample render to
//     your own admin inbox. Uses the SAME templates
//     (src/lib/email/templates/) that production sends use.
//   • Delivery stats — last-7-day sent / delivered / bounced
//     counts from the admin_actions audit log.
//   • Template registry — list of all 6 templates with their cron
//     schedule and a one-line description.
//
// WHAT THIS PAGE DOES NOT HAVE (kept on the Services Hub page):
//   • Resend API key configuration.
//   • From-email configuration.
//   • Domain verification status.
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — Resend API key + from-email live ONLY on
//     /admin/services/resend. This page only shows summary status
//     + a deep-link to that page.
//   • Strict user-side mapping — the 6 templates map exactly to
//     the 6 categories in user notifPrefs (newSeason,
//     continueWatching, weeklyRecap, recommendations, syncStatus)
//     plus "reminder" which is the per-episode reminder controlled
//     by episodeReminderLead. No dummy templates.
//   • No OMDB.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import { BarChartV, type BarVItem } from "~/features/stats/components/SvgChart";

// ─── Types ───────────────────────────────────────────────────────

interface EmailStatsResponse {
  ok: boolean;
  days?: { date: string; sent: number; delivered: number; bounced: number }[];
  total?: { sent: number; delivered: number; bounced: number };
  error?: string;
}

interface TestEmailResponse {
  ok: boolean;
  mock?: boolean;
  messageId?: string;
  message?: string;
  error?: string;
}

type TemplateKey =
  | "reminder"
  | "weekly_recap"
  | "new_season"
  | "continue_watching"
  | "recommendations"
  | "sync_status";

interface TemplateInfo {
  key: TemplateKey;
  label: string;
  file: string;
  description: string;
  cronSchedule: string;
  // Maps to the user-side notifPrefs key that controls this template.
  // "reminder" is controlled by episodeReminderLead (a numeric lead
  // time, not a boolean toggle) so we note that explicitly.
  userPrefKey: string;
}

// The 6 templates. This list MUST stay in sync with the files under
// src/lib/email/templates/ and the NotificationType union in
// src/lib/email/renderer.ts.
const TEMPLATES: TemplateInfo[] = [
  {
    key: "reminder",
    label: "Episode Reminder",
    file: "reminder.ts",
    description:
      "Sent when an episode airs in the next 24h and the user has it on their watchlist.",
    cronSchedule: "Daily 09:00 UTC",
    userPrefKey: "episodeReminderLead (minutes)"
  },
  {
    key: "weekly_recap",
    label: "Weekly Recap",
    file: "weeklyRecap.ts",
    description: "Monday-morning digest of the user's past-week activity + upcoming releases.",
    cronSchedule: "Mon 10:00 UTC",
    userPrefKey: "emailWeeklyRecap"
  },
  {
    key: "new_season",
    label: "New Season Alert",
    file: "newSeason.ts",
    description: "Notifies users when a tracked series has a new season premiering.",
    cronSchedule: "Daily 09:00 UTC (same pass as reminder)",
    userPrefKey: "emailNewSeason"
  },
  {
    key: "continue_watching",
    label: "Continue Watching",
    file: "continueWatching.ts",
    description: "Re-engagement nudge for users who paused a TV series mid-season.",
    cronSchedule: "On-demand (not scheduled)",
    userPrefKey: "emailContinueWatching"
  },
  {
    key: "recommendations",
    label: "Recommendations",
    file: "recommendations.ts",
    description: "Weekly personalized recommendations based on taste profile.",
    cronSchedule: "Fri 10:00 UTC",
    userPrefKey: "emailRecommendations"
  },
  {
    key: "sync_status",
    label: "Sync Status",
    file: "syncStatus.ts",
    description: "Sent after a cloud sync completes — confirms backup succeeded or reports failures.",
    cronSchedule: "On-demand (after sync)",
    userPrefKey: "emailSyncStatus"
  }
];

// ─── Component ───────────────────────────────────────────────────

const EmailPage: Component = () => {
  const [stats, setStats] = createSignal<EmailStatsResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Per-template send state. Keyed by template key.
  const [sending, setSending] = createSignal<Record<string, boolean>>({});
  const [results, setResults] = createSignal<
    Record<
      string,
      {
        ok: boolean;
        mock?: boolean;
        message?: string;
        error?: string;
      }
    >
  >({});

  const fetchStats = async () => {
    try {
      const resp = await fetch("/api/admin/communication/email/stats", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as EmailStatsResponse;
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email stats");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchStats);

  const sendTest = async (template: TemplateInfo) => {
    setSending((s) => ({ ...s, [template.key]: true }));
    setResults((r) => {
      const next = { ...r };
      delete next[template.key];
      return next;
    });
    try {
      const resp = await fetch("/api/admin/communication/email/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: template.key })
      });
      const data = (await resp.json().catch(() => ({}))) as TestEmailResponse;
      if (!resp.ok || !data.ok) {
        setResults((r) => ({
          ...r,
          [template.key]: {
            ok: false,
            error: data.error ?? `HTTP ${resp.status}`
          }
        }));
        return;
      }
      setResults((r) => ({
        ...r,
        [template.key]: {
          ok: true,
          mock: data.mock,
          message: data.message ?? "Sent"
        }
      }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [template.key]: {
          ok: false,
          error: err instanceof Error ? err.message : "Network error"
        }
      }));
    } finally {
      setSending((s) => ({ ...s, [template.key]: false }));
    }
  };

  // Chart items for the 7-day delivery chart.
  const chartItems = createMemo((): BarVItem[] => {
    const days = stats()?.days ?? [];
    return days.map((d) => {
      const date = new Date(d.date);
      return {
        label: date.toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric"
        }),
        value: d.sent,
        secondary: d.bounced,
        tooltipLabel: date.toLocaleDateString(),
        tooltipRows: [
          { name: "Sent", value: String(d.sent) },
          { name: "Delivered", value: String(d.delivered) },
          { name: "Bounced", value: String(d.bounced) }
        ]
      };
    });
  });

  const total = () => stats()?.total ?? { sent: 0, delivered: 0, bounced: 0 };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div class="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header>
        <h1 class="m-0 text-2xl font-bold text-text-strong">Email</h1>
        <p class="mt-1 text-sm text-text-muted">
          Send test emails and review delivery performance. API key and from-email
          configuration live on the{" "}
          <a
            href="/admin/services/resend"
            class="text-primary underline hover:no-underline"
          >
            Resend service page
          </a>
          .
        </p>
      </header>

      {/* ─── Headline stats ─────────────────────────────────── */}
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label="Email delivery statistics"
      >
        <GlassStatCard
          value={total().sent}
          label="Sent (7d)"
          icon="mail"
          variant="accent"
          size="compact"
          trend={total().sent > 0 ? "up" : "neutral"}
        />
        <GlassStatCard
          value={total().delivered}
          label="Delivered (7d)"
          icon="check_circle"
          variant="glass"
          size="compact"
          trend={total().delivered > 0 ? "up" : "neutral"}
        />
        <GlassStatCard
          value={total().bounced}
          label="Bounced (7d)"
          icon="error"
          variant="glass"
          size="compact"
          trend={total().bounced > 0 ? "down" : "neutral"}
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

      {/* ─── Delivery chart ─────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Delivery — last 7 days
        </h2>
        <GlassCard variant="glass" size="comfortable">
          <Show
            when={chartItems().length > 0 && total().sent > 0}
            fallback={
              <GlassEmptyState
                icon="bar_chart"
                title="No delivery data yet"
                message="Once emails start sending, daily sent/delivered/bounced counts will appear here. For real-time per-message status, consult the Resend dashboard."
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
                Bounced
              </span>
            </div>
          </Show>
        </GlassCard>
      </section>

      {/* ─── Templates ──────────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Templates
        </h2>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <For each={TEMPLATES}>
            {(tpl) => {
              const isSending = () => sending()[tpl.key] === true;
              const result = () => results()[tpl.key];
              return (
                <GlassCard variant="glass" size="default">
                  <div class="flex flex-col gap-3">
                    {/* Top row: label + cron badge */}
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <span
                          class="material-symbols-outlined text-xl text-primary"
                          aria-hidden="true"
                        >
                          mail
                        </span>
                        <div>
                          <div class="font-semibold text-text-strong">
                            {tpl.label}
                          </div>
                          <div class="text-xs text-text-muted">
                            <code class="rounded bg-tier-3 px-1.5 py-0.5 text-[11px]">
                              {tpl.file}
                            </code>
                          </div>
                        </div>
                      </div>
                      <GlassBadge intent="default" size="compact">
                        {tpl.cronSchedule}
                      </GlassBadge>
                    </div>

                    {/* Description */}
                    <p class="m-0 text-sm text-text-muted">{tpl.description}</p>

                    {/* User pref mapping */}
                    <div class="flex items-center gap-2 text-xs text-text-muted">
                      <span
                        class="material-symbols-outlined text-sm"
                        aria-hidden="true"
                      >
                        link
                      </span>
                      <span>
                        User preference:{" "}
                        <code class="rounded bg-tier-3 px-1.5 py-0.5 text-[11px] text-text-secondary">
                          {tpl.userPrefKey}
                        </code>
                      </span>
                    </div>

                    {/* Send button */}
                    <div class="flex items-center gap-3 pt-1">
                      <GlassButton
                        variant="primary"
                        size="compact"
                        icon={isSending() ? "progress_activity" : "send"}
                        onClick={() => void sendTest(tpl)}
                        disabled={isSending()}
                        loading={isSending()}
                      >
                        {isSending() ? "Sending…" : "Send Test Email"}
                      </GlassButton>
                    </div>

                    {/* Result */}
                    <Show when={result()}>
                      {(r) => (
                        <div
                          class="rounded-md border p-2.5 text-xs"
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
                              <div class="flex items-center gap-1.5">
                                <span
                                  class="material-symbols-outlined text-sm"
                                  aria-hidden="true"
                                >
                                  error
                                </span>
                                {r().error}
                              </div>
                            }
                          >
                            <div class="flex items-center gap-1.5 font-semibold">
                              <span
                                class="material-symbols-outlined text-sm"
                                aria-hidden="true"
                              >
                                check_circle
                              </span>
                              {r().mock ? "Mock send (no API key)" : "Email sent"}
                            </div>
                            <div class="mt-0.5 opacity-90">{r().message}</div>
                          </Show>
                        </div>
                      )}
                    </Show>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>
      </section>

      <Show when={loading()}>
        <GlassLoadingState size="small" message="Loading delivery logs…" />
      </Show>
    </div>
  );
};

export default EmailPage;
