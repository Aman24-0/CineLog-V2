// src/features/details/components/SeasonNavigator.tsx
import { For, Show, createSignal, createMemo, onMount, Component } from "solid-js";
import { fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { getEpisodeProgress, resolveSeasons } from "~/shared/utils/progress";
import type { WatchlistItem, TMDBDetails, TMDBEpisode } from "~/shared/types";
import EpisodeCard from "./EpisodeCard";

interface SeasonNavigatorProps {
  /** TMDB identity — always present */
  item: WatchlistItem;
  details: TMDBDetails | null;
  /**
   * User-owned watchlist item — null when the title is NOT in the watchlist.
   * When null, episode cards show "Add to Watchlist to Track" instead of
   * the watched toggle. The season accordion still renders (episode
   * metadata is TMDB data).
   */
  vaultItem?: WatchlistItem | null;
  /** Called when the user toggles an episode's watched state (watchlist titles only) */
  onEpisodeChange: (season: number, episode: number) => void;
  /** Called when the user taps "Add to Watchlist" on a non-watchlist title's episode */
  onAddToVault: () => void;
}

/**
 * SeasonNavigator — the cinematic episode companion.
 *
 * Replaces the old +/- Episode tracker with a spatial episode map.
 * The tracker is the *state*; this is the *map*. They're now one surface.
 *
 * ARCHITECTURE:
 *   - Seasons render as an expandable accordion (collapsed by default;
 *     the user's current season auto-expands on mount).
 *   - Each season header shows: season number, episode count, and the
 *     user's progress through that season (vault titles only).
 *   - Expanding a season lazily fetches its episode list from TMDB
 *     (fetchSeasonDetails) and renders EpisodeCards (see EpisodeCard.tsx).
 *   - Each EpisodeCard shows: still, episode number, title, runtime,
 *     air date, overview, vote average, and a right-aligned circular
 *     watched toggle.
 *
 * WATCHING LOGIC:
 *   The toggle on an episode advances (or rewinds) the tracker to THAT
 *   exact episode via `onEpisodeChange(season, episode)`. This reuses
 *   the single source of truth — no duplicate progress logic.
 *
 * PERFORMANCE:
 *   Seasons are fetched lazily — only when expanded. The accordion
 *   caches fetched seasons in a Map so re-expanding is instant.
 *
 * v2.5 — FIXED THE "DOUBLE-CLICK" BUG:
 *   Previously, the auto-expanded currentSeason (initial state of
 *   expandedSeasons) never triggered a fetch, because toggleSeason
 *   was the only place fetchSeasonDetails was called and toggleSeason
 *   is never invoked for the initial state. The user saw
 *   "No episode data available" until they collapsed + re-expanded
 *   the season.
 *
 *   The fix has three parts:
 *     1. `onMount` fetches any seasons already in expandedSeasons
 *        (typically just currentSeason), so the auto-expanded season
 *        starts loading immediately.
 *     2. `toggleSeason` calls `fetchSeason` whenever it expands a
 *        season that isn't cached yet.
 *     3. The render logic treats "expanded but not yet cached and not
 *        loading" as "loading" (shows skeleton) instead of "empty"
 *        (shows "No episode data available"). This covers the brief
 *        async window between mounting and the fetch starting, so
 *        users never see a misleading "no data" flash.
 *
 *   Additionally, `loadingSeason` was changed from a single number to
 *   a Set (`loadingSeasons`) so multiple seasons can fetch concurrently
 *   without blocking each other — important when the user rapidly
 *   expands several seasons in a row.
 */
const SeasonNavigator: Component<SeasonNavigatorProps> = (props) => {
  const currentSeason = () => props.vaultItem?.season || props.item.season || 1;
  const currentEpisode = () => props.vaultItem?.episode || props.item.episode || 1;

  const [expandedSeasons, setExpandedSeasons] = createSignal<Set<number>>(
    new Set([currentSeason()]),
  );

  // Cache of fetched season details: seasonNumber -> TMDBEpisode[].
  // Once a season is in this map (even with an empty array), it's
  // considered "fetched" — we won't re-fetch it. The empty-state
  // message ("No episode data available") only shows for seasons that
  // ARE in the cache but have zero episodes.
  const [seasonCache, setSeasonCache] = createSignal<Map<number, TMDBEpisode[]>>(
    new Map(),
  );
  // Set of season numbers currently being fetched. Using a Set (instead
  // of a single number) lets multiple seasons fetch concurrently —
  // previously expanding Season 2 while Season 1 was still loading
  // would silently skip the Season 2 fetch because `loadingSeason`
  // was non-null.
  const [loadingSeasons, setLoadingSeasons] = createSignal<Set<number>>(
    new Set(),
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
   * the season is already in the cache (even with an empty array,
   * which represents "fetched but TMDB had no episodes for this
   * season" — e.g. an upcoming season with no episode list yet).
   *
   * On fetch failure, an empty array is cached so we don't keep
   * retrying on every render — the user can collapse + re-expand to
   * retry manually if they suspect it was a transient network issue.
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
      // Cache an empty array on failure so we don't loop —
      // the empty-state message will show instead of the skeleton.
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
   * On mount, fetch any seasons that are already expanded. The initial
   * state has currentSeason expanded — without this, the auto-expanded
   * current season would never fetch (toggleSeason is never called for
   * the initial state) and the user would see the loading skeleton
   * forever (or, before the render-logic fix, "No episode data
   * available" until they collapsed + re-expanded).
   */
  onMount(() => {
    for (const seasonNumber of expandedSeasons()) {
      fetchSeason(seasonNumber);
    }
  });

  /**
   * Toggle a season's expanded state. When EXPANDING a season that
   * isn't cached, immediately kick off the fetch — this is the user's
   * primary entry point to fetching after mount.
   *
   * The fetch is fire-and-forget: fetchSeason is idempotent and
   * internally de-dupes, so calling it speculatively is safe.
   */
  const toggleSeason = (seasonNumber: number) => {
    const wasExpanded = expandedSeasons().has(seasonNumber);
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
    // Only fetch when expanding — collapsing doesn't need data.
    if (!wasExpanded) {
      fetchSeason(seasonNumber);
    }
  };

  // How many episodes of a given season has the user watched?
  const seasonProgress = (seasonNumber: number) => {
    if (!props.vaultItem) return null;
    const cs = currentSeason();
    const ce = currentEpisode();
    const seasonData = seasonList().find((s) => s.number === seasonNumber);
    if (!seasonData) return null;
    if (seasonNumber < cs) return { watched: seasonData.count, total: seasonData.count };
    if (seasonNumber === cs) return { watched: Math.min(ce, seasonData.count), total: seasonData.count };
    return { watched: 0, total: seasonData.count };
  };

  /**
   * Handle an episode toggle from EpisodeCard.
   *
   * `newWatched` is the desired state — true = mark as watched,
   * false = mark as unwatched.
   *
   * Mark as watched: set tracker to this episode. The episode becomes
   * the new "current" (in-progress) episode, and all prior episodes
   * are considered watched.
   *
   * Mark as unwatched: set tracker to the PREVIOUS episode. The
   * clicked episode becomes "unwatched" (after the new tracker
   * position). If this is episode 1 of season N, the tracker moves
   * to the last episode of season N-1. If this is season 1 episode 1,
   * unwatching is a no-op (can't go before the start of the series).
   *
   * Both directions reuse `onEpisodeChange` — the parent
   * (useDetailsProgress.handleEpisodeChange) is the single source of
   * truth for persisting tracker changes to Supabase.
   */
  const handleEpisodeToggle = (ep: TMDBEpisode, newWatched: boolean) => {
    if (newWatched) {
      props.onEpisodeChange(ep.season_number, ep.episode_number);
      return;
    }
    // Unwatch: rewind tracker to the previous episode.
    if (ep.episode_number > 1) {
      props.onEpisodeChange(ep.season_number, ep.episode_number - 1);
      return;
    }
    // Episode 1 of season N → rewind to last episode of season N-1.
    if (ep.season_number > 1) {
      const prevSeason = seasonList().find((s) => s.number === ep.season_number - 1);
      const prevEpCount = prevSeason?.count ?? 1;
      props.onEpisodeChange(ep.season_number - 1, prevEpCount);
    }
    // Season 1, Episode 1: no-op (can't unwatch the very first episode).
  };

  return (
    <div class="season-navigator animate-fade-up">
      {/* Series-wide progress summary — top of the navigator */}
      <Show when={props.vaultItem && seriesProgress()}>
        <div class="season-navigator-summary">
          <div class="season-navigator-summary-text">
            <span class="type-micro" style={{ color: "var(--text-muted)" }}>Series Progress</span>
            <span class="type-headline-sm" style={{ color: "var(--text-strong)" }}>
              {seriesProgress()?.label}
            </span>
          </div>
          <div class="season-navigator-summary-pct">
            <span class="type-headline-sm" style={{ color: "var(--p)", "font-weight": 800 }}>
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
        <Show when={seriesProgress()?.seriesLabel && seriesProgress()!.seriesLabel !== "—"}>
          <p class="type-micro" style={{ color: "var(--text-dim)", "margin-top": "0.375rem" }}>
            {seriesProgress()!.seriesLabel}
          </p>
        </Show>
      </Show>

      {/* Season accordion */}
      <div class="season-navigator-list">
        <For each={seasonList()}>
          {(season) => {
            const isExpanded = () => expandedSeasons().has(season.number);
            const episodes = () => seasonCache().get(season.number) || [];
            const isLoading = () => loadingSeasons().has(season.number);
            // "Has this season been fetched at least once?" — once true,
            // the empty-state message can show. Before this is true,
            // we show the loading skeleton even if isLoading() is false
            // (covers the brief async window between mount/expand and
            // the fetch starting).
            const isFetched = () => seasonCache().has(season.number);
            const isFetching = () => isLoading() || !isFetched();
            const progress = () => seasonProgress(season.number);
            const isCurrent = () => currentSeason() === season.number;

            return (
              <div
                class={`season-accordion${isExpanded() ? " season-accordion-expanded" : ""}${
                  isCurrent() ? " season-accordion-current" : ""
                }`}
              >
                <button
                  type="button"
                  class="season-accordion-header"
                  onClick={() => toggleSeason(season.number)}
                  aria-expanded={isExpanded()}
                  aria-label={`Season ${season.number} — ${season.count} episodes${
                    progress() ? `, ${progress()!.watched} watched` : ""
                  }`}
                >
                  <div class="season-accordion-header-text">
                    <span class="season-accordion-title">
                      <Show when={isCurrent()}>
                        <span class="season-accordion-current-dot" aria-hidden="true" />
                      </Show>
                      Season {season.number}
                    </span>
                    <span class="season-accordion-meta">
                      {season.count} episode{season.count !== 1 ? "s" : ""}
                      <Show when={progress()}>
                        {" · "}{progress()!.watched}/{progress()!.total} watched
                      </Show>
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined season-accordion-chevron"
                    style={{ transform: isExpanded() ? "rotate(180deg)" : "none" }}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>

                {/* Episode list — lazily fetched.
                    Render tree:
                      - Expanded AND has episodes → episode list
                      - Expanded AND fetching (loading OR not yet fetched) → skeleton
                      - Expanded AND fetched but empty → "No episode data available"
                    The "fetching" branch covers the brief async window between
                    mount/expand and the fetch starting, so users never see a
                    misleading "no data" flash on first expansion. */}
                <Show when={isExpanded()}>
                  <Show
                    when={episodes().length > 0}
                    fallback={
                      <Show
                        when={isFetching()}
                        fallback={
                          <p
                            class="season-accordion-empty type-micro"
                            style={{ color: "var(--text-muted)" }}
                          >
                            No episode data available.
                          </p>
                        }
                      >
                        <div class="season-accordion-loading" aria-hidden="true">
                          <For each={[1, 2, 3]}>
                            {() => <div class="season-accordion-skeleton" />}
                          </For>
                        </div>
                      </Show>
                    }
                  >
                    <div class="episode-list">
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
                              (currentSeason() > ep.season_number ||
                                (currentSeason() === ep.season_number &&
                                  currentEpisode() > ep.episode_number))
                            }
                            inVault={!!props.vaultItem}
                            onToggle={(newWatched) =>
                              handleEpisodeToggle(ep, newWatched)
                            }
                            onAddToVault={() => props.onAddToVault()}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default SeasonNavigator;
