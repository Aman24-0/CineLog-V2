// src/features/profile/components/FavoritesCarousel.tsx
//
// FavoritesCarousel — "Your Top 20 Favourite" rail.
//
// Shows up to 20 titles from the user's Favorites collection
// (managed via the useCollections hook + the "Favorites" collection
// that is auto-created on first sign-in).
//
// DAILY SHUFFLE + PIN (per user request v2.1):
//   • The user manually marks titles as favourites from the
//     Watchlist page (heart button on each card). Those favourites
//     live in the Favorites collection.
//   • If the user has more than 20 favourites, the rail shows 20:
//       - Pinned titles (always shown, never shuffled)
//       - The remaining slots are filled by a daily-shuffled subset
//         of non-pinned favourites
//   • Pin state is stored in localStorage (key below) — it is a
//     Profile-display preference, not a property of the collection
//     entry itself, so pinning here does NOT reorder the collection.
//
// Visual language:
//   • Section title "Your Top 20 Favourite" with an icon
//   • Horizontal scroll rail with poster cards
//   • Each card: poster, title, year, type chip, rating chip
//   • Pin button (top-left of each poster) — keeps the card in
//     the rail across daily shuffles
//   • Hides entirely when Favorites collection is empty
//
// Architecture:
//   ProfilePage → FavoritesCarousel → useCollections (Favorites collection)
//                                       openTitle (useModalState)

import { Show, For, createMemo, createSignal, onMount, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { openTitle } from "~/shared/hooks/useModalState";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useToast } from "~/shared/hooks/useToast";
import type { CollectionEntry, WatchlistItem } from "~/shared/types";

const PROFILE_PINNED_KEY = "cinelog_profile_pinned_favourites";
const MAX_FAVOURITES = 20;

interface FavoritesCarouselProps {
  // Kept for backward compatibility — not used by the new
  // collection-driven implementation, but ProfilePage still passes
  // the watchlist accessor (so the prop signature doesn't change).
  watchlist: () => WatchlistItem[];
}

