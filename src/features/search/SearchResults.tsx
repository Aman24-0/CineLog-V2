// src/features/search/SearchResults.tsx
import { For, Show, createSignal, type Accessor } from "solid-js";
import type { TMDBTitle, TMDBPerson } from "~/shared/types";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SearchResultRow from "./SearchResultRow";
import SearchEmptyState from "./SearchEmptyState";
import SearchLoading from "./SearchLoading";
import PersonModal from "~/features/details/components/PersonModal";
import { ErrorState } from "~/shared/ui/states";

/**
 * SearchResults — active query results (text search, not genre browse).
 *
 * Renders loading skeletons while in flight, an empty state when no
 * results, or grouped sections (Movies / Series / People) when results
 * exist.
 *
 * Phase 5 — Anime Fallback:
 *   When the main TMDB search returns 0 results AND the query looks
 *   anime-related, the parent (useSearch) fires an AniList search and
 *   passes the results as `animeResults`. We render them as a separate
 *   "Anime Results" section so the user can distinguish them from TMDB.
 *
 * Phase 6.2 Task 4a — AniList Merge:
 *   When the query looks anime-related, AniList results are now MERGED
 *   into the Movies/Series sections (deduped by TMDB id) instead of
 *   only being shown when TMDB returns 0. The separate Anime section
 *   still appears when TMDB returns 0 (so the user knows the source).
 *
 * Phase 6.2 Task 4b — People:
 *   People results from TMDB /search/person are rendered as a "People"
 *   section. Each row shows the person's profile image + name + known-
 *   for department. Tapping a row opens the PersonModal (lazy-loaded)
 *   which shows the person's full filmography with links back to titles.
 */
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
}

export default function SearchResults(props: SearchResultsProps) {
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
        {/* TMDB results — Movies + Series */}
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
              <div class="search-results-list">
                <For each={props.results().movies}>
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
              <div class="search-results-list">
                <For each={props.results().series}>
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
            </section>
          </Show>
        </Show>

        {/* Phase 6.2 Task 4b — People section.
            Renders when TMDB /search/person returned any results. Each
            row is a tappable person card that opens the PersonModal. */}
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
            <div class="search-results-list">
              <For each={props.results().people}>
                {(person) => (
                  <button
                    type="button"
                    class="search-person-row focus-ring"
                    onClick={() =>
                      setOpenPerson({
                        id: person.id,
                        name: person.name,
                        profilePath: person.profile_path
                      })
                    }
                    aria-label={`View filmography for ${person.name}`}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "12px",
                      width: "100%",
                      padding: "10px 12px",
                      "border-radius": "12px",
                      border: "1px solid var(--hairline)",
                      background: "var(--glass-bg-strong)",
                      cursor: "pointer",
                      "text-align": "left",
                      transition: "background 150ms ease-out"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--glass-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "var(--glass-bg-strong)";
                    }}
                  >
                    {/* Profile image — 40×40 circle with fallback */}
                    <Show
                      when={person.profile_path}
                      fallback={
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            "border-radius": "9999px",
                            background: "var(--glass-bg)",
                            display: "flex",
                            "align-items": "center",
                            "justify-content": "center",
                            "flex-shrink": "0"
                          }}
                          aria-hidden="true"
                        >
                          <span
                            class="material-symbols-outlined"
                            style={{
                              "font-size": "20px",
                              color: "var(--text-dim)"
                            }}
                          >
                            person
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(person.profile_path!, "w92")}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: "40px",
                          height: "40px",
                          "border-radius": "9999px",
                          "object-fit": "cover",
                          "flex-shrink": "0"
                        }}
                        onError={(e) => {
                          // Hide broken image — the fallback avatar
                          // would be ideal but swapping DOM is complex
                          // inline; just hide instead.
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    </Show>
                    <div style={{ "min-width": "0", flex: "1" }}>
                      <p
                        style={{
                          "font-size": "0.875rem",
                          "font-weight": 600,
                          color: "var(--text)",
                          margin: "0",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap"
                        }}
                      >
                        {person.name}
                      </p>
                      <Show when={person.known_for_department}>
                        <p
                          style={{
                            "font-size": "0.6875rem",
                            color: "var(--text-soft)",
                            margin: "2px 0 0 0"
                          }}
                        >
                          {person.known_for_department}
                        </p>
                      </Show>
                    </div>
                    <span
                      class="material-symbols-outlined"
                      style={{
                        "font-size": "16px",
                        color: "var(--text-dim)",
                        "flex-shrink": "0"
                      }}
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

        {/* Anime fallback (Phase 5) — shown when TMDB returns 0 results
            but AniList found anime. Rendered as its own labeled section
            so the user can tell the results came from a different source.
            Phase 6.2 Task 4a: when TMDB has results, AniList titles are
            merged INTO the Movies/Series sections above (no separate
            section). This block only renders in the TMDB-returned-0 case. */}
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
            <div class="search-results-list">
              <For each={props.animeResults!()}>
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
          </section>
        </Show>

        {/* Anime fallback loading state — shown briefly while AniList
            is being queried, only when TMDB returned nothing. */}
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

        {/* Empty state — only when TMDB, AniList, AND People all
            returned nothing. */}
        <Show when={showEmptyState()}>
          <SearchEmptyState query={props.query()} />
        </Show>
      </Show>

      {/* Phase 6.2 Task 4b — PersonModal. Rendered via Portal when the
          user taps a person row. The modal is lazy-loaded by the import
          at the top of this file (PersonModal is only bundled when the
          SearchResults component is rendered, which is fine because
          SearchResults is itself lazy-loaded by the SearchOverlay). */}
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
