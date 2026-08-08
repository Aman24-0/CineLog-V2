// src/features/landing/components/DemoVaultShowcase.tsx
/**
 * DemoVaultShowcase — mock vault/watchlist interface for the landing page.
 *
 * Renders a GlassCard containing:
 *   - Status filter tabs (All, Watching, Completed, Planned)
 *   - A grid of vault items with poster, title, status badge, and
 *     optional episode progress bar.
 *   - Watch status color coding (green=watching, blue=completed,
 *     purple=planned, red=dropped).
 *
 * Uses static demo data only.
 */

import { Component, For, Show } from "solid-js";
import { GlassCard, GlassBadge } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SafeImage from "~/shared/ui/SafeImage";
import { DEMO_VAULT_ITEMS } from "../data/demoContent";
import type { WatchStatus } from "../data/demoContent";

// ─── Filter Tabs ───────────────────────────────────────────────

const VAULT_FILTERS: { label: string; status?: WatchStatus }[] = [
  { label: "All" },
  { label: "Watching", status: "watching" },
  { label: "Completed", status: "completed" },
  { label: "Planned", status: "planned" },
];

// ─── Status → color class map ─────────────────────────────────

const statusDotClass: Record<WatchStatus, string> = {
  watching: "landing-vault__status-dot--watching",
  completed: "landing-vault__status-dot--completed",
  planned: "landing-vault__status-dot--planned",
  dropped: "landing-vault__status-dot--dropped",
};

// ─── Component ─────────────────────────────────────────────────

const DemoVaultShowcase: Component = () => {
  return (
    <GlassCard
      variant="glass-strong"
      padding="none"
      class="landing-vault"
    >
      {/* Header */}
      <div class="landing-vault__header">
        <h3 class="landing-vault__title">Your Vault</h3>
        <div class="landing-vault__filters">
          <For each={VAULT_FILTERS}>
            {(filter) => (
              <GlassBadge
                label={filter.label}
                status={filter.status}
                size="compact"
                glass
              />
            )}
          </For>
        </div>
      </div>

      {/* Grid */}
      <div class="landing-vault__grid">
        <For each={DEMO_VAULT_ITEMS}>
          {(item) => (
            <div class="landing-vault__item">
              {/* Poster thumbnail */}
              <div class="landing-vault__poster">
                <SafeImage
                  src={tmdbImage(item.posterPath, "w185")}
                  alt={item.title}
                  class="landing-vault__poster-img"
                  fallback={
                    <div class="landing-vault__poster-fallback">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                        style={{ "font-size": "20px" }}
                      >
                        movie
                      </span>
                    </div>
                  }
                />
              </div>

              {/* Info */}
              <div class="landing-vault__info">
                <span class="landing-vault__item-title">{item.title}</span>
                <span class="landing-vault__item-year">{item.year}</span>
                <GlassBadge status={item.status} size="compact" />

                {/* Episode progress (TV shows) */}
                <Show when={item.episodeProgress}>
                  {(progress) => (
                    <div class="landing-vault__progress">
                      <div
                        class="landing-vault__progress-bar"
                        style={{
                          width: `${(progress().current / progress().total) * 100}%`,
                        }}
                      />
                      <span class="landing-vault__progress-label">
                        {progress().current}/{progress().total} eps
                      </span>
                    </div>
                  )}
                </Show>
              </div>

              {/* Status dot indicator */}
              <div
                class={`landing-vault__status-dot ${statusDotClass[item.status]}`}
                aria-hidden="true"
              />
            </div>
          )}
        </For>
      </div>
    </GlassCard>
  );
};

export default DemoVaultShowcase;
