// src/features/collections/CollectionDetailPage.tsx
import { For, Show, createMemo, createResource } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { tmdbImage, fetchCollectionDetails } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import { FRANCHISES } from "~/shared/data/franchises";
import type { Collection, CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * CollectionDetailPage — the cinematic collection viewer.
 *
 * Renders ANY collection type:
 *   - Curated: loaded from CURATED_COLLECTIONS by slug
 *   - User: loaded from useCollections by Firestore id
 *   - Official: loaded from TMDB by collection id (future — for now,
 *     detected from FranchiseInfo trigger)
 *
 * Shows:
 *   - Cinematic hero with backdrop + collection name + progress ring
 *   - Stats strip (Total, Owned, Completed, Watching)
 *   - Timeline: all entries in order with vault status indicators
 *   - Tapping an entry opens its Details modal
 */
export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, getCollectionProgress } = useCollections();
  const { openTitle } = useModalState();

  // Resolve the collection by id — check curated first, then user
  const collection = createMemo<Collection | null>(() => {
    const id = params.id;

    // Check curated
    const curated = CURATED_COLLECTIONS.find((c) => c.id === id);
    if (curated) return curated;

    // Check user collections
    const user = userCollections().find((c) => c.id === id);
    if (user) return user;

    return null;
  });

  const progress = createMemo(() => {
    const col = collection();
    if (!col) return { owned: 0, total: 0, pct: 0 };
    return getCollectionProgress(col, watchlist());
  });

  const stats = createMemo(() => {
    const col = collection();
    if (!col) return null;
    const items = col.entries.map((e) => {
      const vaultItem = findInVault(watchlist(), { id: e.id, media_type: e.media_type });
      return { entry: e, vaultItem, inVault: vaultItem !== null, status: vaultItem?.status ?? null, rating: vaultItem?.rating ?? null };
    });
    const owned = items.filter((i) => i.inVault).length;
    const completed = items.filter((i) => i.status === "Completed").length;
    const watching = items.filter((i) => i.status === "Watching").length;
    return { items, owned, completed, watching, total: items.length };
  });

  const backdropUrl = createMemo(() => {
    const col = collection();
    if (!col?.backdrop_path) return "";
    return tmdbImage(col.backdrop_path, "w1280");
  });

  const handleOpenEntry = (entry: CollectionEntry) => {
    const baseItem: WatchlistItem = {
      id: String(entry.id),
      title: entry.title,
      name: entry.name,
      media_type: entry.media_type,
      poster_path: entry.poster_path,
      backdrop_path: entry.backdrop_path,
      status: "Planned",
      release_date: entry.release_date,
      first_air_date: entry.first_air_date
    };
    openTitle(baseItem, watchlist());
  };

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";
  const yearOf = (e: CollectionEntry) => (e.release_date || e.first_air_date || "").split("-")[0] || "";

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      {/* Back button */}
      <button
        type="button"
        class="collections-back-btn"
        onClick={() => navigate("/collections")}
        aria-label="Back to Collections"
      >
        <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">arrow_back</span>
      </button>

      <Show when={collection()} fallback={
        <div class="collections-detail-empty">
          <p class="type-body-soft" style={{ "text-align": "center" }}>
            Collection not found.
          </p>
          <button class="btn-ghost" onClick={() => navigate("/collections")}>Back to Collections</button>
        </div>
      }>
        {/* CINEMATIC HERO */}
        <div class="collection-detail-hero">
          <Show when={backdropUrl()}>
            <img
              src={backdropUrl()}
              class="collection-detail-hero-backdrop"
              loading="eager"
              decoding="async"
              {...{ fetchpriority: "high" } as any}
              alt=""
              aria-hidden="true"
            />
          </Show>
          <div class="collection-detail-hero-overlay" aria-hidden="true" />
          <div class="collection-detail-hero-content">
            <p class="collection-detail-hero-eyebrow">
              {collection()!.type === "curated" ? "Curated Collection" :
               collection()!.type === "user" ? "Your Collection" : "Official Collection"}
            </p>
            <h1 class="collection-detail-hero-title">{collection()!.name}</h1>
            <Show when={collection()!.description}>
              <p class="collection-detail-hero-description">{collection()!.description}</p>
            </Show>
            {/* Progress ring */}
            <div class="collection-detail-progress">
              <div class="collection-detail-ring" style={{ "--progress": `${progress().pct}%` }}>
                <span class="collection-detail-ring-pct">{progress().pct}%</span>
              </div>
              <div class="collection-detail-progress-text">
                <span class="collection-detail-progress-owned">{progress().owned} of {progress().total}</span>
                <span class="collection-detail-progress-label">titles in your vault</span>
              </div>
            </div>
          </div>
        </div>

        {/* STATS STRIP */}
        <Show when={stats()}>
          <div class="collection-detail-stats">
            <div class="collection-detail-stat-cell">
              <span class="collection-detail-stat-value">{stats()!.total}</span>
              <span class="collection-detail-stat-label">Total</span>
            </div>
            <div class="collection-detail-stat-cell">
              <span class="collection-detail-stat-value" style={{ color: "var(--p)" }}>{stats()!.owned}</span>
              <span class="collection-detail-stat-label">Owned</span>
            </div>
            <div class="collection-detail-stat-cell">
              <span class="collection-detail-stat-value" style={{ color: "#4ade80" }}>{stats()!.completed}</span>
              <span class="collection-detail-stat-label">Completed</span>
            </div>
            <div class="collection-detail-stat-cell">
              <span class="collection-detail-stat-value" style={{ color: "#60a5fa" }}>{stats()!.watching}</span>
              <span class="collection-detail-stat-label">Watching</span>
            </div>
          </div>
        </Show>

        {/* TIMELINE */}
        <div class="collection-detail-timeline-section">
          <div class="collection-detail-timeline-label">
            <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">timeline</span>
            Timeline
          </div>
          <div class="collection-detail-timeline" role="list">
            <For each={stats()?.items ?? []}>
              {(item, i) => (
                <button
                  type="button"
                  class={`collection-detail-timeline-item${!item.inVault ? " collection-detail-timeline-missing" : ""}`}
                  role="listitem"
                  onClick={() => handleOpenEntry(item.entry)}
                  aria-label={`${titleOf(item.entry)}${yearOf(item.entry) ? `, ${yearOf(item.entry)}` : ""} — open details`}
                >
                  <div class="collection-detail-timeline-number">{i() + 1}</div>
                  <div class="collection-detail-timeline-poster">
                    <Show
                      when={item.entry.poster_path}
                      fallback={
                        <div class="collection-detail-timeline-poster-fallback" aria-hidden="true">
                          <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)" aria-hidden="true">movie</span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(item.entry.poster_path, "w185")}
                        class="collection-detail-timeline-poster-img"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                      />
                    </Show>
                    <Show when={item.status === "Completed"}>
                      <span class="collection-detail-timeline-status collection-detail-timeline-status-completed" aria-label="Completed">
                        <span class="material-symbols-outlined" style="font-size: 10px" aria-hidden="true">check</span>
                      </span>
                    </Show>
                    <Show when={item.status === "Watching"}>
                      <span class="collection-detail-timeline-status collection-detail-timeline-status-watching" aria-label="Watching" />
                    </Show>
                    <Show when={item.inVault && !item.status}>
                      <span class="collection-detail-timeline-status collection-detail-timeline-status-planned" aria-label="In vault" />
                    </Show>
                  </div>
                  <div class="collection-detail-timeline-info">
                    <p class="collection-detail-timeline-title">{titleOf(item.entry)}</p>
                    <p class="collection-detail-timeline-meta">
                      {yearOf(item.entry) ? `${yearOf(item.entry)} · ` : ""}
                      {item.entry.media_type === "tv" ? "Series" : "Movie"}
                    </p>
                  </div>
                  <Show when={!item.inVault}>
                    <span class="collection-detail-timeline-missing-badge">+</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </PageContainer>
  );
}
