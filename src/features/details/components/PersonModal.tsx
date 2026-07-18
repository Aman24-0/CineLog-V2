// src/features/details/components/PersonModal.tsx
import {
  Show,
  For,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage, fetchPersonDetails, fetchPersonCombinedCredits } from "~/core/tmdb/tmdb";
import { openTitle } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import type { TMDBPerson, TMDBPersonCombinedCredits, TMDBPersonCredit, WatchlistItem } from "~/shared/types";

interface PersonModalProps {
  personId: number;
  personName?: string;
  /** Optional initial profile path — used to show the image instantly while details load. */
  initialProfilePath?: string | null;
  onClose: () => void;
}

type FilterMode = "all" | "movie" | "tv";
type SortMode = "new-to-old" | "old-to-new" | "popular";

/**
 * PersonModal — full-screen person detail modal.
 *
 * Layout (per user request):
 *   Top section:
 *     • Large profile image (left) + name + meta (known_for, birthday,
 *       place_of_birth, biography)
 *     • Close button (X) in the top-right — closes ONLY the person modal
 *       (does NOT close the parent details modal).
 *
 *   Filter + Sort row:
 *     • Two filter buttons: All / Movies / Series
 *     • Sort dropdown: New to old · Old to new · Popular
 *
 *   Grid:
 *     • Poster + title + year + character/job — for each credit in the
 *       person's combined_credits cast array (deduplicated by id).
 *     • Tapping a credit opens the title's Details modal.
 *
 * Data:
 *   - /person/{id}         → person details (biography, birthday, etc.)
 *   - /person/{id}/combined_credits → filmography (movies + TV combined)
 *
 * Architecture:
 *   DetailsCast → PersonModal → useVault (for in-vault check) → openTitle
 */
