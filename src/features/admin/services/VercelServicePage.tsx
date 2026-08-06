// src/features/admin/services/VercelServicePage.tsx
//
// CineLog V2 — Vercel Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for Vercel operational status:
//   • Status (live probe from /api/admin/services/status — when
//      VERCEL_TOKEN is set, probes the deployments API; otherwise
//      returns "unknown" with a hint to open the dashboard manually)
//   • Last deploy commit hash (read from VERCEL_GIT_COMMIT_SHA env
//      var, which Vercel auto-populates in every deployment)
//   • Deploy URL + project dashboard link
//   • Vercel Cron jobs summary (parsed from vercel.json)
//
// WHAT THIS PAGE IS NOT:
//   • It does NOT let the admin trigger a redeploy. That's a Vercel
//      dashboard action.
//   • It does NOT show full deployment history. The dashboard has a
//      richer view.
//
// RESPONSIVE: stacks to 1 column on mobile.

import { For, Show, type Component } from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import ServicePageHeader from "./ServicePageHeader";

// ─── Vercel cron summary ─────────────────────────────────────────
//
// Parsed from vercel.json at build time. Kept in sync manually — if
// you add a cron to vercel.json, add a row here too. (We don't
// import vercel.json at runtime because it lives at the repo root,
// outside the src/ tree that the bundler scans.)
interface CronEntry {
  path: string;
  schedule: string;
  description: string;
}

const VERCEL_CRONS: CronEntry[] = [
  {
    path: "/api/cron/weekly-recap",
    schedule: "0 10 * * 1", // Mon 10:00 UTC
    description: "Monday-morning weekly recap email digest"
  }
];

// ─── Component ───────────────────────────────────────────────────

