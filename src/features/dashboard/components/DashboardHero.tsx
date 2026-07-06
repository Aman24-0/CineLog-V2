// src/features/dashboard/components/DashboardHero.tsx
import { Show, createSignal, createMemo } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { isWatchable } from "~/shared/utils/progress";
import { Button } from "~/shared/ui/primitives";
import type { WatchlistItem } from "~/shared/types";
import type { RecommendationResult } from "../recommendationEngine";

interface DashboardHeroProps {
  recommendation: RecommendationResult;
  isGuest: boolean;
  onLogin: () => void;
  onShuffle: () => void;
  onOpenMovie: (id: string) => void;
}

/**
 * DashboardHero — context-aware cinematic hero.
 *
 * Signature interaction: "Context-Aware Hero"
 *
 * The hero answers "what should I watch today?" by adapting to the user's state:
 *
 *  - CONTINUE: Shows the most recently watched in-progress title with a
 *    progress bar and "Resume" CTA. The backdrop + poster + title create
 *    a cinematic resume experience.
 *
 *  - TONIGHT: Shows a random planned title with "Start Watching" CTA +
 *    "Shuffle" secondary. This is for when the user has nothing in progress
 *    but has a vault of planned titles.
 *
 *  - HISTORY: Shows a completed title with "Watch Again" context. Fallback.
 *
 *  - EMPTY/GUEST: Shows a cinematic empty state with sign-in CTA.
 *
 * Visual language inherited from the Details page:
 *  - Full-bleed backdrop with multi-layer gradients (dashboard-hero-overlay)
 *  - Floating poster on desktop (hidden on mobile for thumb-zone optimization)
 *  - Display title (Bebas Neue)
 *  - Quick-meta pills (v2-pill)
 *  - Action buttons (btn-primary + btn-ghost)
 *
 * The hero is mobile-first: poster hidden on mobile (< 640px) to maximize
 * backdrop visibility and keep the title + actions in the thumb zone.
 */
