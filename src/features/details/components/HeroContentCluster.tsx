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
    props.details?.runtime ||
    props.details?.episode_run_time?.[0] ||
    props.baseItem?.runtime;

  const isTv = () =>
    props.baseItem?.media_type === "tv" || props.details?.media_type === "tv";

  const tagline = () => props.details?.tagline?.trim();

  const genres = () =>
    props.details?.genres?.map((g) => g.name).slice(0, 3) ?? [];

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
          Dynamic-height poster (v2.8 fix):
          The poster wrapper keeps its fixed width (`w-28 sm:w-36
          flex-shrink-0`) but no longer locks an aspect ratio. The
          height is driven by the right-hand text column via the
          parent cluster's `align-items: stretch` (see details.css):
          the wrapper stretches to whatever height the title + tagline
          + quick-meta + genre chips add up to, and the image fills
          it via `w-full h-full object-cover` without warping.

          This eliminates the previous gap-below-poster issue (when
          the text column was taller than the locked 2:3 poster) and
          the previous poster-drift issue (when the text column was
          shorter and `align-items` drifted the poster to center/end).
          Now the two columns are always the same height by construction.

          `h-full` is the primary rule; `h-auto` is a belt-and-suspenders
          fallback for any browser flexbox quirk where `stretch` +
          `h-full` don't compose as expected. The wrapper's min-height
          is left at auto so very short text columns still get at least
          the image's natural height. */}
      <div class="floating-poster h-full w-28 flex-shrink-0 sm:w-36">
        <Show
          when={posterUrl()}
          fallback={
            <div
              class="flex h-full w-full items-center justify-center"
              style={{ background: "var(--glass-bg)" }}
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
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            src={posterUrl()}
            class={`h-full w-full object-cover${posterLoaded() ? " img-loaded" : ""}`}
            loading="eager"
            decoding="async"
            onLoad={() => setPosterLoaded(true)}
            alt=""
            aria-hidden="true"
          />
        </Show>
      </div>

      {/* Title + tagline + quick-meta */}
      <div class="min-w-0 flex-1 pb-1">
        <h1 class="hero-title" id="details-modal-title">
          {title()}
        </h1>

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
                <span class="v2-pill" style={{ "font-size": "0.5rem" }}>
                  {genre}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