const PersonModal: Component<PersonModalProps> = (props) => {
  const { watchlist } = useVault();

  const [person, setPerson] = createSignal<TMDBPerson | null>(null);
  const [credits, setCredits] = createSignal<TMDBPersonCombinedCredits | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [filter, setFilter] = createSignal<FilterMode>("all");
  const [sort, setSort] = createSignal<SortMode>("new-to-old");

  onMount(() => {
    document.body.style.overflow = "hidden";
    void loadPerson();
  });
  onCleanup(() => {
    document.body.style.overflow = "";
  });

  const loadPerson = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        fetchPersonDetails(props.personId),
        fetchPersonCombinedCredits(props.personId),
      ]);
      setPerson(p);
      setCredits(c);
    } finally {
      setLoading(false);
    }
  };

  /** Deduplicated, filtered, sorted list of credits to render. */
  const filmography = createMemo<TMDBPersonCredit[]>(() => {
    const c = credits();
    if (!c) return [];
    // Combine cast + crew, dedupe by id (a person can be both cast and
    // crew on the same title).
    const seen = new Set<number>();
    const combined: TMDBPersonCredit[] = [];
    for (const credit of [...c.cast, ...c.crew]) {
      if (seen.has(credit.id)) continue;
      // Skip titles with no poster and no release/air date — these are
      // usually upcoming, unreleased, or incomplete entries that add noise.
      if (!credit.poster_path && !credit.release_date && !credit.first_air_date) continue;
      seen.add(credit.id);
      combined.push(credit);
    }

    // Apply filter
    let filtered = combined;
    const f = filter();
    if (f !== "all") {
      filtered = combined.filter((c2) => c2.media_type === f);
    }

    // Apply sort
    const s = sort();
    const dateOf = (credit: TMDBPersonCredit): number => {
      const d = credit.release_date || credit.first_air_date || "";
      const y = parseInt(d.substring(0, 4), 10);
      return isNaN(y) ? 0 : y;
    };
    const sorted = [...filtered];
    if (s === "new-to-old") {
      sorted.sort((a, b) => dateOf(b) - dateOf(a));
    } else if (s === "old-to-new") {
      sorted.sort((a, b) => dateOf(a) - dateOf(b));
    } else if (s === "popular") {
      sorted.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
    }
    return sorted;
  });

  /** Cast credits only — used to count "appeared in N titles". */
  const castCount = createMemo(() => credits()?.cast.length ?? 0);

  const formatBirthday = (bday?: string | null): string => {
    if (!bday) return "";
    try {
      const d = new Date(bday);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const years = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}` +
        (years > 0 && years < 120 ? ` (${years} years)` : "");
    } catch {
      return bday;
    }
  };

  const handleClickCredit = (credit: TMDBPersonCredit) => {
    // Build a WatchlistItem-shaped baseItem and open the details modal.
    // openTitle handles the in-vault check via findInVault.
    const baseItem: WatchlistItem = {
      id: String(credit.id),
      title: credit.title,
      name: credit.name,
      media_type: credit.media_type,
      poster_path: credit.poster_path,
      backdrop_path: credit.backdrop_path,
      release_date: credit.release_date,
      first_air_date: credit.first_air_date,
      status: "Planned",
    };
    openTitle(baseItem, watchlist());
  };

  const profileUrl = createMemo(() => {
    const path = person()?.profile_path ?? props.initialProfilePath;
    return path ? tmdbImage(path, "w342") : "";
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[9999999] flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.85)" }}
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label={`Person details: ${props.personName ?? person()?.name ?? ""}`}
      >
        <div
          class="person-modal-shell w-full max-w-3xl h-full sm:h-[90vh] sm:max-h-[90vh] flex flex-col modal-sheet-enter"
          style={{
            background: "var(--glass-bg-strong, rgba(12,14,20,0.95))",
            "backdrop-filter": "blur(28px)",
            "-webkit-backdrop-filter": "blur(28px)",
            border: "1px solid var(--hairline-2)",
            "border-radius": "0",
            "box-shadow": "var(--shadow-elevated)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top section: image + close button + meta */}
          <div class="person-modal-top">
            <button
              type="button"
              class="person-modal-close focus-ring"
              onClick={() => props.onClose()}
              aria-label="Close person details"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">
                close
              </span>
            </button>

            <Show when={profileUrl()} fallback={
              <div class="person-modal-avatar-fallback" aria-hidden="true">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "48px", color: "var(--text-dim)" }}
                  aria-hidden="true"
                >
                  person
                </span>
              </div>
            }>
              <img
                src={profileUrl()}
                class="person-modal-avatar"
                alt={person()?.name ?? props.personName ?? ""}
                decoding="async"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </Show>

            <div class="person-modal-info">
              <Show when={!loading()} fallback={
                <div class="person-modal-skeleton" aria-hidden="true">
                  <div class="skeleton-base" style={{ width: "60%", height: "1.5rem", "margin-bottom": "0.5rem" }} />
                  <div class="skeleton-base" style={{ width: "40%", height: "0.875rem" }} />
                </div>
              }>
                <h2 class="person-modal-name">{person()?.name ?? props.personName ?? ""}</h2>
                <Show when={person()?.known_for_department}>
                  <p class="person-modal-known-for">{person()?.known_for_department}</p>
                </Show>
                <div class="person-modal-meta-row">
                  <Show when={formatBirthday(person()?.birthday)}>
                    <span class="person-modal-meta-item">
                      <span class="material-symbols-outlined" style={{ "font-size": "13px" }} aria-hidden="true">cake</span>
                      {formatBirthday(person()?.birthday)}
                    </span>
                  </Show>
                  <Show when={person()?.place_of_birth}>
                    <span class="person-modal-meta-item">
                      <span class="material-symbols-outlined" style={{ "font-size": "13px" }} aria-hidden="true">place</span>
                      {person()?.place_of_birth}
                    </span>
                  </Show>
                  <Show when={castCount() > 0}>
                    <span class="person-modal-meta-item">
                      <span class="material-symbols-outlined" style={{ "font-size": "13px" }} aria-hidden="true">movie</span>
                      {castCount()} credits
                    </span>
                  </Show>
                </div>
                <Show when={person()?.biography}>
                  <p class="person-modal-bio">{person()?.biography}</p>
                </Show>
              </Show>
            </div>
          </div>

          {/* Filter + sort row */}
          <div class="person-modal-controls">
            <div class="person-modal-filter-group" role="group" aria-label="Filter by type">
              <button
                type="button"
                class="person-modal-filter-btn focus-ring"
                data-active={filter() === "all"}
                onClick={() => setFilter("all")}
                aria-pressed={filter() === "all"}
              >All</button>
              <button
                type="button"
                class="person-modal-filter-btn focus-ring"
                data-active={filter() === "movie"}
                onClick={() => setFilter("movie")}
                aria-pressed={filter() === "movie"}
              >Movies</button>
              <button
                type="button"
                class="person-modal-filter-btn focus-ring"
                data-active={filter() === "tv"}
                onClick={() => setFilter("tv")}
                aria-pressed={filter() === "tv"}
              >Series</button>
            </div>
            <div class="person-modal-sort-group">
              <button
                type="button"
                class="person-modal-sort-btn focus-ring"
                data-active={sort() === "new-to-old"}
                onClick={() => setSort("new-to-old")}
                aria-pressed={sort() === "new-to-old"}
              >New to Old</button>
              <button
                type="button"
                class="person-modal-sort-btn focus-ring"
                data-active={sort() === "old-to-new"}
                onClick={() => setSort("old-to-new")}
                aria-pressed={sort() === "old-to-new"}
              >Old to New</button>
              <button
                type="button"
                class="person-modal-sort-btn focus-ring"
                data-active={sort() === "popular"}
                onClick={() => setSort("popular")}
                aria-pressed={sort() === "popular"}
              >Popular</button>
            </div>
          </div>

          {/* Filmography grid */}
          <div class="person-modal-grid-wrap">
            <Show when={!loading()} fallback={
              <div class="person-modal-grid">
                <For each={Array.from({ length: 8 })}>{() => (
                  <div class="skeleton-base" style={{ "aspect-ratio": "2/3", "border-radius": "8px" }} />
                )}</For>
              </div>
            }>
              <Show when={filmography().length > 0} fallback={
                <div class="person-modal-empty">
                  <p class="type-body-soft">No credits found.</p>
                </div>
              }>
                <div class="person-modal-grid">
                  <For each={filmography()}>
                    {(credit) => {
                      const title = () => credit.title || credit.name || "Untitled";
                      const year = () => {
                        const d = credit.release_date || credit.first_air_date || "";
                        return d.substring(0, 4) || "";
                      };
                      const role = () => credit.character || credit.job || "";
                      const posterUrl = () => credit.poster_path ? tmdbImage(credit.poster_path, "w185") : "";
                      return (
                        <button
                          type="button"
                          class="person-modal-credit focus-ring"
                          onClick={() => handleClickCredit(credit)}
                          aria-label={`${title()}${year() ? `, ${year()}` : ""}${role() ? ` — ${role()}` : ""}`}
                        >
                          <div class="person-modal-credit-poster">
                            <Show when={posterUrl()} fallback={
                              <div class="person-modal-credit-poster-fallback" aria-hidden="true">
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "24px", color: "var(--text-dim)" }}
                                  aria-hidden="true"
                                >
                                  {credit.media_type === "tv" ? "tv" : "movie"}
                                </span>
                              </div>
                            }>
                              <img
                                src={posterUrl()}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            </Show>
                          </div>
                          <p class="person-modal-credit-title">{title()}</p>
                          <p class="person-modal-credit-meta">
                            <Show when={year()}><span>{year()}</span></Show>
                            <Show when={year() && role()}><span> · </span></Show>
                            <Show when={role()}><span>{role()}</span></Show>
                          </p>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default PersonModal;