const FavoritesCarousel: Component<FavoritesCarouselProps> = (_props) => {
  const collections = useCollections();
  const library = useUserLibrary();
  const { showToast } = useToast();
  const [pinnedIds, setPinnedIds] = createSignal<Set<string>>(new Set());
  const [seed, setSeed] = createSignal<number>(0);

  // Load pinned IDs from localStorage on mount.
  onMount(() => {
    try {
      const raw = localStorage.getItem(PROFILE_PINNED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setPinnedIds(new Set(arr));
      }
    } catch {
      // ignore malformed storage
    }
    // Daily seed — based on YYYY-MM-DD so it changes once per day.
    setSeed(dailySeed());
  });

  // Find the Favorites collection. It's the one with isFavorites=true
  // OR (fallback) named exactly "Favorites".
  const favoritesCollection = createMemo(() => {
    const all = collections.userCollections();
    return (
      all.find((c) => c.isFavorites) ??
      all.find((c) => c.name === "Favorites") ??
      null
    );
  });

  const favoritesEntries = createMemo<CollectionEntry[]>(() => {
    return favoritesCollection()?.entries ?? [];
  });

  // Build a stable WatchlistItem-like shape from each entry, so we can
  // pass it to openTitle. We look up the vault to enrich with status /
  // rating / runtime if the title is also in the vault.
  const items = createMemo<WatchlistItem[]>(() => {
    const vault = library.watchlist();
    const entries = favoritesEntries();
    return entries.map((e) => {
      const inVault = vault.find(
        (v) => String(v.id) === String(e.id) && v.media_type === e.media_type
      );
      return (
        inVault ?? {
          id: String(e.id),
          tmdb_id: Number(e.id),
          media_type: e.media_type,
          title: e.title,
          name: e.name,
          poster_path: e.poster_path ?? null,
          backdrop_path: e.backdrop_path ?? null,
          release_date: e.release_date,
          first_air_date: e.first_air_date,
          status: "Planned",
          runtime: e.runtime ?? 0,
        } as WatchlistItem
      );
    });
  });

  // Determine the final display list: pinned first, then daily-shuffled
  // non-pinned, capped at MAX_FAVOURITES.
  const displayItems = createMemo<WatchlistItem[]>(() => {
    const list = items();
    if (list.length === 0) return [];

    const pinned = pinnedIds();
    const pinnedItems: WatchlistItem[] = [];
    const otherItems: WatchlistItem[] = [];

    for (const item of list) {
      const key = favKey(item);
      if (pinned.has(key)) pinnedItems.push(item);
      else otherItems.push(item);
    }

    // Shuffle the non-pinned items using a daily-seeded PRNG so the
    // order is stable within a day and changes the next day.
    const shuffled = seededShuffle(otherItems, seed());

    // Cap: pinned always included; fill the rest with shuffled.
    const remaining = Math.max(0, MAX_FAVOURITES - pinnedItems.length);
    return [...pinnedItems, ...shuffled.slice(0, remaining)];
  });

  const isPinned = (item: WatchlistItem): boolean =>
    pinnedIds().has(favKey(item));

  const togglePin = (item: WatchlistItem) => {
    const key = favKey(item);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        showToast("Unpinned from Top 20", "info", 1200);
      } else {
        // Enforce the 20-cap on pinned items so pinning can never
        // push the rail past MAX_FAVOURITES.
        if (next.size >= MAX_FAVOURITES) {
          showToast(`You can pin up to ${MAX_FAVOURITES} titles`, "info", 1800);
          return prev;
        }
        next.add(key);
        showToast("Pinned to Top 20", "success", 1200);
      }
      try {
        localStorage.setItem(PROFILE_PINNED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // storage may be full or blocked — non-fatal
      }
      return next;
    });
  };

  const handleClick = (item: WatchlistItem) => {
    openTitle(item, library.watchlist());
  };

  return (
    <Show when={displayItems().length > 0}>
      <section class="profile-section profile-favorites" aria-label="Your top 20 favourite">
        <div class="favorites-header">
          <h2 class="favorites-title">
            <span class="material-symbols-outlined favorites-title-icon" aria-hidden="true">
              favorite
            </span>
            Your Top 20 Favourite
          </h2>
        </div>

        <div class="favorites-rail" role="list">
          <For each={displayItems()}>
            {(item) => {
              const title = () => item.title || item.name || "Untitled";
              const year = () => {
                const d = item.release_date || item.first_air_date || "";
                return d.split("-")[0] || "";
              };
              const rating = () => item.rating ?? 0;
              const posterUrl = () => tmdbImage(item.poster_path, "w185");
              const isMovie = () => item.media_type === "movie";
              const pinned = () => isPinned(item);

              return (
                <div class="favorites-card-wrap" role="listitem">
                  <button
                    type="button"
                    class="search-rail-card focus-ring favorites-card"
                    classList={{ "is-pinned": pinned() }}
                    onClick={() => handleClick(item)}
                    aria-label={`${title()}, ${year() || ""}${isMovie() ? ", Movie" : ", Series"}${rating() > 0 ? `, rated ${rating()}` : ""}`}
                  >
                    <div class="search-rail-poster favorites-poster">
                      <Show
                        when={item.poster_path}
                        fallback={
                          <div class="search-rail-poster-fallback">
                            <span
                              class="material-symbols-outlined"
                              style={{ "font-size": "24px", color: "var(--text-dim)" }}
                              aria-hidden="true"
                            >
                              {isMovie() ? "movie" : "tv"}
                            </span>
                          </div>
                        }
                      >
                        <img
                          src={posterUrl()}
                          class="search-rail-poster-img"
                          loading="lazy"
                          decoding="async"
                          alt=""
                          aria-hidden="true"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </Show>
                      <Show when={rating() > 0}>
                        <div class="favorites-rating-chip" aria-label={`Rated ${rating()} out of 10`}>
                          <span class="material-symbols-outlined" style={{ "font-size": "9px" }} aria-hidden="true">
                            star
                          </span>
                          {rating().toFixed(1)}
                        </div>
                      </Show>

                      {/* Pin button — keeps the card in the rail across
                          daily shuffles. Toggles pinned state in
                          localStorage. */}
                      <button
                        type="button"
                        class={`favorites-pin-btn focus-ring${pinned() ? " is-pinned" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          togglePin(item);
                        }}
                        aria-label={pinned() ? "Unpin from Top 20" : "Pin to Top 20"}
                        aria-pressed={pinned()}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          push_pin
                        </span>
                      </button>
                    </div>
                    <p class="search-rail-title">{title()}</p>
                    <p class="search-rail-meta">
                      {year() && <span>{year()}</span>}
                      {year() && " · "}
                      <span>{isMovie() ? "Movie" : "Series"}</span>
                    </p>
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Stable key for a favourite — TMDB id + media_type. */
function favKey(item: WatchlistItem): string {
  return `${item.media_type}:${item.id}`;
}

/** Build a deterministic daily seed (changes once per calendar day). */
function dailySeed(): number {
  const d = new Date();
  // YYYYMMDD as a number — stable for the entire day.
  return (
    d.getFullYear() * 10000 +
    (d.getMonth() + 1) * 100 +
    d.getDate()
  );
}

/**
 * Seeded shuffle (Fisher–Yates with a mulberry32 PRNG). The same seed
 * produces the same order on every render within a day; a new day
 * produces a new order. Items without an id fall back to their index
 * so the algorithm is total.
 */
function seededShuffle<T extends { id: string | number }>(arr: T[], seed: number): T[] {
  if (arr.length <= 1) return [...arr];
  const rng = mulberry32(seed || 1);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default FavoritesCarousel;
