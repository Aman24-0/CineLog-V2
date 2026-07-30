// src/features/admin/collectionEditor/TmdbSearchModal.tsx
//
// CineLog V2 — Admin: TMDB Search Modal
// ---------------------------------------------------------------------
// Lets the admin search TMDB for movies/TV shows and pick one to add
// to the current universe. Returns the chosen { tmdb_id, media_type,
// title, poster_path, release_date } via onPick.
//
// Uses the existing searchMulti() helper from core/tmdb/discover —
// the same one the consumer app uses for franchise search.
//
// Designed for keyboard use: type → arrow keys → Enter to pick.

import {
  For,
  Show,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  type Component
} from "solid-js";
import { searchMulti } from "~/core/tmdb/discover";
import { posterUrl, releaseYear } from "./types";
import type { AdminEntry } from "./types";

interface TmdbResult {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  release_date: string | null;
  overview?: string | null;
}

interface Props {
  onClose: () => void;
  onPick: (result: TmdbResult) => Promise<void> | void;
  /** Optional: set of "<media_type>:<tmdb_id>" already in the universe —
   *  used to show an "Already added" badge next to search results. */
  existingKeys?: Set<string>;
  /** Optional: list of existing entries (for duplicate highlighting). */
  existingEntries?: AdminEntry[];
}

