// src/features/collection/CollectionModal.tsx
import { Show, onMount, onCleanup, createMemo, createResource, For, lazy, Suspense } from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage, fetchCollectionDetails } from "~/core/tmdb/tmdb";
import { searchMulti } from "~/core/tmdb/discover";
import { findInVault } from "~/shared/utils/vaultMatch";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import type { TMDBTitle, TMDBCollectionPart, WatchlistItem } from "~/shared/types";
import type { FranchiseDefinition } from "~/shared/data/franchises";

/**
 * CollectionModal — the cinematic collection viewer.
 *
 * Opens via Portal (like DetailsModal) when the user taps a franchise trigger.
 * Shows the full collection with:
 *   - Cinematic hero with collection backdrop
 *   - Progress ring (owned / total)
 *   - Timeline of all titles in release order
 *   - Vault-aware status indicators on each title
 *   - Collection stats (runtime, avg rating, completion %)
 *
 * DATA SOURCES (hybrid, in priority order):
 *   1. TMDB /collection/{id} — if the franchise has tmdbCollectionId
 *      (authoritative for movie collections like Harry Potter, Mission Impossible)
 *   2. Keyword-based search — for franchises without a TMDB collection
 *      (MCU, Star Wars, John Wick — searches TMDB for each keyword)
 *
 * NAVIGATION:
 *   Tapping a title in the collection opens its Details modal (via openTitle).
 *   The Collection modal closes, and the Details modal opens — clean transition.
 *
 * ENTRY POINTS:
 *   - Details page FranchiseInfo section (primary)
 *   - Future: Discover "Continue the Franchise" trajectory
 *   - Future: Vault Collections shelf
 */
