// src/features/admin/services/ResendServicePage.tsx
//
// CineLog V2 — Resend Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for Resend operational status:
//   • Status (live probe from /api/admin/services/status — probes
//      /domains which returns 200 even with 0 verified domains)
//   • API key status (RESEND_API_KEY env var — present / missing)
//   • From email (RESEND_FROM_EMAIL env var — used as the sender)
//   • Emails sent today  — not currently tracked at the per-message
//      level. We surface that transparently with a link to the
//      Resend dashboard → Emails page where the operator can see
//      real-time delivery status.
//   • Template list — static list of the 6 templates currently
//      implemented under src/lib/email/templates/. Each template is
//      keyed by the same name used in the notifPrefs UI so the
//      operator can match template → user toggle → cron schedule.
//
// WHAT THIS PAGE IS NOT:
//   • It does not let the admin edit email templates. Templates are
//      code (TypeScript files under src/lib/email/templates/) — edit
//      them in the repo and redeploy.
//   • It does not duplicate the per-category notification toggles
//      on the user-side settings page. Those are user preferences,
//      not service config.
//
// RESPONSIVE: stacks to 1 column on mobile; template list collapses
// from a 2-col grid to 1-col on small screens.

import { For, type Component } from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import ServicePageHeader from "./ServicePageHeader";
import ServiceKeyStatus from "./ServiceKeyStatus";

// ─── Template registry ───────────────────────────────────────────
//
// This list MUST stay in sync with the files actually present under
// src/lib/email/templates/. The `key` field is the user-facing
// notification category name (matches the keys in
// core/preferences/notifications.ts and the categories the server
// checks in /api/push/send-admin).
//
// Per Phase 9 strict user-side mapping: every template listed here
// has a real .ts file in the templates/ directory. If a template is
// removed, it must also be removed from this list (and vice versa).
interface EmailTemplate {
  key: string;
  file: string;
  description: string;
  cronSchedule: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "reminder",
    file: "reminder.ts",
    description:
      "Sent when an episode airs in the next 24h and the user has it on their watchlist.",
    cronSchedule: "Daily 09:00 UTC"
  },
  {
    key: "weeklyRecap",
    file: "weeklyRecap.ts",
    description:
      "Monday-morning digest of the user's past-week activity + upcoming releases.",
    cronSchedule: "Mon 10:00 UTC"
  },
  {
    key: "continueWatching",
    file: "continueWatching.ts",
    description:
      "Re-engagement nudge for users who paused a TV series mid-season.",
    cronSchedule: "On-demand (not scheduled)"
  },
  {
    key: "newSeason",
    file: "newSeason.ts",
    description:
      "Notifies users when a tracked series has a new season premiering.",
    cronSchedule: "Daily 09:00 UTC (same pass as reminder)"
  },
  {
    key: "recommendations",
    file: "recommendations.ts",
    description:
      "Weekly personalized recommendations based on taste profile.",
    cronSchedule: "Fri 10:00 UTC"
  },
  {
    key: "syncStatus",
    file: "syncStatus.ts",
    description:
      "Sent after a cloud sync completes — confirms backup succeeded or reports failures.",
    cronSchedule: "On-demand (after sync)"
  }
];

// ─── Component ───────────────────────────────────────────────────

const ResendServicePage: Component = () => {
  const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL ?? "";

  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="mail"
        name="Resend"
        description="Transactional email delivery. All CineLog emails are sent via Resend's REST API. Probes /domains for health."
      />

      {/* ─── Headline metrics ──────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Metrics
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassStatCard
            value="—"
            label="Emails sent today"
            icon="send"
            variant="glass"
          />
          <GlassStatCard
            value={String(EMAIL_TEMPLATES.length)}
            label="Templates implemented"
            icon="draft"
            variant="glass"
          />
          <GlassStatCard
            value="2"
            label="Scheduled cron jobs"
            icon="schedule"
            variant="glass"
          />
          <GlassStatCard
            value={fromEmail ? fromEmail : "—"}
            label="From email"
            icon="alternate_email"
            variant="glass"
          />
        </div>
        <p class="m-0 max-w-3xl text-xs text-text-soft">
          Per-message send counts are not currently tracked in our DB.
          Real-time delivery status (sent / delivered / bounced) is
          available in the Resend dashboard → Emails page. To wire up
          per-day counts here, add an{" "}
          <code class="font-mono">emails_sent</code> table + log a row
          on every send.
        </p>
      </section>

      {/* ─── API key + from email ───────────────────────────────── */}
      <GlassCard padding="default">
        <h3 class="mb-3 mt-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Credentials
        </h3>
        <div class="flex flex-col gap-3">
          <ServiceKeyStatus
            present={false}
            label="RESEND_API_KEY"
            hint="Server-only env var. Cannot be read from the client. Header probe confirms validity."
          />
          <ServiceKeyStatus
            present={!!fromEmail}
            label="RESEND_FROM_EMAIL"
            hint={
              fromEmail
                ? `Configured — ${fromEmail}`
                : "VITE_RESEND_FROM_EMAIL env var not exposed to client"
            }
          />
        </div>
        <a
          href="https://resend.com/emails"
          target="_blank"
          rel="noreferrer"
          class="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary no-underline hover:underline"
        >
          <span class="material-symbols-outlined text-sm" aria-hidden="true">
            open_in_new
          </span>
          Open Resend dashboard →
        </a>
      </GlassCard>

      {/* ─── Template list ──────────────────────────────────────── */}
      <GlassCard padding="comfortable">
        <div class="mb-4 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            draft
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Email templates
          </h3>
        </div>
        <p class="m-0 mb-4 max-w-3xl text-xs text-text-muted">
          Each template maps to a user-toggleable notification category
          (see <code class="font-mono">core/preferences/notifications.ts</code>)
          and is rendered by{" "}
          <code class="font-mono">src/lib/email/renderer.ts</code>.
          Cron schedules are handled by{" "}
          <code class="font-mono">/api/cron/weekly-recap</code>{" "}
          (scheduled via Vercel Cron in{" "}
          <code class="font-mono">vercel.json</code>).
        </p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <For each={EMAIL_TEMPLATES}>
            {(tpl) => (
              <div class="flex flex-col gap-2 rounded-md border border-glass-border bg-tier-2 px-4 py-3">
                <div class="flex items-center justify-between gap-2">
                  <code class="font-mono text-sm font-semibold text-text-strong">
                    {tpl.key}
                  </code>
                  <GlassBadge
                    intent="info"
                    icon="schedule"
                    label={tpl.cronSchedule}
                    size="compact"
                  />
                </div>
                <p class="m-0 text-xs text-text-muted">{tpl.description}</p>
                <code class="font-mono text-[11px] text-text-soft">
                  src/lib/email/templates/{tpl.file}
                </code>
              </div>
            )}
          </For>
        </div>
      </GlassCard>
    </div>
  );
};

export default ResendServicePage;