const TmdbSearchModal: Component<Props> = (props) => {
  const [query, setQuery] = createSignal("");
  // Debounced query — updated 300ms after the user stops typing.
  // Using a separate signal (instead of setTimeout inside onInput) makes the
  // search reactive on `debouncedQuery()` and lets us use createEffect, which
  // is the same pattern the working consumer search (useSearch.ts) uses.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [results, setResults] = createSignal<TmdbResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [pickingId, setPickingId] = createSignal<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inputRef: HTMLInputElement | undefined;
  let resultsContainer: HTMLDivElement | undefined;

  // Build a quick lookup for existing entries.
  const existingKey = (r: TmdbResult): string => `${r.media_type}:${r.tmdb_id}`;
  const isDuplicate = (r: TmdbResult): boolean => {
    if (props.existingKeys?.has(existingKey(r))) return true;
    if (
      props.existingEntries?.some(
        (e) => e.media_type === r.media_type && e.tmdb_id === r.tmdb_id
      )
    )
      return true;
    return false;
  };

  // ─── Debounced query signal ────────────────────────────────────────
  //
  // When the user types, schedule an update to `debouncedQuery()` 300ms
  // later. If the user types again before the 300ms elapses, cancel the
  // previous schedule and start fresh. This is identical to the consumer
  // search's debounce pattern (useSearch.ts) which is proven to work on
  // mobile (including Android Chrome with autocorrect / IME composition).
  //
  const onInput = (value: string) => {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  };

  // ─── Search effect ─────────────────────────────────────────────────
  //
  // Reactively runs searchMulti whenever debouncedQuery() changes. Uses
  // a monotonically increasing request ID to ignore stale responses —
  // if the user types "Cap" then "Captain America" before "Cap"'s
  // response arrives, "Cap"'s response is discarded so it can never
  // overwrite the newer "Captain America" results.
  //
  // The previous implementation used setTimeout + async/await inside
  // onInput, which on Android Chrome could enter a state where
  // loading() stayed true forever (the search appeared stuck on
  // "Searching…"). Switching to createEffect + .then/.catch/.finally
  // matches the proven-working consumer search pattern and avoids the
  // setTimeout-in-onInput pitfall.
  //
  let requestId = 0;
  createEffect(() => {
    const q = debouncedQuery();
    if (!q || q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const myId = ++requestId;
    setLoading(true);
    setError(null);
    searchMulti(q)
      .then((items) => {
        // Stale response — a newer search has started; ignore this one.
        if (myId !== requestId) return;
        const filtered: TmdbResult[] = items
          .filter(
            (it) =>
              (it.media_type === "movie" || it.media_type === "tv") && it.id
          )
          .map((it) => ({
            tmdb_id: it.id,
            media_type: it.media_type,
            title: it.title || it.name || "Untitled",
            poster_path: it.poster_path ?? null,
            release_date: it.release_date ?? it.first_air_date ?? null,
            overview: it.overview ?? null
          }));
        setResults(filtered);
        setActiveIndex(0);
      })
      .catch((err) => {
        // Stale response — a newer search has started; ignore this one.
        if (myId !== requestId) return;
        const msg = err instanceof Error ? err.message : "Search failed";
        console.error("[TmdbSearchModal] search failed:", msg);
        setError(msg);
        setResults([]);
      })
      .finally(() => {
        // Only clear loading if this is still the latest request.
        if (myId === requestId) setLoading(false);
      });
  });

  // Cancel any pending debounce on unmount.
  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    // Bump requestId so any in-flight response is ignored after unmount.
    requestId++;
  });

  const handlePick = async (r: TmdbResult) => {
    if (pickingId()) return;
    setPickingId(existingKey(r));
    try {
      await props.onPick(r);
    } finally {
      setPickingId(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results().length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && results().length > 0) {
      e.preventDefault();
      const r = results()[activeIndex()];
      if (r) void handlePick(r);
      return;
    }
  };

  onMount(() => {
    inputRef?.focus();
    document.addEventListener("keydown", onKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown);
    // (debounceTimer cleanup is handled by the onCleanup registered above.)
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        "z-index": 300,
        display: "flex",
        "align-items": "flex-start",
        "justify-content": "center",
        padding: "var(--sp-6) var(--sp-4)",
        "backdrop-filter": "blur(4px)",
        "overflow-y": "auto"
      }}
      onClick={() => props.onClose()}
    >
      <style>{`
        @keyframes tmdb-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          background: "var(--tier-1)",
          border: "1px solid var(--hairline)",
          "border-radius": "var(--radius-lg)",
          width: "100%",
          "max-width": "640px",
          "max-height": "85vh",
          "box-shadow": "var(--shadow-xl, 0 20px 60px rgba(0,0,0,0.5))",
          display: "flex",
          "flex-direction": "column",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + search input */}
        <div
          style={{
            padding: "var(--sp-4)",
            "border-bottom": "1px solid var(--hairline)"
          }}
        >
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              "margin-bottom": "var(--sp-3)"
            }}
          >
            <h3
              style={{ margin: 0, "font-size": "1.1rem", color: "var(--text)" }}
            >
              Search TMDB
            </h3>
            <button
              type="button"
              onClick={() => props.onClose()}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                "font-size": "1.25rem",
                "line-height": "1",
                padding: "0 var(--sp-1)"
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query()}
            onInput={(e) => onInput(e.currentTarget.value)}
            placeholder="Search by title (e.g. Iron Man, Breaking Bad)…"
            style={{
              width: "100%",
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--tier-2)",
              border: "1px solid var(--hairline)",
              "border-radius": "var(--radius-md)",
              color: "var(--text)",
              "font-size": "0.95rem",
              outline: "none",
              "box-sizing": "border-box"
            }}
          />
          <div
            style={{
              "margin-top": "var(--sp-2)",
              "font-size": "0.75rem",
              color: "var(--text-muted)"
            }}
          >
            ↑↓ to navigate, Enter to add, Esc to close
          </div>
        </div>

        {/* Results */}
        <div
          ref={resultsContainer}
          style={{ "overflow-y": "auto", flex: 1, padding: "var(--sp-2)" }}
        >
          <Show when={loading()}>
            <div
              style={{
                padding: "var(--sp-8)",
                "text-align": "center",
                color: "var(--text-muted)"
              }}
            >
              Searching…
            </div>
          </Show>

          <Show when={error()}>
            <div
              style={{
                padding: "var(--sp-4)",
                margin: "var(--sp-2)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                "border-radius": "var(--radius-md)",
                color: "rgb(252, 165, 165)",
                "font-size": "0.85rem"
              }}
            >
              {error()}
            </div>
          </Show>

          <Show
            when={
              !loading() &&
              !error() &&
              debouncedQuery() &&
              results().length === 0
            }
          >
            <div
              style={{
                padding: "var(--sp-8)",
                "text-align": "center",
                color: "var(--text-muted)"
              }}
            >
              No results for "{debouncedQuery()}"
            </div>
          </Show>

          <Show when={!loading() && !debouncedQuery()}>
            <div
              style={{
                padding: "var(--sp-8)",
                "text-align": "center",
                color: "var(--text-muted)"
              }}
            >
              Type a movie or TV show title to search TMDB.
            </div>
          </Show>

          <For each={results()}>
            {(r, i) => {
              const dup = isDuplicate(r);
              const isActive = () => i() === activeIndex();
              const isPicking = () => pickingId() === existingKey(r);
              return (
                <button
                  type="button"
                  onClick={() => !dup && !isPicking() && handlePick(r)}
                  disabled={dup || isPicking()}
                  style={{
                    display: "flex",
                    width: "100%",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-2) var(--sp-3)",
                    "border-radius": "var(--radius-md)",
                    border: "1px solid transparent",
                    background: isActive()
                      ? "var(--tier-3, rgba(255,255,255,0.06))"
                      : "transparent",
                    cursor: dup || isPicking() ? "not-allowed" : "pointer",
                    "text-align": "left",
                    "align-items": "center",
                    opacity: dup ? 0.55 : 1
                  }}
                  onMouseEnter={() => setActiveIndex(i())}
                >
                  {/* Poster thumbnail */}
                  <div
                    style={{
                      width: "40px",
                      height: "60px",
                      "flex-shrink": 0,
                      "border-radius": "var(--radius-sm)",
                      overflow: "hidden",
                      background: "var(--tier-3, rgba(255,255,255,0.04))",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      "font-size": "0.7rem",
                      color: "var(--text-muted)"
                    }}
                  >
                    <Show when={r.poster_path} fallback="🎬">
                      <img
                        src={posterUrl(r.poster_path, "w92")}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          "object-fit": "cover"
                        }}
                        loading="lazy"
                      />
                    </Show>
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        color: "var(--text)",
                        "font-weight": "600",
                        "font-size": "0.9rem",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis"
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        "font-size": "0.75rem",
                        color: "var(--text-muted)",
                        "margin-top": "2px"
                      }}
                    >
                      <span
                        style={{
                          "text-transform": "uppercase",
                          "letter-spacing": "0.05em",
                          "font-weight": "600",
                          "margin-right": "var(--sp-2)"
                        }}
                      >
                        {r.media_type}
                      </span>
                      <Show when={releaseYear(r.release_date)}>
                        <span>{releaseYear(r.release_date)}</span>
                      </Show>
                    </div>
                  </div>

                  {/* Action badge */}
                  <div style={{ "flex-shrink": 0 }}>
                    <Show
                      when={isPicking()}
                      fallback={
                        <Show
                          when={dup}
                          fallback={
                            <span
                              style={{
                                display: "inline-flex",
                                "align-items": "center",
                                gap: "4px",
                                padding: "6px 12px",
                                "border-radius": "var(--radius-md)",
                                background: "var(--accent, #7c3aed)",
                                color: "#ffffff",
                                "font-size": "0.8rem",
                                "font-weight": "600",
                                "letter-spacing": "0.01em",
                                "line-height": "1",
                                "white-space": "nowrap",
                                "box-shadow":
                                  "0 1px 3px rgba(124, 58, 237, 0.4)",
                                "user-select": "none"
                              }}
                            >
                              + Add
                            </span>
                          }
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              "align-items": "center",
                              gap: "4px",
                              padding: "6px 12px",
                              "border-radius": "var(--radius-md)",
                              background: "rgba(34, 197, 94, 0.15)",
                              color: "rgb(134, 239, 172)",
                              "font-size": "0.8rem",
                              "font-weight": "600",
                              "line-height": "1",
                              border: "1px solid rgba(34, 197, 94, 0.3)",
                              "white-space": "nowrap",
                              "user-select": "none"
                            }}
                          >
                            ✓ Added
                          </span>
                        </Show>
                      }
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          "align-items": "center",
                          gap: "6px",
                          padding: "6px 12px",
                          "border-radius": "var(--radius-md)",
                          background: "var(--tier-3, rgba(255,255,255,0.08))",
                          color: "var(--text-muted)",
                          "font-size": "0.8rem",
                          "font-weight": "600",
                          "line-height": "1",
                          "white-space": "nowrap",
                          "user-select": "none"
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "10px",
                            height: "10px",
                            border: "2px solid currentColor",
                            "border-top-color": "transparent",
                            "border-radius": "50%",
                            animation: "tmdb-spin 0.6s linear infinite"
                          }}
                        />
                        Adding…
                      </span>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
};

export default TmdbSearchModal;