export default function DashboardHero(props: DashboardHeroProps) {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [posterLoaded, setPosterLoaded] = createSignal(false);

  const item = createMemo(() => props.recommendation.item);

  const backdropUrl = () => {
    const path = item()?.backdrop_path || item()?.poster_path;
    return path ? tmdbImage(path, "w1280") : "";
  };

  const posterUrl = () => {
    const path = item()?.poster_path;
    return path ? tmdbImage(path, "w342") : "";
  };

  const title = () => item()?.title || item()?.name || "Untitled";
  const year = () =>
    (item()?.release_date || item()?.first_air_date || "").split("-")[0] || "";
  const runtime = () =>
    (item()?.runtime ?? 0) > 0 ? formatRuntime(item()!.runtime) : null;

  // Progress for Continue Watching context — uses episode/season only (no currentTime)
  const progress = createMemo(() => {
    const m = item();
    if (!m || !isWatchable(m)) return null;
    if (m.media_type !== "tv") return null; // Movies don't have episode progress

    const season = m.season || 1;
    const episode = m.episode || 1;
    const totalEps = m.totalEps || 0;
    const pct = totalEps > 0 ? Math.min(100, Math.max(0, (episode / totalEps) * 100)) : 0;

    return {
      pct: Math.round(pct),
      episodeInfo: `S${season} E${episode}${totalEps > 0 ? ` / ${totalEps}` : ""}`
    };
  });

  // Empty / Guest state
  if (!item() || props.isGuest) {
    return (
      <div class="guest-hero animate-fade-in">
        <div class="guest-hero-content">
          <div
            class="flex items-center justify-center w-16 h-16 rounded-2xl mb-2"
            style={{
              background: "var(--p-dim)",
              border: "1px solid color-mix(in srgb, var(--p) 25%, transparent)",
              "box-shadow": "0 0 24px var(--p-glow)"
            }}
            aria-hidden="true"
          >
            <span
              class="material-symbols-outlined"
              style={{
                "font-size": "32px",
                color: "var(--p)",
                "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              }}
              aria-hidden="true"
            >
              {props.isGuest ? "clapperboard" : "movie_filter"}
            </span>
          </div>

          <span class="greeting-eyebrow">
            {props.isGuest ? "Preview Mode" : "Empty Vault"}
          </span>

          <h2 class="type-display-sm" style={{ "text-align": "center" }}>
            {props.isGuest ? "Your Universe Awaits" : "Start Your Collection"}
          </h2>

          <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px" }}>
            {props.isGuest
              ? "Sign in to build your personal cinematic universe, track progress, and get tailored recommendations."
              : "Search for movies and series to start building your collection."}
          </p>

          <Show when={props.isGuest}>
            <Button
              variant="primary"
              size="md"
              icon="login"
              onClick={props.onLogin}
              style={{ "margin-top": "0.5rem" }}
              aria-label="Sign in to begin"
            >
              Sign In to Begin
            </Button>
          </Show>
        </div>
      </div>
    );
  }

  return (
    <div
      class="dashboard-hero animate-fade-in"
      role="region"
      aria-label={`Featured: ${title()}`}
    >
      {/* Backdrop */}
      <Show when={backdropUrl()}>
        <img
          src={backdropUrl()}
          class={`dashboard-hero-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          {...{ fetchpriority: "high" } as any}
          onLoad={() => setBackdropLoaded(true)}
          alt=""
          aria-hidden="true"
        />
      </Show>

      {/* Multi-layer gradient overlay */}
      <div class="dashboard-hero-overlay" aria-hidden="true" />

      {/* Badge (top-left) */}
      <Show when={props.recommendation.badge}>
        <div
          class="absolute top-4 left-4 z-10 badge-accent"
          style={{ "z-index": 3 }}
          aria-label={props.recommendation.badge}
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "12px", color: "var(--p)" }}
            aria-hidden="true"
          >
            {props.recommendation.context === "continue" ? "play_circle" : props.recommendation.context === "tonight" ? "auto_awesome" : "history"}
          </span>
          {props.recommendation.badge}
        </div>
      </Show>

      {/* New Season badge (top-right) */}
      <Show when={item()?.newSeasonAvailable}>
        <div
          class="absolute top-4 right-4 z-10 badge-glow"
          style={{ "z-index": 3, "font-size": "7px", padding: "3px 8px" }}
          aria-label="New season available"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "11px" }} aria-hidden="true">
            new_releases
          </span>
          New Season
        </div>
      </Show>

      {/* Content cluster — poster + title + meta + actions */}
      <div class="dashboard-hero-content">
        {/* Floating poster (desktop only) */}
        <div class="dashboard-hero-poster">
          <Show when={posterUrl()}>
            <img
              src={posterUrl()}
              class={posterLoaded() ? "img-loaded" : ""}
              loading="eager"
              decoding="async"
              onLoad={() => setPosterLoaded(true)}
              alt=""
              aria-hidden="true"
            />
          </Show>
        </div>

        {/* Title + meta + actions */}
        <div class="flex-1 min-w-0">
          <h2 class="dashboard-hero-title">{title()}</h2>

          {/* Quick meta pills */}
          <div class="dashboard-hero-meta">
            <Show when={year()}>
              <span class="v2-pill">{year()}</span>
            </Show>
            <span class="v2-pill">{item()!.media_type === "tv" ? "Series" : "Movie"}</span>
            <Show when={runtime()}>
              <span class="v2-pill">{runtime()}</span>
            </Show>
            <Show when={item()?.imdbRating}>
              <span class="v2-pill" style={{ color: "#f5c518", "border-color": "rgba(245,197,24,0.25)" }}>
                ★ {item()!.imdbRating}
              </span>
            </Show>
          </div>

          {/* Progress bar (Continue Watching context only — TV shows with episode progress) */}
          <Show when={progress()}>
            <div class="dashboard-hero-progress">
              <div class="progress-premium mb-1">
                <div
                  class="progress-premium-fill"
                  style={{ width: `${progress()!.pct}%` }}
                />
              </div>
              <div class="flex justify-between items-center">
                <span class="type-micro" style={{ color: "var(--text-soft)" }}>
                  {progress()!.episodeInfo}
                </span>
                <span class="type-micro" style={{ color: "var(--p2)" }}>
                  {progress()!.pct}%
                </span>
              </div>
            </div>
          </Show>

          {/* Actions */}
          <div class="dashboard-hero-actions">
            <Button
              variant="primary"
              size="md"
              icon={props.recommendation.isResume ? "play_arrow" : "info"}
              iconFill={props.recommendation.isResume}
              onClick={() => item() && props.onOpenMovie(item()!.id)}
              aria-label={
                props.recommendation.isResume
                  ? `Resume ${title()}`
                  : `View details for ${title()}`
              }
            >
              {props.recommendation.isResume ? "Resume" : "Details"}
            </Button>

            <Show when={props.recommendation.canShuffle}>
              <Button
                variant="ghost"
                size="md"
                icon="shuffle"
                onClick={props.onShuffle}
                aria-label="Shuffle to another pick"
              >
                Shuffle
              </Button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
