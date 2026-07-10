// src/features/collections/CollectionDetailPage.tsx
import { Show, createSignal, createEffect, ErrorBoundary } from "solid-js";
import { isServer } from "solid-js/web";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { fetchCuratedUniverseBySlug } from "./curatedUniverseAdapter";
import UniverseDashboard from "./components/UniverseDashboard";
import TimelineEngine from "./components/TimelineEngine";
import type { Collection, CollectionEntry, ViewingOrder, TimelineProvider, WatchlistItem } from "~/shared/types";

/**
 * CollectionDetailPage — renders a single collection or curated universe.
 *
 * ARCHITECTURE (Database Bible):
 *   The route param `id` can be:
 *     1. A user collection UUID → looked up in userCollections()
 *     2. A curated universe slug → fetched from Supabase curated_universes
 *
 * SSR safety:
 *   The collection fetch is client-only (guarded by isServer). During SSR,
 *   loading is true so the skeleton renders. On the client, a createEffect
 *   resolves the collection — first checking userCollections() (sync),
 *   then falling back to fetchCuratedUniverseBySlug (async).
 *
 * REACTIVITY:
 *   Preferences (activeOrder, activeProvider) are applied in a
 *   createEffect — NEVER in the render path.
 */
export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, getUniversePrefs } = useCollections();
  const { openTitle } = useModalState();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] = createSignal<TimelineProvider>("cinelog");

  // Client-only state — during SSR these stay at their initial values
  // (loading=true, collection=null) so the skeleton renders.
  const [collection, setCollection] = createSignal<Collection | null>(null);
  const [loading, setLoading] = createSignal(!isServer);
  const [notFound, setNotFound] = createSignal(false);

  // Resolve the collection. Client-only — does not run during SSR.
  const resolveCollection = async (id: string) => {
    if (isServer) return;
    setLoading(true);
    setNotFound(false);
    try {
      // 1. Check user collections first (synchronous lookup).
      const userCol = userCollections().find((c) => c.id === id);
      if (userCol) {
        setCollection(userCol);
        setLoading(false);
        return;
      }
      // 2. Fetch curated universe from Supabase by slug.
      const curated = await fetchCuratedUniverseBySlug(id);
      if (curated) {
        setCollection(curated);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error("[CollectionDetailPage] Failed to load collection:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch when params.id changes or userCollections populates.
  createEffect(() => {
    const id = params.id;
    if (id) {
      void userCollections().length; // track userCollections changes
      resolveCollection(id);
    }
  });

  // Apply saved preferences when the collection resolves.
  createEffect(() => {
    const col = collection();
    if (!col) return;
    const prefs = getUniversePrefs(col.id);
    setActiveOrder(prefs?.preferredOrder ?? col.defaultOrder ?? "chronological");
    setActiveProvider(prefs?.preferredProvider ?? "cinelog");
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

      {/* Loading state */}
      <Show when={loading()}>
        <div class="page-enter" style={{ padding: "var(--sp-12)", "text-align": "center" }}>
          <div class="skeleton-base" style={{ width: "60%", height: "2rem", margin: "0 auto var(--sp-4)" }} />
          <div class="skeleton-base" style={{ width: "40%", height: "1rem", margin: "0 auto" }} />
        </div>
      </Show>

      {/* Not found state */}
      <Show when={!loading() && notFound()}>
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
      </Show>

      {/* Loaded state */}
      <Show when={!loading() && !notFound() && collection()}>
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