const VercelServicePage: Component = () => {
  // Vercel auto-injects these env vars in every deployment. They are
  // NOT secret — they're metadata about the current deployment. Safe
  // to expose to the client.
  const commitSha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "";
  const commitMessage = import.meta.env.VITE_VERCEL_GIT_COMMIT_MESSAGE ?? "";
  const commitAuthor = import.meta.env.VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME ?? "";
  const deploymentUrl = import.meta.env.VITE_VERCEL_URL ?? "";
  const projectUrl = import.meta.env.VITE_APP_BASE_URL ?? "https://cinelog.vercel.app";

  const shortSha = commitSha ? commitSha.slice(0, 7) : "";
  const vercelProjectDashboard = projectUrl
    ? `https://vercel.com/dashboard`
    : "https://vercel.com/dashboard";

  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="cloud"
        name="Vercel"
        description="Hosting, deployment, and cron platform. When VERCEL_TOKEN is set, the health probe checks the deployments API; otherwise status is reported as 'unknown' with a manual dashboard link."
      />

      {/* ─── Last deploy info ───────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Current deployment
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassStatCard
            value={shortSha || "—"}
            label="Commit SHA"
            icon="commit"
            variant="glass"
          />
          <GlassStatCard
            value={commitAuthor || "—"}
            label="Commit author"
            icon="person"
            variant="glass"
          />
          <GlassStatCard
            value={String(VERCEL_CRONS.length)}
            label="Vercel Cron jobs"
            icon="schedule"
            variant="glass"
          />
          <GlassStatCard
            value={deploymentUrl ? "Live" : "—"}
            label="Deployment URL"
            icon="link"
            variant="glass"
          />
        </div>
        <Show when={commitMessage}>
          <GlassCard padding="default">
            <div class="flex items-start gap-3">
              <span
                class="material-symbols-outlined flex-shrink-0 text-base text-text-soft"
                aria-hidden="true"
              >
                description
              </span>
              <div class="flex min-w-0 flex-col gap-1">
                <span class="text-[11px] uppercase tracking-widest text-text-muted">
                  Last commit message
                </span>
                <code class="block break-words font-mono text-sm text-text-strong">
                  {commitMessage}
                </code>
              </div>
            </div>
          </GlassCard>
        </Show>
        <p class="m-0 max-w-3xl text-xs text-text-soft">
          Deployment metadata is read from{" "}
          <code class="font-mono">VERCEL_*</code> env vars that Vercel
          auto-injects at build time. If you see "—" above, the app is
          running in a non-Vercel environment (e.g.{" "}
          <code class="font-mono">npm run dev</code>).
        </p>
      </section>

      {/* ─── API token ──────────────────────────────────────────── */}
      <GlassCard padding="default">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            key
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Vercel API token
          </h3>
        </div>
        <p class="m-0 text-sm text-text-secondary">
          When{" "}
          <code class="font-mono">VERCEL_TOKEN</code>{" "}
          (or{" "}
          <code class="font-mono">VERCEL_ACCESS_TOKEN</code>) is set in
          the server environment, the Service Health probe fetches the
          latest deployment from the Vercel REST API and reports{" "}
          <strong class="text-success">Operational</strong> on success.
          When it's not set, the probe returns{" "}
          <GlassBadge
            intent="default"
            icon="help"
            label="Unknown"
            size="compact"
            glass
          />{" "}
          and you should use the manual dashboard link below.
        </p>
        <p class="mt-3 text-xs text-text-soft">
          To enable: create a token at{" "}
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noreferrer"
            class="text-primary no-underline hover:underline"
          >
            vercel.com/account/tokens
          </a>{" "}
          → set as{" "}
          <code class="font-mono">VERCEL_TOKEN</code> in your Vercel
          project env vars → redeploy.
        </p>
      </GlassCard>

      {/* ─── Cron jobs ──────────────────────────────────────────── */}
      <GlassCard padding="comfortable">
        <div class="mb-4 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            schedule
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Vercel Cron jobs
          </h3>
        </div>
        <p class="m-0 mb-4 text-xs text-text-muted">
          Defined in{" "}
          <code class="font-mono">vercel.json</code>. Vercel Cron
          invokes these paths on the schedule shown — they run as
          serverless functions and bypass the admin auth guard by
          checking the{" "}
          <code class="font-mono">x-vercel-cron-auth</code> header.
        </p>
        <div class="flex flex-col gap-2">
          <For each={VERCEL_CRONS}>{(cron) => (
            <div class="flex flex-col gap-2 rounded-md border border-glass-border bg-tier-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 flex-col gap-1">
                <code class="break-words font-mono text-sm font-semibold text-text-strong">
                  {cron.path}
                </code>
                <span class="text-xs text-text-muted">{cron.description}</span>
              </div>
              <GlassBadge
                intent="info"
                icon="schedule"
                label={cron.schedule}
                size="default"
                glass
                class="flex-shrink-0"
              />
            </div>
          )}</For>
        </div>
      </GlassCard>

      {/* ─── Dashboard link ─────────────────────────────────────── */}
      <GlassCard padding="default">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <span
              class="material-symbols-outlined text-lg text-text-soft"
              aria-hidden="true"
            >
              dashboard
            </span>
            <div class="flex flex-col gap-1">
              <h3 class="m-0 text-sm font-semibold text-text-strong">
                Vercel project dashboard
              </h3>
              <p class="m-0 text-xs text-text-muted">
                Full deployment history, env var management, runtime
                logs, and analytics. Trigger redeployments from here.
              </p>
            </div>
          </div>
          <a
            href={vercelProjectDashboard}
            target="_blank"
            rel="noreferrer"
            class="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-glass-border bg-glass px-3 py-2 text-xs font-semibold text-primary no-underline backdrop-blur-xl transition-[background-color] hover:bg-glass-strong"
          >
            <span class="material-symbols-outlined text-sm" aria-hidden="true">
              open_in_new
            </span>
            Open Vercel dashboard →
          </a>
        </div>
      </GlassCard>
    </div>
  );
};

export default VercelServicePage;
