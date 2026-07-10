// src/features/collections/CollectionDetailPage.tsx
import { Show, createMemo, createSignal, createEffect, ErrorBoundary } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import UniverseDashboard from "./components/UniverseDashboard";
import TimelineEngine from "./components/TimelineEngine";
import type { Collection, CollectionEntry, ViewingOrder, TimelineProvider, WatchlistItem } from "~/shared/types";

export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, getCollectionProgress, getUniversePrefs } = useCollections();
  const { openTitle } = useModalState();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] = createSignal<TimelineProvider>("cinelog");

  const collection = createMemo<Collection | null>(() => {
    const id = params.id;
    const curated = CURATED_COLLECTIONS.find((c) => c.id === id);
    if (curated) return curated;
    const user = userCollections().find((c) => c.id === id);
    if (user) return user;
    return null;
  });

  // Load saved preferences when the collection changes.
  // This MUST be a createEffect (not a createMemo) because it sets signals
  // (setActiveOrder / setActiveProvider) as a side effect. Setting signals
  // inside a createMemo is a SolidJS anti-pattern that can cause the memo
  // to re-execute before the <Show> can render, resulting in a blank page.
  createEffect(() => {
    const col = collection();
    if (!col) return;
    const prefs = getUniversePrefs(col.id);
    setActiveOrder(prefs?.preferredOrder ?? col.defaultOrder ?? "chronological");
    setActiveProvider(prefs?.preferredProvider ?? "cinelog");
  });

  const _progress = createMemo(() => {
    const col = collection();
    if (!col) return { owned: 0, total: 0, pct: 0, completed: 0, watching: 0, missing: 0, totalRuntime: 0 };
    return getCollectionProgress(col, watchlist());
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

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={collection()} fallback={
        <div class="page-enter">
          <button
            type="button"
            class="collections-back-btn"
            onClick={() => navigate("/collections")}
            aria-label="Back to Collections"
          >
            <span class="material-symbols-outlined" style={{"font-size":"18px"}} aria-hidden="true">arrow_back</span>
          </button>
          <div class="collections-detail-empty">
            <p class="type-body-soft" style={{ "text-align": "center" }}>Collection not found.</p>
            <button class="btn-ghost" onClick={() => navigate("/collections")}>Back to Collections</button>
          </div>
        </div>
      }>
        <ErrorBoundary
          fallback={(err) => {
            console.error("[CollectionDetailPage] Render error:", err);
            return (
              <div class="page-enter">
                <button type="button" class="collections-back-btn" onClick={() => navigate("/collections")} aria-label="Back to Collections">
                  <span class="material-symbols-outlined" style={{"font-size":"18px"}} aria-hidden="true">arrow_back</span>
                </button>
                <div class="collections-detail-empty">
                  <p class="type-body-soft" style={{ "text-align": "center" }}>Something went wrong loading this collection.</p>
                  <button class="btn-ghost" onClick={() => navigate("/collections")}>Back to Collections</button>
                </div>
              </div>
            );
          }}
        >
          <div class="page-enter relative">
            {/* Universe Dashboard — enhanced hero + stats + actions */}
            <UniverseDashboard
              collection={collection()!}
              activeOrder={activeOrder()}
              activeProvider={activeProvider()}
              onOrderChange={setActiveOrder}
              onProviderChange={setActiveProvider}
            />

            {/* Timeline Engine — supports all viewing orders and providers */}
            <TimelineEngine
              collection={collection()!}
              order={activeOrder()}
              provider={activeProvider()}
              onOpenEntry={handleOpenEntry}
            />
          </div>
        </ErrorBoundary>
      </Show>
    </PageContainer>
  );
}
