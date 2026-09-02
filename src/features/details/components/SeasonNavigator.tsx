// src/features/details/components/SeasonNavigator.tsx
import {
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  on,
  Component
} from "solid-js";
import { fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { getEpisodeProgress, resolveSeasons } from "~/shared/utils/progress";
import type { WatchlistItem, TMDBDetails, TMDBEpisode } from "~/shared/types";
import type {
  EpisodeFeedback,
  EpisodeReaction
} from "~/lib/supabase/repositories";
import EpisodeCard from "./EpisodeCard";

interface SeasonNavigatorProps {
  /** TMDB identity — always present */
  item: WatchlistItem;
  details: TMDBDetails | null;
  /**
   * User-owned watchlist item — null when the title is NOT in the watchlist.
   * When null, episode cards show "Add to Watchlist to Track" instead of
   * the watched toggle. The season selector still renders (episode
   * metadata is TMDB data).
   */
  vaultItem?: WatchlistItem | null;
  /** Mark an episode as watched — advances the tracker + upserts progress. */
  onEpisodeChange: (season: number, episode: number) => void;
  /**
   * Unmark an episode — the unwatch direction of the bidirectional
   * toggle (v2.6). The parent (useDetailsProgress.handleEpisodeUnmark)
   * deletes episode_progress records from this position onward and
   * rewinds the tracker to (newTrackerSeason, newTrackerEpisode).
   */
  onEpisodeUnmark: (
    unmarkSeason: number,
    unmarkEpisode: number,
    newTrackerSeason: number,
    newTrackerEpisode: number
  ) => void;
  /** Called when the user taps "Add to Watchlist" on a non-watchlist title's episode */
  onAddToVault: () => void;
  /**
   * Phase 6 Task 2 — Called when the user rates an episode.
   * `rating` is the new rating (1-N) or null to clear. The parent
   * (useDetailsProgress.handleEpisodeRating) persists it to the
   * `episode_progress.rating` column.
   *
   * Optional — when omitted, EpisodeCard hides the rating row.
   */
  onRateEpisode?: (
    season: number,
    episode: number,
    rating: number | null
  ) => void;
  /** Save rating and reaction selected in the episode RATE dialog. */
  onFeedbackEpisode?: (
    season: number,
    episode: number,
    rating: number | null,
    reaction: EpisodeReaction | null
  ) => void;
  /**
   * Phase 6 Task 2 — A map of "S{season}E{episode}" → rating for the
   * current vault item. Used to hydrate each EpisodeCard's stars with
   * the persisted rating. Optional — when omitted, no episode shows a
   * pre-existing rating (the stars start empty).
   */
  episodeRatings?: Map<string, number | null>;
  episodeFeedbacks?: Map<string, EpisodeFeedback>;
}

/**
 * SeasonNavigator — the cinematic episode companion.
 *
 * 2026-09-03 REDESIGN — Nuvio-inspired horizontal layout:
 *   - Seasons render as a COMPACT HORIZONTAL selector (pills). The
 *     selected season has an accent border. Only ONE season's episodes
 *     are visible at a time (no vertical accordion).
 *   - Episodes render as a HORIZONTAL CAROUSEL of compact preview cards.
 *     The carousel uses native CSS overflow-x + scroll-snap — no JS
 *     carousel library. On mobile ~2.5 cards are visible (the next card
 *     peeks to communicate horizontal scrolling). Desktop shows more.
 *   - Each EpisodePreviewCard is a compact vertical card: still image
 *     on top (with E# badge + watched check overlay), title, 2-line
 *     overview, compact metadata row, and icon-only Rate/More actions.
 *
 * ARCHITECTURE (preserved from the previous version):
 *   - Seasons are fetched lazily — only when SELECTED. The selector
 *     caches fetched seasons in a Map so re-selecting is instant.
 *   - The initial selected season is the user's current season (from
 *     vaultItem.season or item.season, defaulting to 1). This replaces
 *     the v2.6 "all collapsed" default — the user immediately sees
 *     their current season's episodes without an extra tap.
 *
 * WATCHING LOGIC (preserved):
 *   The toggle on an episode advances (or rewinds) the tracker. Mark
 *   watched calls `onEpisodeChange(season, episode)` (advances tracker
 *   + upserts episode_progress). Mark unwatched calls `onEpisodeUnmark`
 *   (deletes episode_progress records from this episode onward +
 *   rewinds tracker to the previous episode). Both reuse the parent
 *   `useDetailsProgress` hook as the single source of truth.
 *
 * PERFORMANCE (preserved):
 *   Seasons are fetched lazily — only when selected. The cache dedupes
 *   requests. Loading shows a skeleton carousel. Fetch failures cache
 *   an empty array so the empty-state message shows instead of looping.
 */
const SeasonNavigator: Component<SeasonNavigatorProps> = (props) => {
  const currentSeason = () => props.vaultItem?.season || props.item.season || 1;
  const currentEpisode = () =>
    props.vaultItem?.episode || props.item.episode || 1;

  // ── Selected season state ──────────────────────────────────────────
  // The initial selected season is the user's current season (or 1).
  // This replaces the v2.6 "all collapsed" default — the user sees
  // their current season's episodes immediately.
  const [selectedSeason, setSelectedSeason] = createSignal<number>(
    currentSeason()
  );

  // Cache of fetched season details: seasonNumber -> TMDBEpisode[].
  const [seasonCache, setSeasonCache] = createSignal<
    Map<number, TMDBEpisode[]>
  >(new Map());
  // Set of season numbers currently being fetched.
  const [loadingSeasons, setLoadingSeasons] = createSignal<Set<number>>(
    new Set()
  );

  const seasonList = createMemo(() => {
    const itemForResolve = props.vaultItem || props.item;
    return resolveSeasons(itemForResolve, props.details);
  });

  // Series-wide progress from the shared engine — same value shown on
  // Dashboard, Continue Watching, Vault. Single source of truth.
  const seriesProgress = createMemo(() => {
    const itemForProgress = props.vaultItem || props.item;
    return getEpisodeProgress(itemForProgress, props.details);
  });

  /**
   * Fetch a season's episode list from TMDB and cache it.
   *
   * Idempotent — concurrent calls for the same season number are
   * de-duped via the loadingSeasons Set. Re-fetches are skipped if
   * the season is already in the cache.
   *
   * On fetch failure, an empty array is cached so we don't keep
   * retrying on every render.
   */
  const fetchSeason = async (seasonNumber: number) => {
    if (seasonCache().has(seasonNumber)) return;
    if (loadingSeasons().has(seasonNumber)) return;
    setLoadingSeasons((prev) => {
      const next = new Set(prev);
      next.add(seasonNumber);
      return next;
    });
    try {
      const data = await fetchSeasonDetails(props.item.id, seasonNumber);
      setSeasonCache((prev) => {
        const next = new Map(prev);
        next.set(seasonNumber, data.episodes || []);
        return next;
      });
    } catch (err) {
      console.warn(`Failed to fetch season ${seasonNumber}:`, err);
      setSeasonCache((prev) => {
        const next = new Map(prev);
        next.set(seasonNumber, []);
        return next;
      });
    } finally {
      setLoadingSeasons((prev) => {
        const next = new Set(prev);
        next.delete(seasonNumber);
        return next;
      });
    }
  };

  /**
   * On mount, fetch the initially selected season. Without this, the
   * auto-selected current season would never fetch and the user would
   * see the loading skeleton forever.
   */
  onMount(() => {
    fetchSeason(selectedSeason());
  });

  // When the selected season changes (user taps a different season pill),
  // fetch it if not cached. This is the user's primary entry point to
  // fetching after mount.
  createMemo(
    on(selectedSeason, (seasonNumber) => {
      fetchSeason(seasonNumber);
    })
  );

  /**
   * Select a season — called when the user taps a season pill.
   * Fetches the season if not cached.
   */
  const selectSeason = (seasonNumber: number) => {
    if (seasonNumber === selectedSeason()) return;
    setSelectedSeason(seasonNumber);
  };

  // How many episodes of a given season has the user watched?
  const seasonProgress = (seasonNumber: number) => {
    if (!props.vaultItem) return null;
    const cs = currentSeason();
    const ce = currentEpisode();
    const seasonData = seasonList().find((s) => s.number === seasonNumber);
    if (!seasonData) return null;
    if (
      props.vaultItem.status === "Planned" ||
      props.vaultItem.status === "Plan to Watch"
    ) {
      return { watched: 0, total: seasonData.count };
    }
    if (props.vaultItem.status === "Completed") {
      return { watched: seasonData.count, total: seasonData.count };
    }
    if (seasonNumber < cs)
      return { watched: seasonData.count, total: seasonData.count };
    if (seasonNumber === cs)
      return {
        watched: Math.min(ce, seasonData.count),
        total: seasonData.count
      };
    return { watched: 0, total: seasonData.count };
  };

  /**
   * Handle an episode toggle from EpisodeCard.
   *
   * `newWatched` is the desired state — true = mark as watched,
   * false = mark as unwatched.
   *
   * Mark as watched: call `onEpisodeChange(season, episode)` — the
   * parent upserts the episode_progress record + advances the tracker.
   *
   * Mark as unwatched: call `onEpisodeUnmark(season, episode,
   * newTrackerSeason, newTrackerEpisode)` — the parent deletes the
   * episode_progress records from this episode onward AND rewinds
   * the tracker to the previous episode.
   *
   * Rewind logic:
   *   - Episode N > 1 of season S → rewind to (S, N-1)
   *   - Episode 1 of season S (S > 1) → rewind to (S-1, last ep of S-1)
   *   - Season 1, Episode 1: no-op (can't unwatch the very first episode)
   */
  const handleEpisodeToggle = (ep: TMDBEpisode, newWatched: boolean) => {
    if (newWatched) {
      props.onEpisodeChange(ep.season_number, ep.episode_number);
      return;
    }
    // Unwatch: compute the rewind position, then delegate to the parent.
    if (ep.episode_number > 1) {
      props.onEpisodeUnmark(
        ep.season_number,
        ep.episode_number,
        ep.season_number,
        ep.episode_number - 1
      );
      return;
    }
    // Episode 1 of season N → rewind to last episode of season N-1.
    if (ep.season_number > 1) {
      const prevSeason = seasonList().find(
        (s) => s.number === ep.season_number - 1
      );
      const prevEpCount = prevSeason?.count ?? 1;
      props.onEpisodeUnmark(
        ep.season_number,
        ep.episode_number,
        ep.season_number - 1,
        prevEpCount
      );
    }
    // Season 1, Episode 1: no-op (can't unwatch the very first episode).
  };

  // Episodes for the currently selected season.
  const episodes = createMemo(
    () => seasonCache().get(selectedSeason()) || []
  );
  const isLoading = createMemo(() =>
    loadingSeasons().has(selectedSeason())
  );
  const isFetched = createMemo(() =>
    seasonCache().has(selectedSeason())
  );
  const isFetching = createMemo(() => isLoading() || !isFetched());

  return (
    <div class="season-navigator animate-fade-up">
      {/* Series-wide progress summary — top of the navigator (vault only) */}
      <Show when={props.vaultItem && seriesProgress()}>
        <div class="season-navigator-summary">
          <div class="season-navigator-summary-text">
            <span class="type-micro" style={{ color: "var(--text-muted)" }}>
              Series Progress
            </span>
            <span
              class="type-headline-sm"
              style={{ color: "var(--text-strong)" }}
            >
              {seriesProgress()?.label}
            </span>
          </div>
          <div class="season-navigator-summary-pct">
            <span
              class="type-headline-sm"
              style={{ color: "var(--p)", "font-weight": 800 }}
            >
              {seriesProgress()?.pct ?? 0}%
            </span>
          </div>
        </div>
        <div class="progress-premium season-navigator-bar">
          <div
            class="progress-glass-fill"
            style={{ width: `${seriesProgress()?.pct ?? 0}%` }}
          />
        </div>
        <Show
          when={
            seriesProgress()?.seriesLabel &&
            seriesProgress()!.seriesLabel !== "—"
          }
        >
          <p
            class="type-micro"
            style={{ color: "var(--text-dim)", "margin-top": "0.375rem" }}
          >
            {seriesProgress()!.seriesLabel}
          </p>
        </Show>
      </Show>

      {/* ── Season selector — horizontal compact pills ───────────────
          Replaces the vertical accordion. Only one season is selected
          at a time. The selector is horizontally scrollable on mobile
          if there are many seasons. */}
      <div
        class="season-selector"
        role="tablist"
        aria-label="Season selection"
      >
        <For each={seasonList()}>
          {(season) => {
            const isSelected = () => selectedSeason() === season.number;
            const isCurrent = () => currentSeason() === season.number;
            const progress = () => seasonProgress(season.number);
            return (
              <button
                type="button"
                class={`season-selector-pill${isSelected() ? " season-selector-pill-selected" : ""}`}
                role="tab"
                aria-selected={isSelected()}
                onClick={() => selectSeason(season.number)}
                aria-label={`Season ${season.number} — ${season.count} episodes${
                  progress() ? `, ${progress()!.watched} watched` : ""
                }`}
              >
                <Show when={isCurrent()}>
                  <span
                    class="season-selector-pill-dot"
                    aria-hidden="true"
                  />
                </Show>
                <span class="season-selector-pill-label">
                  Season {season.number}
                </span>
                <span class="season-selector-pill-meta">
                  {season.count} ep
                  <Show when={progress()}>
                    {" · "}
                    {progress()!.watched}/{progress()!.total}
                  </Show>
                </span>
              </button>
            );
          }}
        </For>
      </div>

      {/* ── Episode carousel — horizontal scroll for the selected season ──
          Render tree:
            - Has episodes → horizontal carousel of EpisodeCards
            - Fetching (loading OR not yet fetched) → skeleton carousel
            - Fetched but empty → "No episode data available"
          The carousel uses native CSS overflow-x: auto + scroll-snap.
          No JS carousel library. Mobile shows ~2.5 cards (the next card
          peeks to communicate horizontal scrolling). Desktop shows more. */}
      <Show
        when={episodes().length > 0}
        fallback={
          <Show
            when={isFetching()}
            fallback={
              <p
                class="season-carousel-empty type-micro"
                style={{ color: "var(--text-muted)" }}
              >
                No episode data available.
              </p>
            }
          >
            <div class="season-carousel-skeleton" aria-hidden="true">
              <For each={[1, 2, 3]}>
                {() => <div class="season-carousel-skeleton-card" />}
              </For>
            </div>
          </Show>
        }
      >
        <div
          class="episode-carousel"
          role="list"
          aria-label={`Episodes for season ${selectedSeason()}`}
        >
          <For each={episodes()}>
            {(ep) => (
              <EpisodeCard
                episode={ep}
                isCurrent={
                  currentSeason() === ep.season_number &&
                  currentEpisode() === ep.episode_number
                }
                isWatched={
                  !!props.vaultItem &&
                  (props.vaultItem.status === "Completed" ||
                    (props.vaultItem.status !== "Planned" &&
                      props.vaultItem.status !== "Plan to Watch" &&
                      (currentSeason() > ep.season_number ||
                        (currentSeason() === ep.season_number &&
                          currentEpisode() >= ep.episode_number))))
                }
                inVault={!!props.vaultItem}
                rating={
                  props.episodeRatings?.get(
                    `S${ep.season_number}E${ep.episode_number}`
                  ) ?? null
                }
                onToggle={(newWatched) =>
                  handleEpisodeToggle(ep, newWatched)
                }
                onAddToVault={() => props.onAddToVault()}
                onRate={
                  props.onRateEpisode
                    ? (rating) =>
                        props.onRateEpisode?.(
                          ep.season_number,
                          ep.episode_number,
                          rating
                        )
                    : undefined
                }
                feedback={props.episodeFeedbacks?.get(
                  `S${ep.season_number}E${ep.episode_number}`
                )}
                onFeedback={
                  props.onFeedbackEpisode
                    ? (rating, reaction) =>
                        props.onFeedbackEpisode?.(
                          ep.season_number,
                          ep.episode_number,
                          rating,
                          reaction
                        )
                    : undefined
                }
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default SeasonNavigator;
