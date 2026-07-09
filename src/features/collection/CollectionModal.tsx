// src/features/collection/CollectionModal.tsx
import { Show, onMount, onCleanup, createMemo, createResource } from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { fetchFranchiseTitles } from "./collectionFetcher";
import CollectionHero from "./components/CollectionHero";
import CollectionStats from "./components/CollectionStats";
import CollectionTimeline from "./components/CollectionTimeline";
import CollectionSkeleton from "./components/CollectionSkeleton";

/**
 * CollectionModal — the cinematic collection viewer (orchestration only).
 *
 * Opens via Portal (like DetailsModal) when the user taps a franchise trigger.
 * Composes:
 *   - CollectionHero (backdrop + progress ring + close button)
 *   - CollectionStats (Total / Owned / Completed / Watching / Avg Rating)
 *   - CollectionTimeline (release-order list with vault-aware badges)
 *   - CollectionSkeleton (loading state)
 *
 * Data fetching lives in `collectionFetcher.ts`. Section rendering lives in
 * the `components/` subfolder. This file owns only state + handlers + layout.
 */
export default function CollectionModal() {
  const { collectionSelectedItem, closeCollection } = useCollectionModal();
  const { openTitle } = useModalState();
  const { watchlist } = useVault();

  const franchise = createMemo(() => collectionSelectedItem()?.franchise ?? null);
  const triggerId = createMemo(() => collectionSelectedItem()?.triggerTitleId);

  const [collectionData] = createResource(franchise, fetchFranchiseTitles);

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
        isTrigger: triggerId() ? String(t.id) === triggerId() : false,
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
    const avgRating =
      ratedItems.length > 0
        ? (ratedItems.reduce((sum, i) => sum + (i.rating || 0), 0) / ratedItems.length).toFixed(1)
        : null;
    return { owned, completed, watching, total, pct, avgRating };
  });

  // Backdrop URL — first title's backdrop as the hero image
  const backdropUrl = createMemo(() => {
    const data = collectionData();
    if (data && data.length > 0) {
      const path = data[0].backdrop_path || data[0].poster_path;
      if (path) return tmdbImage(path, "w1280");
    }
    return "";
  });

  const handleOpenTitle = (title: TMDBTitle) => {
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
      genresList: title.genres,
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
          <div
            class="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.85)" }}
            aria-hidden="true"
          />

          <div
            class="collection-modal w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={!collectionData.loading} fallback={<CollectionSkeleton />}>
              <Show
                when={collectionData()}
                fallback={
                  <div class="collection-error">
                    <p class="type-body-soft" style={{ "text-align": "center" }}>
                      Couldn't load this collection. Try again later.
                    </p>
                    <button class="btn-ghost" onClick={closeCollection}>
                      Close
                    </button>
                  </div>
                }
              >
                <div class="collection-modal-scroll">
                  <CollectionHero
                    backdropUrl={backdropUrl}
                    franchiseName={() => franchise()?.name}
                    stats={stats}
                    onClose={closeCollection}
                  />
                  <CollectionStats stats={stats} />
                  <CollectionTimeline
                    items={titlesWithStatus}
                    onOpenTitle={handleOpenTitle}
                  />
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
