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
 * HeroContentCluster — sits below the CinematicHero in normal document flow.
 *
 * Layout: [floating poster] [title + tagline + quick-meta pills]
 *
 * The cluster has overflow: hidden to prevent ANY content from escaping
 * its bounds. The title is clamped to 2 lines (mobile) / 3 lines (desktop)
 * and word-break: break-word for long localized titles.
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

  // NOTE: The Hero's quick-meta pills no longer render the watch-status
  // pill ("Watching" / "Completed" / "Planned"). The ActionDock already
  // owns status as its primary line-1 control (4 dedicated buttons that
  // set the status directly), so the Hero pill was redundant and visually
  // competing with the action bar. Status is still surfaced in the
  // DetailsEditForm when explicitly editing — but read-only display is
  // owned solely by the ActionDock's pressed-state highlight.

  return (
    <div class="hero-content-cluster">
      {/* Floating poster
          ────────────────────────────────────────────────────────────
          Strict dimension + aspect-ratio constraints (v2.6 fix):
          The poster wrapper uses Tailwind utilities `w-28 sm:w-32` for a
          fixed width, `flex-shrink-0` to prevent flexbox squeezing, and
          `aspect-[2/3]` to derive the height from the width. This replaces
          the previous CSS-only `width:100px; height:150px` rule, which
          could fluctuate in some flex/grid contexts when the right-hand
          column (title + tagline + genre chips) had varying content
          height — the wrapper would stretch to match the tallest sibling.

          The image inside uses `w-full h-full object-cover` so it fills
          the constrained wrapper perfectly without warping, regardless
          of the source image's native dimensions. */}
      <div class="floating-poster w-28 sm:w-32 flex-shrink-0 aspect-[2/3]">
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
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            src={posterUrl()}
            class={`w-full h-full object-cover${posterLoaded() ? " img-loaded" : ""}`}
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
        <h1 class="hero-title" id="details-modal-title">{title()}</h1>

        <Show when={tagline()}>
          <p class="hero-tagline">{tagline()}</p>
        </Show>

        {/* Quick metadata pills — TMDB data only (year, type, runtime).
            The watch-status pill was intentionally removed — status is
            owned by the ActionDock's 4 dedicated status buttons, which
            highlight the active state with the accent color. */}
        <div class="hero-quick-meta">
          <Show when={year()}>
            <span class="v2-pill">{year()}</span>
          </Show>
          <span class="v2-pill">{isTv() ? "Series" : "Movie"}</span>
          <Show when={runtime() && runtime()! > 0}>
            <span class="v2-pill">{formatRuntime(runtime())}</span>
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
