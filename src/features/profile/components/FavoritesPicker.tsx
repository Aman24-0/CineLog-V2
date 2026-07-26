// src/features/profile/components/FavoritesPicker.tsx
import { Show, createSignal, For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { FavoriteSlot } from "./TasteCard";

interface FavoritesPickerProps {
  open: boolean;
  slot: FavoriteSlot | null;
  onClose: () => void;
  onSelect: (slot: FavoriteSlot, id: string, label: string) => void;
}

// ---------------------------------------------------------------------------
// TMDB genre list — for the genre picker
// ---------------------------------------------------------------------------

const GENRES: { id: number; name: string }[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

/**
 * FavoritesPicker — a modal for choosing a favorite.
 *
 * Different UI per slot:
 *   • movie / series: a search box that queries TMDB search, shows
 *     results as a list of posters + titles.
 *   • director: a search box that queries TMDB person search, shows
 *     results as profile images + names.
 *   • genre: a grid of genre pills — no search needed.
 *
 * Bottom sheet on mobile, centered modal on desktop.
 */
const FavoritesPicker: Component<FavoritesPickerProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<PickerResult[]>([]);
  const [loading, setLoading] = createSignal(false);

  const slotLabel = (): string => {
    switch (props.slot) {
      case "movie": return "Favorite Movie";
      case "series": return "Favorite Series";
      case "director": return "Favorite Director";
      case "genre": return "Favorite Genre";
      default: return "";
    }
  };

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      // All TMDB API calls now go through the server-side proxy at /api/media/*
      // which injects the API key from TMDB_API_KEY (server-only env var).
      const API = "/api/media";
      let endpoint: string;
      if (props.slot === "movie") {
        endpoint = `/search/movie?query=${encodeURIComponent(q)}&language=en-US&page=1`;
      } else if (props.slot === "series") {
        endpoint = `/search/tv?query=${encodeURIComponent(q)}&language=en-US&page=1`;
      } else if (props.slot === "director") {
        endpoint = `/search/person?query=${encodeURIComponent(q)}&language=en-US&page=1`;
      } else {
        return;
      }
      const res = await fetch(`${API}${endpoint}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: PickerResult[] = (data.results ?? []).slice(0, 20).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        title: (r.title ?? r.name ?? "Untitled") as string,
        subtitle: ((r.release_date ?? r.first_air_date ?? "") as string).split("-")[0] || "",
        imagePath: (r.poster_path ?? r.profile_path ?? r.backdrop_path ?? null) as string | null,
      }));
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (result: PickerResult) => {
    if (props.slot) {
      props.onSelect(props.slot, result.id, result.title);
    }
  };

  const handleGenreSelect = (genre: { id: number; name: string }) => {
    if (props.slot === "genre") {
      props.onSelect("genre", String(genre.id), genre.name);
    }
  };

  return (
    <Show when={props.open && props.slot}>
      <Portal>
        <div
          class="modal-backdrop fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{
            background: "rgba(0,0,0,0.85)",
            "backdrop-filter": "blur(8px)",
            "-webkit-backdrop-filter": "blur(8px)",
          }}
          onClick={props.onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Choose your ${slotLabel().toLowerCase()}`}
        >
          <div
            class="modal-sheet-enter modal-surface w-full max-w-md relative z-10"
            style={{
              "border-radius": "var(--radius-xl)",
              padding: "var(--sp-4)",
              "padding-bottom": "calc(var(--sp-5) + env(safe-area-inset-bottom, 0px))",
              "max-height": "85vh",
              display: "flex",
              "flex-direction": "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div class="sheet-handle sm:hidden" aria-hidden="true" />

            {/* Close button */}
            <button
              type="button"
              onClick={props.onClose}
              class="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center focus-ring"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--hairline)",
                color: "var(--text-soft)",
              }}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                close
              </span>
            </button>

            {/* Header */}
            <div style={{ "margin-bottom": "var(--sp-4)" }}>
              <p style={{
                "font-family": "'Azeret Mono', monospace",
                "font-size": "0.5625rem",
                "font-weight": 700,
                "letter-spacing": "0.14em",
                "text-transform": "uppercase",
                color: "var(--p)",
                margin: "0 0 var(--sp-1)",
              }}>
                Choose
              </p>
              <h2 style={{
                "font-family": "'Bebas Neue', sans-serif",
                "font-size": "1.5rem",
                "line-height": "1",
                "letter-spacing": "0.03em",
                color: "var(--text-strong)",
                margin: "0",
              }}>
                {slotLabel()}
              </h2>
            </div>

            {/* Genre picker — grid of pills */}
            <Show when={props.slot === "genre"}>
              <div style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "var(--sp-2)",
                "overflow-y": "auto",
                "padding-bottom": "var(--sp-2)",
              }}>
                <For each={GENRES}>
                  {(genre) => (
                    <button
                      type="button"
                      class="quick-filter-tab focus-ring"
                      onClick={() => handleGenreSelect(genre)}
                    >
                      {genre.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            {/* Search picker — movie / series / director */}
            <Show when={props.slot !== "genre" && props.slot !== null}>
              {/* Search input */}
              <div class="glass-search-bar" style={{ "margin-bottom": "var(--sp-3)" }}>
                <span
                  class="material-symbols-outlined"
                  style={{ color: "var(--text-muted)", "flex-shrink": "0", "font-size": "18px" }}
                  aria-hidden="true"
                >
                  search
                </span>
                <input
                  type="search"
                  placeholder={`Search for a ${props.slot === "director" ? "person" : props.slot}…`}
                  value={query()}
                  onInput={(e) => search(e.currentTarget.value)}
                  class="glass-input focus-ring"
                  style={{
                    flex: "1",
                    background: "transparent",
                    border: "none",
                    padding: "0",
                    "box-shadow": "none",
                  }}
                  aria-label={`Search for a ${props.slot}`}
                  autocomplete="off"
                  spellcheck={false}
                />
              </div>

              {/* Results */}
              <div style={{
                "overflow-y": "auto",
                "flex": "1",
                display: "flex",
                "flex-direction": "column",
                gap: "var(--sp-1)",
              }}>
                <Show when={loading()}>
                  <div style={{ "text-align": "center", padding: "var(--sp-6)", color: "var(--text-muted)" }}>
                    <span class="material-symbols-outlined animate-soft-pulse" style={{ "font-size": "24px" }} aria-hidden="true">
                      progress_activity
                    </span>
                  </div>
                </Show>
                <Show when={!loading() && results().length === 0 && query().trim().length >= 2}>
                  <div style={{ "text-align": "center", padding: "var(--sp-6)", color: "var(--text-muted)", "font-size": "0.8125rem" }}>
                    No results found.
                  </div>
                </Show>
                <For each={results()}>
                  {(result) => (
                    <button
                      type="button"
                      class="search-result-row focus-ring"
                      onClick={() => handleSelect(result)}
                      style={{ width: "100%", "text-align": "left" }}
                    >
                      <div class="search-result-poster" style={props.slot === "director" ? { "border-radius": "50%", width: "48px", height: "48px" } : {}}>
                        <Show
                          when={result.imagePath}
                          fallback={
                            <div style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              "align-items": "center",
                              "justify-content": "center",
                              color: "var(--text-dim)",
                            }}>
                              <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                                {props.slot === "director" ? "person" : "movie"}
                              </span>
                            </div>
                          }
                        >
                          <img
                            src={tmdbImage(result.imagePath, "w185")}
                            class="search-result-poster-img"
                            style={props.slot === "director" ? { "border-radius": "50%", "object-fit": "cover" } : {}}
                            loading="lazy"
                            decoding="async"
                            alt=""
                            aria-hidden="true"
                          />
                        </Show>
                      </div>
                      <div class="search-result-info">
                        <p class="search-result-title">{result.title}</p>
                        <Show when={result.subtitle}>
                          <p class="search-result-meta">{result.subtitle}</p>
                        </Show>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

interface PickerResult {
  id: string;
  title: string;
  subtitle: string;
  imagePath: string | null;
}

export default FavoritesPicker;
