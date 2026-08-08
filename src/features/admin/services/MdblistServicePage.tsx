// src/features/admin/services/MdblistServicePage.tsx
//
// CineLog V2 — MDBList Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for MDBList operational status:
//   • Status (live probe from /api/admin/services/status)
//   • API key status (MDBLIST_API_KEY env var — present / missing)
//   • Cache hit %  — MDBList responses are cached at the HTTP layer
//     by /api/media/ratings (browser 24h + Vercel CDN 7d SWR). We do
//     not currently track hit/miss counts, so we surface that
//     transparently instead of inventing a number.
//   • Where MDBList is used (1 read-only call site: ratings on the
//     details page) so the operator can predict blast radius if the
//     service is down.
//
// WHAT THIS PAGE IS NOT:
//   • There are no editable MDBList settings — the key is server-only
//     and there is no admin-tunable cache TTL (the cache is set by
//     HTTP headers in /api/media/ratings.ts). If we later add a TTL
//     knob, it should live HERE, not on AdminSettingsPage.
//
// RESPONSIVE: stacks to 1 column on mobile.

import { type Component } from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import ServicePageHeader from "./ServicePageHeader";
import ServiceKeyStatus from "./ServiceKeyStatus";

const MdblistServicePage: Component = () => {
  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="rate_review"
        name="MDBList"
        description="MDBList provides IMDb / Rotten Tomatoes / Metacritic ratings for movie & TV detail pages. Proxied server-side at /api/media/ratings with HTTP caching."
      />

      {/* ─── Where MDBList is used ────────────────────────────────
          Per Phase 9 strict user-side mapping: before listing any
          integration, we verify it actually exists on the user side.
          MDBList has exactly one consumer — useMdbListRatings.ts —
          which powers the rating panel on details pages. */}
      <GlassCard padding="default">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="material-symbols-outlined text-base text-text-soft"
            aria-hidden="true"
          >
            account_tree
          </span>
          <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
            Used by
          </h3>
        </div>
        <ul class="m-0 flex flex-col gap-2 p-0 text-sm text-text-secondary">
          <li class="flex items-start gap-2">
            <span class="material-symbols-outlined text-base text-primary" aria-hidden="true">
              movie
            </span>
            <span>
              <strong class="text-text-strong">Details modal — Ratings panel</strong>
              <span class="mt-0.5 block text-xs text-text-muted">
                Source: <code class="font-mono">src/features/details/useMdbListRatings.ts</code>
                {" → "}
                <code class="font-mono">/api/media/ratings</code>
              </span>
            </span>
          </li>
        </ul>
      </GlassCard>

      {/* ─── Stat cards (best-effort; MDBList has no admin-tracked metrics) ── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Metrics
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassStatCard
            value="24h + 7d"
            label="HTTP cache (browser + CDN SWR)"
            icon="cache"
            variant="glass"
          />
          <GlassStatCard
            value="—"
            label="Cache hit rate"
            icon="percent"
            variant="glass"
          />
          <GlassStatCard
            value="1"
            label="Consumer route"
            icon="route"
            variant="glass"
          />
          <GlassStatCard
            value="No"
            label="Admin-configurable TTL"
            icon="tune"
            variant="glass"
          />
        </div>
        <p class="m-0 text-xs text-text-soft">
          MDBList responses are cached at the HTTP layer via{" "}
          <code class="font-mono">Cache-Control</code> headers in{" "}
          <code class="font-mono">/api/media/ratings</code>. Hit/miss
          counts are not tracked at the request level — if you need
          that metric, wire it up in the ratings proxy before exposing
          a number here.
        </p>
      </section>

      {/* ─── API key status ─────────────────────────────────────── */}
      <GlassCard padding="default">
        <h3 class="mb-3 mt-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          API key
        </h3>
        <ServiceKeyStatus
          present={false}
          label="MDBLIST_API_KEY"
          hint="Server-only env var. Cannot be read from the client. Live probe in the header confirms whether the key is set + working."
        />
        <p class="mt-3 text-xs text-text-soft">
          To rotate: set a new value for{" "}
          <code class="font-mono">MDBLIST_API_KEY</code> in the Vercel
          dashboard and trigger a new deployment.
        </p>
      </GlassCard>
    </div>
  );
};

export default MdblistServicePage;
