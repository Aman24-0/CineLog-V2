// src/features/collections/CollectionDetailPage.tsx
import { Show, createResource, createSignal, createEffect, ErrorBoundary } from "solid-js";
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
 *   There are NO hardcoded curated collections. Every curated universe
 *   is fetched from the database via fetchCuratedUniverseBySlug().
 *
 *   The collection is loaded via createResource so Suspense + ErrorBoundary
 *   can handle loading + error states cleanly — no blank screens.
 *
 * REACTIVITY (BUG 1 fix):
 *   Preferences (activeOrder, activeProvider) are applied in a
 *   createEffect — NEVER in the render path. Setting signals during
 *   render is a SolidJS anti-pattern that crashes the component.
 */
export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, getUniversePrefs } = useCollections();
  const { openTitle } = useModalState();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] = createSignal<TimelineProvider>("cinelog");

  // Resolve the collection: user collection (synchronous) or curated universe (async).
  // The source returns a composite key { id, userCollectionsVersion } so the
  // resource re-runs when EITHER params.id changes OR userCollections()
  // populates from Supabase. Without tracking userCollections() in the source,
  // the fetcher runs once with an empty array, falls through to the curated
  // universe lookup (which fails for user collection UUIDs), and never
  // re-runs when userCollections() populates — leaving the user stuck on
  // "not found" or a black screen during the loading phase (BUG 1 root cause).
  const [collectionResource] = createResource(
    // Source: re-run when params.id changes OR when userCollections() changes.
    // The string concatenation creates a new source value whenever either changes.
    () => `${params.id}|${userCollections().length}`,
    async (source: string): Promise<Collection | null> => {
      // Extract the id from the composite source key.
      const id = source.split("|")[0];
      // 1. Check user collections first (synchronous lookup).
      const userCol = userCollections().find((c) => c.id === id);
      if (userCol) return userCol;

      // 2. Fetch curated universe from Supabase by slug.
      const curated = await fetchCuratedUniverseBySlug(id);
      return curated;
    },
  );

  // The resolved collection (null while loading or if not found).
  const collection = (): Collection | null => collectionResource() ?? null;

  // Apply saved preferences when the collection resolves.
  // This MUST be a createEffect — it sets signals (setActiveOrder /
  // setActiveProvider) as a side effect. Setting signals during render
  // is a SolidJS anti-pattern that crashes the component (BUG 1 root cause).
  // createEffect runs AFTER render, so signal setters are legal here.
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

      <Show
        when={!collectionResource.loading}
        fallback={
          <div class="page-enter" style={{ padding: "var(--sp-12)", "text-align": "center" }}>
            <div class="skeleton-base" style={{ width: "60%", height: "2rem", margin: "0 auto var(--sp-4)" }} />
            <div class="skeleton-base" style={{ width: "40%", height: "1rem", margin: "0 auto" }} />
          </div>
        }
      >
        <Show
          when={collection()}
          fallback={
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
          }
        >
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
      </Show>
    </PageContainer>
  );
}
