// src/features/search/SearchResults.tsx
import { For, Show, createSignal, type Accessor } from "solid-js";
import type { TMDBTitle, TMDBPerson } from "~/shared/types";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SearchResultRow from "./SearchResultRow";
import SearchResultCard from "./SearchResultCard";
import SearchEmptyState from "./SearchEmptyState";
import SearchLoading from "./SearchLoading";
import PersonModal from "~/features/details/components/PersonModal";
import { ErrorState } from "~/shared/ui/states";
import type { SearchViewMode } from "./searchViewMode";

/**
 * SearchResults — renders the active query's results.
 *
 * TWO MODES:
 *
 *   1. TABBED (the /search route). The page passes `activeTab` + `viewMode`
 *      + `limit`. Only the selected tab (Movies / Series / People) renders,
 *      sliced to `limit` so the page can page in 10 results at a time as
 *      the user scrolls, and in either list or card layout.
 *
 *   2. LEGACY ALL-SECTIONS (the contextual SearchOverlay). When `activeTab`
 *      is omitted every section renders stacked, exactly as before — the
 *      overlay has no room for tabs.
 *
 * People rows always open the PersonModal (filmography); title rows and
 * cards are real router links to /movie/:id or /tv/:id.
 */
export type SearchTab = "movie" | "tv" | "person";

export interface SearchResultsProps {
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  query: Accessor<string>;
  results: Accessor<{
    movies: TMDBTitle[];
    series: TMDBTitle[];
    people: TMDBPerson[];
    totalCount: number;
  }>;
  isInVault: (t: TMDBTitle) => boolean;
  onOpenTitle: (t: TMDBTitle) => void;
  onAddToVault: (t: TMDBTitle) => void;
  onRetry?: () => void;
  /** Phase 5 — AniList fallback results (TMDB-shaped). */
  animeResults?: Accessor<TMDBTitle[]>;
  /** Phase 5 — true while the AniList fallback is in flight. */
  animeLoading?: Accessor<boolean>;
  /** Tabbed mode — which tab is active. Omit for the legacy stacked view. */
  activeTab?: Accessor<SearchTab>;
  /** Tabbed mode — list or card layout. Defaults to "list". */
  viewMode?: Accessor<SearchViewMode>;
  /** Tabbed mode — how many results of the active tab to render. */
  limit?: Accessor<number>;
}

