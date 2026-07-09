// src/features/details/components/SeasonNavigator.tsx
import { For, Show, createSignal, createMemo, Component } from "solid-js";
import { fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { getEpisodeProgress, resolveSeasons } from "~/shared/utils/progress";
import type { WatchlistItem, TMDBDetails, TMDBEpisode } from "~/shared/types";
import EpisodeCard from "./EpisodeCard";

interface SeasonNavigatorProps {
  /** TMDB identity — always present */
  item: WatchlistItem;
  details: TMDBDetails | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * When null, episode cards show "Add to Vault to Track" instead of
   * "Mark as Watched". The season accordion still renders (episode
   * metadata is TMDB data).
   */
  vaultItem?: WatchlistItem | null;
  /** Called when the user marks an episode as watched (vault titles only) */
  onEpisodeChange: (season: number, episode: number) => void;
  /** Called when the user taps "Add to Vault" on a non-vault title's episode */
  onAddToVault: () => void;
}

/**
 * SeasonNavigator — the cinematic episode companion.
 *
 * Replaces the old +/- EpisodeTracker with a spatial episode map.
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
 *     air date, overview, vote average, and a "Mark as Watched" action.
 *
 * WATCHING LOGIC:
 *   "Mark as Watched" on an episode advances the tracker to THAT exact
 *   episode via `onEpisodeChange(season, episode)`. This reuses the
 *   single source of truth — no duplicate progress logic.
 *
 * PERFORMANCE:
 *   Seasons are fetched lazily — only when expanded. The accordion
 *   caches fetched seasons in a Map so re-expanding is instant.
 */
const SeasonNavigator: Component<SeasonNavigatorProps> = (props) => {
  const currentSeason = () => props.vaultItem?.season || props.item.season || 1;
  const currentEpisode = () => props.vaultItem?.episode || props.item.episode || 1;

  const [expandedSeasons, setExpandedSeasons] = createSignal<Set<number>>(
    new Set([currentSeason()]),
  );

  // Cache of fetched season details: seasonNumber -> TMDBEpisode[]
  const [seasonCache, setSeasonCache] = createSignal<Map<number, TMDBEpisode[]>>(
    new Map(),
  );
  const [loadingSeason, setLoadingSeason] = createSignal<number | null>(null);

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

  const toggleSeason = async (seasonNumber: number) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });

    if (!seasonCache().has(seasonNumber) && !loadingSeason()) {
      setLoadingSeason(seasonNumber);
      try {
        const data = await fetchSeasonDetails(props.item.id, seasonNumber);
        setSeasonCache((prev) => {
          const next = new Map(prev);
          next.set(seasonNumber, data.episodes || []);
          return next;
        });
      } catch (err) {
        console.warn(`Failed to fetch season ${seasonNumber}:`, err);
      } finally {
        setLoadingSeason(null);
      }
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
            class="progress-premium-fill"
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
            const isLoading = () => loadingSeason() === season.number;
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

                {/* Episode list — lazily fetched */}
                <Show when={isExpanded()}>
                  <Show
                    when={!isLoading() && episodes().length > 0}
                    fallback={
                      <Show
                        when={isLoading()}
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
                            onMarkWatched={() =>
                              props.onEpisodeChange(ep.season_number, ep.episode_number)
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