export default function CollectionModal() {
  const { collectionSelectedItem, closeCollection } = useCollectionModal();
  const { openTitle } = useModalState();
  const { watchlist } = useVault();

  const franchise = createMemo(() => collectionSelectedItem()?.franchise ?? null);
  const triggerId = createMemo(() => collectionSelectedItem()?.triggerTitleId);

  // Fetch the collection data — TMDB collection API or keyword search fallback
  const [collectionData] = createResource(franchise, async (f: FranchiseDefinition) => {
    // Strategy 1: TMDB collection endpoint (movie franchises)
    if (f.tmdbCollectionId) {
      try {
        const collection = await fetchCollectionDetails(f.tmdbCollectionId);
        return collection.parts.map((p): TMDBTitle => ({
          id: p.id,
          title: p.title,
          media_type: "movie" as const,
          poster_path: p.poster_path,
          backdrop_path: p.backdrop_path,
          overview: p.overview,
          release_date: p.release_date,
          vote_average: p.vote_average,
          vote_count: p.vote_count
        }));
      } catch (err) {
        console.warn("TMDB collection fetch failed, falling back to search:", err);
      }
    }

    // Strategy 2: Keyword-based search (TV franchises, cross-media, or TMDB collection failed)
    const allResults: TMDBTitle[] = [];
    const seen = new Set<string>();
    // Use the most distinctive keywords (first 3-5) to avoid too many API calls
    const keywordsToSearch = f.keywords.slice(0, 5);
    for (const keyword of keywordsToSearch) {
      try {
        const results = await searchMulti(keyword);
        for (const r of results) {
          const key = `${r.media_type}/${r.id}`;
          if (seen.has(key)) continue;
          // Verify the result actually matches a franchise keyword (not just a partial match)
          const name = (r.title || r.name || "").toLowerCase();
          if (f.keywords.some((k) => name.includes(k))) {
            seen.add(key);
            allResults.push(r);
          }
        }
      } catch (err) {
        // skip this keyword
      }
    }

    // Sort by release date ascending (timeline order)
    return allResults.sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || "";
      const dateB = b.release_date || b.first_air_date || "";
      return dateA.localeCompare(dateB);
    });
  });

  // Computed: vault status for each title in the collection
  const titlesWithStatus = createMemo(() => {
    const data = collectionData();
    if (!data) return [];
    return data.map((t) => {
      const vaultItem = findInVault(watchlist(), t);
      return {
        title: t,
        inVault: vaultItem !== null,
        status: vaultItem?.status ?? null,
        rating: vaultItem?.rating ?? null,
        isTrigger: triggerId() ? String(t.id) === triggerId() : false
      };
    });
  });

  // Collection stats
  const stats = createMemo(() => {
    const items = titlesWithStatus();
    if (items.length === 0) return null;
    const owned = items.filter((i) => i.inVault).length;
    const completed = items.filter((i) => i.status === "Completed").length;
    const watching = items.filter((i) => i.status === "Watching").length;
    const total = items.length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    const ratedItems = items.filter((i) => i.rating && i.rating > 0);
    const avgRating = ratedItems.length > 0
      ? (ratedItems.reduce((sum, i) => sum + (i.rating || 0), 0) / ratedItems.length).toFixed(1)
      : null;
    return { owned, completed, watching, total, pct, avgRating };
  });

  // Backdrop URL — prefer TMDB collection backdrop, fall back to first title's backdrop
  const backdropUrl = createMemo(() => {
    const f = franchise();
    if (!f) return "";
    // For TMDB collections, we don't have the collection's backdrop here directly.
    // Use the first title's backdrop as the hero image.
    const data = collectionData();
    if (data && data.length > 0) {
      const path = data[0].backdrop_path || data[0].poster_path;
      if (path) return tmdbImage(path, "w1280");
    }
    return "";
  });

  const handleOpenTitle = (title: TMDBTitle) => {
    // Close the collection modal, then open the Details modal
    closeCollection();
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: title.genres
    };
    openTitle(baseItem, watchlist());
  };

  onMount(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCollection();
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    });
  });

  const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const yearOf = (t: TMDBTitle) => (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const imdbOf = (t: TMDBTitle) => t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <Show when={collectionSelectedItem()}>
      <Portal>
        <div
          class="fixed inset-0 z-[999998] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={closeCollection}
          role="dialog"
          aria-modal="true"
        >
          {/* Ambient backdrop */}
          <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.85)" }} aria-hidden="true" />

          <div
            class="collection-modal w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={!collectionData.loading} fallback={<CollectionSkeleton />}>
              <Show when={collectionData()} fallback={
                <div class="collection-error">
                  <p class="type-body-soft" style={{ "text-align": "center" }}>
                    Couldn't load this collection. Try again later.
                  </p>
                  <button class="btn-ghost" onClick={closeCollection}>Close</button>
                </div>
              }>
                <div class="collection-modal-scroll">
                  {/* CINEMATIC HERO */}
                  <div class="collection-hero">
                    <Show when={backdropUrl()}>
                      <img
                        src={backdropUrl()}
                        class="collection-hero-backdrop"
                        loading="eager"
                        decoding="async"
                        {...({ fetchpriority: "high" } as Record<string, string>)}
                        alt=""
                        aria-hidden="true"
                      />
                    </Show>
                    <div class="collection-hero-overlay" aria-hidden="true" />
                    <button
                      onClick={closeCollection}
                      class="cinematic-close-btn"
                      aria-label="Close collection"
                    >
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">close</span>
                    </button>
                    <div class="collection-hero-content">
                      <p class="collection-hero-eyebrow">Collection</p>
                      <h2 class="collection-hero-title">{franchise()?.name}</h2>
                      <Show when={stats()}>
                        <div class="collection-hero-progress">
                          <div class="collection-progress-ring" style={{
                            "--progress": `${stats()!.pct}%`
                          }}>
                            <span class="collection-progress-pct">{stats()!.pct}%</span>
                          </div>
                          <div class="collection-progress-text">
                            <span class="collection-progress-owned">{stats()!.owned} of {stats()!.total}</span>
                            <span class="collection-progress-label">titles in your vault</span>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </div>

                  {/* STATS STRIP */}
                  <Show when={stats()}>
                    <div class="collection-stats">
                      <div class="collection-stat-cell">
                        <span class="collection-stat-value">{stats()!.total}</span>
                        <span class="collection-stat-label">Total</span>
                      </div>
                      <div class="collection-stat-cell">
                        <span class="collection-stat-value" style={{ color: "var(--p)" }}>{stats()!.owned}</span>
                        <span class="collection-stat-label">Owned</span>
                      </div>
                      <div class="collection-stat-cell">
                        <span class="collection-stat-value" style={{ color: "#4ade80" }}>{stats()!.completed}</span>
                        <span class="collection-stat-label">Completed</span>
                      </div>
                      <div class="collection-stat-cell">
                        <span class="collection-stat-value" style={{ color: "#60a5fa" }}>{stats()!.watching}</span>
                        <span class="collection-stat-label">Watching</span>
                      </div>
                      <Show when={stats()!.avgRating}>
                        <div class="collection-stat-cell">
                          <span class="collection-stat-value" style={{ color: "#f5c518" }}>★ {stats()!.avgRating}</span>
                          <span class="collection-stat-label">Avg Rating</span>
                        </div>
                      </Show>
                    </div>
                  </Show>

                  {/* TIMELINE */}
                  <div class="collection-timeline-section">
                    <div class="collection-timeline-label">
                      <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">timeline</span>
                      Timeline
                    </div>
                    <div class="collection-timeline" role="list">
                      <For each={titlesWithStatus()}>
                        {(item, i) => (
                          <button
                            type="button"
                            class={`collection-timeline-item${item.isTrigger ? " collection-timeline-current" : ""}${!item.inVault ? " collection-timeline-missing" : ""}`}
                            role="listitem"
                            onClick={() => handleOpenTitle(item.title)}
                            aria-label={`${titleOf(item.title)}${yearOf(item.title) ? `, ${yearOf(item.title)}` : ""} — open details`}
                          >
                            {/* Number badge */}
                            <div class="collection-timeline-number">{i() + 1}</div>
                            {/* Poster */}
                            <div class="collection-timeline-poster">
                              <Show
                                when={item.title.poster_path || item.title.backdrop_path}
                                fallback={
                                  <div class="collection-timeline-poster-fallback" aria-hidden="true">
                                    <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)" aria-hidden="true">movie</span>
                                  </div>
                                }
                              >
                                <img
                                  src={tmdbImage(item.title.poster_path || item.title.backdrop_path, "w185")}
                                  class="collection-timeline-poster-img"
                                  loading="lazy"
                                  decoding="async"
                                  alt=""
                                  aria-hidden="true"
                                />
                              </Show>
                              {/* Status indicator */}
                              <Show when={item.status === "Completed"}>
                                <span class="collection-timeline-status collection-timeline-status-completed" aria-label="Completed">
                                  <span class="material-symbols-outlined" style="font-size: 10px" aria-hidden="true">check</span>
                                </span>
                              </Show>
                              <Show when={item.status === "Watching"}>
                                <span class="collection-timeline-status collection-timeline-status-watching" aria-label="Watching" />
                              </Show>
                              <Show when={item.inVault && !item.status}>
                                <span class="collection-timeline-status collection-timeline-status-planned" aria-label="In vault" />
                              </Show>
                            </div>
                            {/* Info */}
                            <div class="collection-timeline-info">
                              <p class="collection-timeline-title">{titleOf(item.title)}</p>
                              <p class="collection-timeline-meta">
                                {yearOf(item.title) ? `${yearOf(item.title)} · ` : ""}
                                {item.title.media_type === "tv" ? "Series" : "Movie"}
                                <Show when={imdbOf(item.title)}>
                                  {" · "}<span style="color: #f5c518">★ {imdbOf(item.title)}</span>
                                </Show>
                              </p>
                              <Show when={item.rating && item.rating > 0}>
                                <p class="collection-timeline-user-rating">
                                  <span style="color: var(--p)">★ Your {item.rating}</span>
                                </p>
                              </Show>
                            </div>
                            {/* Missing badge */}
                            <Show when={!item.inVault}>
                              <span class="collection-timeline-missing-badge">+</span>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/* ---------- Skeleton ---------- */
function CollectionSkeleton() {
  return (
    <div class="collection-modal">
      <div class="collection-skeleton-hero" />
      <div class="collection-skeleton-stats">
        <For each={[1, 2, 3, 4]}>{() => <div class="collection-skeleton-stat" />}</For>
      </div>
      <div class="collection-skeleton-timeline">
        <For each={[1, 2, 3, 4, 5]}>{() => <div class="collection-skeleton-item" />}</For>
      </div>
    </div>
  );
}
