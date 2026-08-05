// src/features/admin/services/AnilistServicePage.tsx
//
// CineLog V2 — AniList Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for AniList operational status:
//   • Status (live probe from /api/admin/services/status — also
//      detects 403 "temporarily disabled" outages)
//   • Access token status (ANILIST_ACCESS_TOKEN env var — present / missing)
//   • Outage detection (the AniList client retries 403-outage responses
//      with exponential backoff; we surface the current probe result)
//   • Cache hit %  — the AniList client has a 5-minute in-memory
//      response cache. We do not expose hit/miss counts to the admin
//      API surface, so we explain that transparently.
//   • Link to the existing /admin/anime page where feature toggles
//      (Seasonal Carousel, Characters & Staff, etc.) live. Those are
//      user-facing feature flags, NOT service config, so they stay
//      there.
//
// WHAT THIS PAGE IS NOT:
//   • It does NOT duplicate the per-feature toggles on /admin/anime.
//     Those toggles control which AniList features users see on
//     Discover / Details. The operator clicks "Manage feature
//     toggles →" to go there.
//   • It does NOT expose the access token value. Rotation is a
//     Vercel env var change.
//
// RESPONSIVE: stacks to 1 column on mobile.

import { Show, type Component } from "solid-js";
import { A } from "@solidjs/router";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import ServicePageHeader from "./ServicePageHeader";
import ServiceKeyStatus from "./ServiceKeyStatus";

const AnilistServicePage: Component = () => {
  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="animation"
        name="AniList"
        description="AniList GraphQL provides anime-specific enrichment — characters, voice actors, relations, airing schedule, themes. Proxied at /api/anilist. Outage detection (403 'temporarily disabled') is retried with exponential backoff."
      />

      {/* ─── Outage detection + cache metrics ──────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Outage detection & cache
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassStatCard
            value="5 min"
            label="In-memory response cache TTL"
            icon="timer"
            variant="glass"
          />
          <GlassStatCard
            value="3"
            label="Retries on outage / 5xx"
            icon="refresh"
            variant="glass"
          />
          <GlassStatCard
            value="90→120"
            label="Rate limit bump (anon → token)"
            icon="speed"
            variant="glass"
          />
          <GlassStatCard
            value="—"
            label="Cache hit rate"
            icon="percent"
            variant="glass"
          />
        </div>
        <p class="m-0 text-xs text-text-soft">
          The AniList client caches responses in memory for 5 minutes
          and retries 403-outage / 5xx responses up to 3 times with
          exponential backoff. Per-request hit/miss counts are not
          currently exported to the admin API — wire that up in{" "}
          <code class="font-mono">src/lib/anilist/client.ts</code> before
          exposing a number here.
        </p>
      </section>

      {/* ─── Outage status explainer ────────────────────────────── */}
      <GlassCard padding="default">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            health_and_safety
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Outage detection
          </h3>
        </div>
        <p class="m-0 text-sm text-text-secondary">
          When AniList returns <code class="font-mono">HTTP 403</code>{" "}
          with a "temporarily disabled" body, the client treats it as a
          transient outage and retries with 2s, 4s, 8s backoff. The
          header's status pill reflects this:
        </p>
        <ul class="mt-3 flex flex-col gap-1.5 text-xs text-text-muted">
          <li>
            <strong class="text-success">Operational</strong> — GraphQL
            endpoint responded 200 to the trivial probe query.
          </li>
          <li>
            <strong class="text-warning">Degraded</strong> — endpoint
            returned 403 (possible outage) or a non-5xx error code.
          </li>
          <li>
            <strong class="text-danger">Down</strong> — endpoint returned
            5xx or did not respond within 5 seconds.
          </li>
        </ul>
      </GlassCard>

      {/* ─── Access token ───────────────────────────────────────── */}
      <GlassCard padding="default">
        <h3 class="mb-3 mt-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Access token
        </h3>
        <ServiceKeyStatus
          present={false}
          label="ANILIST_ACCESS_TOKEN"
          hint="Server-only env var (optional). When set, raises the per-IP rate limit from 90 to 120 req/min and is injected by /api/anilist."
        />
        <p class="mt-3 text-xs text-text-soft">
          Anonymous requests work fine at the standard 90 req/min/IP
          limit, so the token is optional. Without it, the rate-limit
          buffer in the AniList client automatically slows down
          requests when X-RateLimit-Remaining drops below 5.
        </p>
      </GlassCard>

      {/* ─── Link to feature toggles page ───────────────────────── */}
      <GlassCard padding="default">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <span
              class="material-symbols-outlined text-lg text-text-soft"
              aria-hidden="true"
            >
              toggle_on
            </span>
            <div class="flex flex-col gap-1">
              <h3 class="m-0 text-sm font-semibold text-text-strong">
                Feature toggles
              </h3>
              <p class="m-0 text-xs text-text-muted">
                Per-feature on/off switches (Seasonal Carousel,
                Characters & Staff, Airing Schedule, etc.) live on the
                AniList Integration page. Those control which AniList
                features users see — they are not service config.
              </p>
            </div>
          </div>
          <A
            href="/admin/anime"
            class="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-glass-border bg-glass px-3 py-2 text-xs font-semibold text-primary no-underline backdrop-blur-xl transition-[background-color] hover:bg-glass-strong"
          >
            <span class="material-symbols-outlined text-sm" aria-hidden="true">
              toggle_on
            </span>
            Manage feature toggles →
          </A>
        </div>
      </GlassCard>
    </div>
  );
};

export default AnilistServicePage;
