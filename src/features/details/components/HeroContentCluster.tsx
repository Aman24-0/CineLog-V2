// src/features/details/components/HeroContentCluster.tsx
import { Show, createSignal, For } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface HeroContentClusterProps {
  /** TMDB identity — always present */
  baseItem: WatchlistItem | null;
  /** TMDB details — fetched on demand */
  details: TMDBDetails | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * User-owned UI (status pill, new-season badge) only renders when
   * this is present. This is the ownership boundary.
   */
  vaultItem?: WatchlistItem | null;
}

/**
 * HeroContentCluster — sits below the CinematicHero, overlapping it.
 *
 * Layout: [floating poster] [title + tagline + quick-meta pills]
 *
 * The poster overlaps the hero boundary (negative margin-top from the hero),
 * creating the "floating poster" effect. The title cluster sits to the right
 * (or below on mobile) with the display title, tagline, and quick metadata
 * pills (year, type, runtime, status).
 *
 * OWNERSHIP BOUNDARY:
 *   The status pill ("Watching" / "Completed" / "Planned") and the
 *   "New Season" badge are user-owned states. They only render when
 *   `vaultItem` is present — i.e. when the title is actually in the
 *   user's vault. Non-vault titles show only TMDB metadata (year,
 *   type, runtime, genres).
 */
export default function HeroContentCluster(props: HeroContentClusterProps) {
  const [posterLoaded, setPosterLoaded] = createSignal(false);

  const title = () =>
    props.baseItem?.title ||
    props.baseItem?.name ||
    props.details?.title ||
    props.details?.name ||
    "Untitled";

  const year = () =>
    (
      props.baseItem?.release_date ||
      props.details?.release_date ||
      props.baseItem?.first_air_date ||
      props.details?.first_air_date ||
      ""
    ).split("-")[0];

  const runtime = () =>
    props.details?.runtime || props.details?.episode_run_time?.[0] || props.baseItem?.runtime;

  const isTv = () =>
    props.baseItem?.media_type === "tv" || props.details?.media_type === "tv";

  const tagline = () => props.details?.tagline?.trim();

  const genres = () => props.details?.genres?.map((g) => g.name).slice(0, 3) ?? [];

  const posterUrl = () => {
    const path = props.baseItem?.poster_path || props.details?.poster_path;
    return path ? tmdbImage(path, "w342") : "";
  };

  // Status pill — ONLY from the vault item. Never from baseItem.status
  // (which may be a fake default set by Discover/Search for non-vault titles).
  const statusLabel = () => {
    const s = props.vaultItem?.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return null;
  };

  return (
    <div class="hero-content-cluster">
      {/* Floating poster */}
      <div class="floating-poster">
        <Show
          when={posterUrl()}
          fallback={
            <div
              class="w-full h-full flex items-center justify-center"
              style={{ background: "var(--tier-3)" }}
              aria-hidden="true"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "32px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                movie
              </span>
            </div>
          }
        >
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

      {/* Title + tagline + quick-meta */}
      <div class="flex-1 min-w-0 pb-1">
        <h1 class="hero-title">{title()}</h1>

        <Show when={tagline()}>
          <p class="hero-tagline">{tagline()}</p>
        </Show>

        {/* Quick metadata pills — TMDB data only (year, type, runtime) */}
        <div class="hero-quick-meta">
          <Show when={year()}>
            <span class="v2-pill">{year()}</span>
          </Show>
          <span class="v2-pill">{isTv() ? "Series" : "Movie"}</span>
          <Show when={runtime() && runtime()! > 0}>
            <span class="v2-pill">{formatRuntime(runtime())}</span>
          </Show>
          {/* Status pill — user-owned, only when in vault */}
          <Show when={statusLabel()}>
            <span class={`v2-pill ${statusLabel() === "Watching" ? "v2-pill-success" : statusLabel() === "Completed" ? "v2-pill-info" : "v2-pill-accent"}`}>
              {statusLabel()}
            </span>
          </Show>
          {/* New Season badge — user-owned signal, only when in vault */}
          <Show when={props.vaultItem?.newSeasonAvailable}>
            <span class="v2-pill v2-pill-accent">New Season</span>
          </Show>
        </div>

        {/* Genre pills */}
        <Show when={genres().length > 0}>
          <div class="hero-quick-meta" style={{ "margin-top": "0.5rem" }}>
            <For each={genres()}>
              {(genre) => (
                <span class="v2-pill" style={{ "font-size": "0.5rem" }}>{genre}</span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