export default function SearchResults(props: SearchResultsProps) {
  const tabbed = () => props.activeTab !== undefined;
  const activeTab = (): SearchTab => props.activeTab?.() ?? "movie";
  const viewMode = (): SearchViewMode => props.viewMode?.() ?? "list";
  const limit = () => props.limit?.() ?? Number.MAX_SAFE_INTEGER;

  const hasAnimeResults = () => (props.animeResults?.() ?? []).length > 0;
  const showAnimeLoading = () => !!props.animeLoading?.() && !hasAnimeResults();
  const hasPeople = () => (props.results().people?.length ?? 0) > 0;
  const showEmptyState = () =>
    props.results().totalCount === 0 &&
    !hasAnimeResults() &&
    !showAnimeLoading() &&
    !hasPeople();

  // Phase 6.2 Task 4b — PersonModal state. When the user taps a person
  // row, we set `openPerson` to { id, name, profilePath } and render
  // the PersonModal via Portal. The modal fetches person details +
  // combined_credits on mount and shows the full filmography.
  const [openPerson, setOpenPerson] = createSignal<{
    id: number;
    name?: string;
    profilePath?: string | null;
  } | null>(null);

  const openPersonModal = (person: TMDBPerson) =>
    setOpenPerson({
      id: person.id,
      name: person.name,
      profilePath: person.profile_path
    });

  /**
   * Titles for the active tab, sliced to the visible window.
   * Anime fallback titles are folded in when TMDB itself returned nothing
   * (they already live in movies/series when TMDB had results).
   */
  const tabTitles = (): TMDBTitle[] => {
    const r = props.results();
    const base =
      activeTab() === "tv"
        ? r.series
        : activeTab() === "movie"
          ? r.movies
          : [];
    if (base.length === 0) {
      const anime = props.animeResults?.() ?? [];
      return anime.filter((t) =>
        activeTab() === "tv" ? t.media_type === "tv" : t.media_type === "movie"
      );
    }
    return base;
  };

  const visibleTitles = () => tabTitles().slice(0, limit());
  const visiblePeople = () => props.results().people.slice(0, limit());

  const titleList = (items: TMDBTitle[]) => (
    <div class="search-results-list">
      <For each={items}>
        {(t) => (
          <SearchResultRow
            title={t}
            inVault={props.isInVault(t)}
            onOpen={() => props.onOpenTitle(t)}
            onAdd={() => props.onAddToVault(t)}
          />
        )}
      </For>
    </div>
  );

  const titleGrid = (items: TMDBTitle[]) => (
    <div class="search-results-grid">
      <For each={items}>
        {(t) => (
          <SearchResultCard
            title={t}
            inVault={props.isInVault(t)}
            onOpen={() => props.onOpenTitle(t)}
            onAdd={() => props.onAddToVault(t)}
          />
        )}
      </For>
    </div>
  );

  const peopleList = (items: TMDBPerson[]) => (
    <div class="search-results-list">
      <For each={items}>
        {(person) => (
          <button
            type="button"
            class="search-person-row focus-ring"
            onClick={() => openPersonModal(person)}
            aria-label={`View filmography for ${person.name}`}
          >
            <Show
              when={person.profile_path}
              fallback={
                <div class="search-person-avatar" aria-hidden="true">
                  <span class="material-symbols-outlined">person</span>
                </div>
              }
            >
              <img
                class="search-person-avatar"
                src={tmdbImage(person.profile_path!, "w92")}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </Show>
            <div class="search-person-info">
              <p class="search-person-name">{person.name}</p>
              <Show when={person.known_for_department}>
                <p class="search-person-dept">{person.known_for_department}</p>
              </Show>
            </div>
            <span class="material-symbols-outlined search-person-chevron">
              chevron_right
            </span>
          </button>
        )}
      </For>
    </div>
  );

  const tabCount = () => {
    if (activeTab() === "person") return props.results().people.length;
    return tabTitles().length;
  };

  return (
    <Show
      when={!props.error()}
      fallback={
        <ErrorState
          icon="cloud_off"
          title="Search failed"
          message={props.error() ?? undefined}
          retryable={true}
          onRetry={() => props.onRetry?.()}
          variant="section"
        />
      }
    >
      <Show when={!props.loading()} fallback={<SearchLoading count={4} />}>
        {/* ── TABBED MODE (/search route) ─────────────────────────── */}
        <Show when={tabbed()}>
          <Show
            when={props.results().totalCount > 0 || hasAnimeResults()}
            fallback={<SearchEmptyState query={props.query()} />}
          >
            <Show
              when={tabCount() > 0}
              fallback={
                <div class="search-tab-empty">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    search_off
                  </span>
                  <p>
                    No {activeTab() === "person"
                      ? "people"
                      : activeTab() === "tv"
                        ? "series"
                        : "movies"}{" "}
                    matched “{props.query()}”.
                  </p>
                </div>
              }
            >
              <Show when={activeTab() === "person"}>
                {peopleList(visiblePeople())}
              </Show>
              <Show when={activeTab() !== "person"}>
                <Show
                  when={viewMode() === "card"}
                  fallback={titleList(visibleTitles())}
                >
                  {titleGrid(visibleTitles())}
                </Show>
              </Show>
            </Show>
          </Show>
        </Show>

        {/* ── LEGACY ALL-SECTIONS MODE (SearchOverlay) ────────────── */}
        <Show when={!tabbed()}>
          <Show when={props.results().totalCount > 0}>
            {/* Movies */}
            <Show when={props.results().movies.length > 0}>
              <section class="search-section">
                <div class="search-section-label">
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "12px", color: "var(--p)" }}
                    aria-hidden="true"
                  >
                    movie
                  </span>
                  Movies ({props.results().movies.length})
                </div>
                {titleList(props.results().movies)}
              </section>
            </Show>

            {/* Series */}
            <Show when={props.results().series.length > 0}>
              <section class="search-section">
                <div class="search-section-label">
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "12px", color: "var(--p)" }}
                    aria-hidden="true"
                  >
                    tv
                  </span>
                  Series ({props.results().series.length})
                </div>
                {titleList(props.results().series)}
              </section>
            </Show>
          </Show>

          {/* People section */}
          <Show when={hasPeople()}>
            <section class="search-section">
              <div class="search-section-label">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "12px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  person
                </span>
                People ({props.results().people.length})
              </div>
              {peopleList(props.results().people)}
            </section>
          </Show>

          {/* Anime fallback — TMDB returned 0, AniList found matches. */}
          <Show when={hasAnimeResults()}>
            <section class="search-section">
              <div class="search-section-label">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "12px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  whatshot
                </span>
                Anime Results ({props.animeResults!().length})
              </div>
              {titleList(props.animeResults!())}
            </section>
          </Show>

          {/* Anime fallback loading state */}
          <Show when={showAnimeLoading()}>
            <section class="search-section">
              <div class="search-section-label">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "12px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  whatshot
                </span>
                Searching AniList…
              </div>
              <SearchLoading count={3} />
            </section>
          </Show>

          {/* Empty state — TMDB, AniList AND People all returned nothing. */}
          <Show when={showEmptyState()}>
            <SearchEmptyState query={props.query()} />
          </Show>
        </Show>
      </Show>

      {/* Phase 6.2 Task 4b — PersonModal (filmography). */}
      <Show when={openPerson()}>
        {(p) => (
          <PersonModal
            personId={p().id}
            personName={p().name}
            initialProfilePath={p().profilePath ?? null}
            onClose={() => setOpenPerson(null)}
          />
        )}
      </Show>
    </Show>
  );
}
