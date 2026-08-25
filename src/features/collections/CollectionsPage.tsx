// src/features/collections/CollectionsPage.tsx
import {
  Show,
  createSignal,
  createMemo,
  createEffect,
  ErrorBoundary,
  lazy,
  Suspense,
  For
} from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { ErrorState, RefreshingIndicator } from "~/shared/ui/states";
import { useCollections } from "./hooks/useCollections";
import { useCuratedUniverses } from "./hooks/useCuratedUniverses";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import CollectionsGrid from "./components/CollectionsGrid";
import ArchivedCollectionsSection from "./components/ArchivedCollectionsSection";
import { collectionRouteForFilter } from "./collectionNavigation";

// Lazy-load modals so they don't bloat the initial bundle.
const AddUniverseModal = lazy(() => import("./components/AddUniverseModal"));

/**
 * CollectionsPage — orchestration only.
 *
 * ARCHITECTURE (Database Bible):
 *   The page contains ONLY three sections, in this order:
 *
 *     1. USER COLLECTIONS — user-created folders, stored in the
 *        `collections` + `collection_entries` tables. Editable: rename,
 *        delete, reorder, add/remove titles.
 *
 *     2. SUBSCRIBED UNIVERSES — loaded from `user_universe_subscriptions`
 *        joined with `curated_universes`. Users subscribe via
 *        the "Add Universe" button which opens a modal listing all
 *        `curated_universes` rows. Users can UNSUBSCRIBE via the
 *        three-dot menu on each universe card.
 *
 *   There are NO hardcoded curated collections on this page. Every
 *   curated universe is fetched from Supabase.
 */
export default function CollectionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams<{ filter?: string }>();
  const {
    userCollections,
    curatedCollections: _curatedCollections,
    loading,
    createCollection,
    unarchiveCollection,
    fetchWithArchived
  } = useCollections();
  const { subscribedUniverses } = useCuratedUniverses();

  void _curatedCollections;

  // Track whether collections have completed their initial load at least once.
  // Used to show RefreshingIndicator during background refreshes instead
  // of the full skeleton loader.
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);
  createEffect(() => {
    if (!loading()) setHasLoadedOnce(true);
  });

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [showSmartBuilder, setShowSmartBuilder] = createSignal(false);
  const [showAddUniverse, setShowAddUniverse] = createSignal(false);
  const [showArchived, setShowArchived] = createSignal(false);

  // Active collections — exclude archived. The default fetch (in
  // useCollections.loadForUid) already filters archived at the DB
  // layer; this is a defensive client-side filter in case the
  // signal was populated by fetchWithArchived (which includes both).
  const activeCollections = createMemo(() =>
    userCollections().filter((c) => !c.isArchived)
  );

  // Archived collections — only present in the signal after the user
  // toggles "Show Archived" (which calls fetchWithArchived). Before
  // the toggle, this is empty.
  const archivedCollections = createMemo(() =>
    userCollections().filter((c) => c.isArchived)
  );

  // Dynamic subtitle counts: "X Collections · Y Subscribed Universes".
  // Computed from the live signals so the count updates immediately
  // on create/delete/archive/subscribe/unsubscribe.
  // Split into two primitive memos so SolidJS's === check skips re-renders
  // when the count hasn't changed (object memos always create a new ref).
  const collectionCount = createMemo(() => activeCollections().length);
  const universeCount = createMemo(() => subscribedUniverses().length);

  // Profile’s Favorites rail uses a query parameter as a semantic link, but
  // the product destination is the actual Favorites folder detail page.
  // Wait for the collection load so a cold start does not navigate to a
  // missing route, then consume the filter with a replace navigation.
  createEffect(() => {
    if (loading()) return;
    const target = collectionRouteForFilter(
      typeof searchParams.filter === "string" ? searchParams.filter : undefined,
      activeCollections()
    );
    if (target) navigate(target, { replace: true, scroll: false });
  });

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    setNewName("");
    setShowCreate(false);
  };

  const handleToggleShowArchived = async () => {
    const next = !showArchived();
    setShowArchived(next);
    if (next) {
      // Fetch with archived included. The signal will then contain
      // BOTH active and archived; activeCollections and
      // archivedCollections memos split them.
      await fetchWithArchived();
    }
  };

  const handleUnarchive = async (collectionId: string) => {
    await unarchiveCollection(collectionId);
    if (showArchived()) {
      await fetchWithArchived();
    }
  };

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      <ErrorBoundary
        fallback={(err) => {
          console.error("[CollectionsPage] Render error:", err);
          return (
            <ErrorState
              variant="section"
              icon="error"
              title="Failed to load collections"
              message="Something went wrong while loading your collections. Please try again."
              retryLabel="Reload"
              onRetry={() => window.location.reload()}
              class="page-enter"
            />
          );
        }}
      >
        <div class="page-enter relative">
          {/* === PAGE EYEBROW === */}
          <div class="collections-eyebrow-block">
            <p class="collections-eyebrow">Collections</p>
            <h1 class="collections-page-title">Your Cinematic Universe</h1>
            <p class="collections-page-subtitle">
              Organize your titles into folders and subscribe to curated
              universes.
            </p>
            {/* Dynamic subtitle counts — X Collections · Y Subscribed Universes.
                Computed via createMemo so it updates immediately on any
                create/delete/archive/subscribe/unsubscribe. */}
            <p class="collections-page-subtitle-counts">
              <span>
                {collectionCount()}{" "}
                {collectionCount() !== 1 ? "Collections" : "Collection"}
              </span>
              <span
                class="collections-page-subtitle-counts-dot"
                aria-hidden="true"
              />
              <span>
                {universeCount()}{" "}
                {universeCount() !== 1
                  ? "Subscribed Universes"
                  : "Subscribed Universe"}
              </span>
            </p>
          </div>

          {/* === USER COLLECTIONS === */}
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span class="material-symbols-outlined" aria-hidden="true">
                folder
              </span>
              Your Collections
              <button
                type="button"
                class="collections-smart-btn focus-ring"
                onClick={() => setShowSmartBuilder(true)}
                aria-label="Create smart collection"
                style={{ "margin-left": "auto" }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px" }}
                  aria-hidden="true"
                >
                  auto_awesome
                </span>
                Smart
              </button>
              <button
                type="button"
                class="collections-fold-action focus-ring"
                onClick={() => setShowCreate(true)}
                aria-label="Create new collection"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px" }}
                  aria-hidden="true"
                >
                  add
                </span>
                New
              </button>
              {/* Show Archived toggle — only visible once at least one
                  collection has been archived. Clicking it fetches with
                  archived included and reveals the archived section. */}
              <button
                type="button"
                class={`collections-show-archived-toggle focus-ring${showArchived() ? " is-active" : ""}`}
                onClick={handleToggleShowArchived}
                aria-pressed={showArchived()}
                aria-label={
                  showArchived()
                    ? "Hide archived collections"
                    : "Show archived collections"
                }
                title={showArchived() ? "Hide archived" : "Show archived"}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  {showArchived() ? "archive" : "unarchive"}
                </span>
                {showArchived() ? "Hide Archived" : "Show Archived"}
              </button>
            </div>

            <Show when={showCreate()}>
              <div class="collections-create-bar">
                <input
                  type="text"
                  class="collections-create-input focus-ring"
                  placeholder="Collection name…"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setShowCreate(false);
                  }}
                  aria-label="New collection name"
                />
                <button
                  type="button"
                  class="btn-primary focus-ring"
                  onClick={handleCreate}
                  disabled={!newName().trim()}
                  style={{ "font-size": "0.5625rem" }}
                >
                  Create
                </button>
                <button
                  type="button"
                  class="btn-ghost focus-ring"
                  onClick={() => setShowCreate(false)}
                  style={{ "font-size": "0.5625rem" }}
                >
                  Cancel
                </button>
              </div>
            </Show>

            {/* Refreshing indicator — shows a subtle bar when collections
                are being refreshed after the initial load. */}
            <Show when={loading() && hasLoadedOnce()}>
              <RefreshingIndicator
                placement="top"
                message="Refreshing collections…"
              />
            </Show>

            <CollectionsGrid
              loading={loading}
              userCollections={activeCollections}
              isFirstUse={!hasLoadedOnce() || userCollections().length === 0}
            />

            {/* Archived section — only rendered when the toggle is on.
                Each archived card is dimmed and exposes only an
                "Unarchive" button (no edit / delete). */}
            <Show when={showArchived()}>
              <ArchivedCollectionsSection
                collections={archivedCollections}
                onUnarchive={handleUnarchive}
              />
            </Show>
          </section>

          {/* === SUBSCRIBED UNIVERSES === */}
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span class="material-symbols-outlined" aria-hidden="true">
                public
              </span>
              Subscribed Universes
              <button
                type="button"
                class="collections-fold-action focus-ring"
                onClick={() => setShowAddUniverse(true)}
                style={{ "margin-left": "auto" }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px" }}
                  aria-hidden="true"
                >
                  add
                </span>
                Add Universe
              </button>
            </div>

            <Show
              when={subscribedUniverses().length > 0}
              fallback={
                <div class="collections-empty-folders">
                  <div class="collections-empty-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "40px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      public
                    </span>
                  </div>
                  <p class="collections-empty-title">No Subscribed Universes</p>
                  <p class="collections-empty-desc">
                    Tap "Add Universe" to browse curated cinematic universes.
                  </p>
                </div>
              }
            >
              <div class="collections-folder-grid">
                <For each={subscribedUniverses()}>
                  {(uni) => (
                    <div
                      class="collection-card"
                      onClick={() => navigate(`/collections/${uni.id}`)}
                      role="button"
                      tabindex={0}
                      aria-label={`Open ${uni.name}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/collections/${uni.id}`);
                        }
                      }}
                    >
                      {/* Collage area */}
                      <div class="collection-card-collage-area">
                        <Show
                          when={
                            uni.poster_path ||
                            uni.backdrop_path ||
                            (uni.entries ?? []).some((e) => e.poster_path)
                          }
                          fallback={
                            <div
                              class="collection-card-empty-art"
                              aria-hidden="true"
                            >
                              <span
                                class="material-symbols-outlined"
                                style={{
                                  "font-size": "36px",
                                  color: "var(--text-dim)"
                                }}
                                aria-hidden="true"
                              >
                                public
                              </span>
                              <Show when={(uni.entries ?? []).length === 0}>
                                <span class="collection-card-empty-text">
                                  No titles yet
                                </span>
                              </Show>
                            </div>
                          }
                        >
                          <Show
                            when={uni.poster_path || uni.backdrop_path}
                            fallback={
                              /* No universe-level cover/banner set — fall back
                                 to a 2x2 collage of the first 4 entry posters. */
                              <Show
                                when={
                                  (uni.entries ?? []).filter(
                                    (e) => e.poster_path
                                  ).length >= 1
                                }
                                fallback={
                                  <img
                                    src={tmdbImage(uni.backdrop_path, "w500")}
                                    class="collage-img"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      "object-fit": "cover"
                                    }}
                                    loading="lazy"
                                    decoding="async"
                                    alt=""
                                    aria-hidden="true"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                }
                              >
                                <div class="collage-grid-4">
                                  <For
                                    each={(uni.entries ?? [])
                                      .filter((e) => e.poster_path)
                                      .slice(0, 4)}
                                  >
                                    {(entry) => (
                                      <img
                                        src={tmdbImage(
                                          entry.poster_path,
                                          "w92"
                                        )}
                                        class="collage-img"
                                        loading="lazy"
                                        decoding="async"
                                        alt=""
                                        aria-hidden="true"
                                        onError={(e) => {
                                          e.currentTarget.style.display =
                                            "none";
                                        }}
                                      />
                                    )}
                                  </For>
                                </div>
                              </Show>
                            }
                          >
                            {/* Universe cover (preferred) or banner as full-bleed cover.
                                This is the image the admin set in the Edit Universe
                                panel — it must take precedence over the first entry
                                poster. */}
                            <img
                              src={
                                uni.poster_path
                                  ? uni.poster_path.startsWith("http")
                                    ? uni.poster_path
                                    : tmdbImage(uni.poster_path, "w500")
                                  : uni.backdrop_path!.startsWith("http")
                                    ? uni.backdrop_path!
                                    : tmdbImage(uni.backdrop_path, "w500")
                              }
                              class="collage-img"
                              style={{
                                width: "100%",
                                height: "100%",
                                "object-fit": "cover"
                              }}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              aria-hidden="true"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </Show>
                        </Show>
                      </div>

                      {/* Info area — clean tile, no inline actions.
                          Universe management (unsubscribe) lives inside
                          the universe detail page's action bar. */}
                      <div class="collection-card-info">
                        <div class="collection-card-name-row">
                          {/* title attr shows the full universe name on
                              hover since the CSS truncates with
                              line-clamp-1. */}
                          <p class="collection-card-name" title={uni.name}>
                            {uni.name}
                          </p>
                        </div>
                        <Show when={uni.description}>
                          <p class="collection-card-desc">{uni.description}</p>
                        </Show>
                        <div class="collection-card-stats">
                          <span class="collection-card-stats-text">
                            {(uni.entries ?? []).length}{" "}
                            {(uni.entries ?? []).length !== 1
                              ? "titles"
                              : "title"}
                          </span>
                          <span class="collection-card-updated">Universe</span>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>

        {/* Smart collection builder */}
        <Show when={showSmartBuilder()}>
          <SmartCollectionBuilder onClose={() => setShowSmartBuilder(false)} />
        </Show>

        {/* Add Universe modal — lists ALL curated_universes from Supabase.
            Universe unsubscribe was moved to the universe detail page's
            action bar — no inline unsubscribe on grid cards anymore. */}
        <Show when={showAddUniverse()}>
          <Suspense fallback={<div class="v2-card h-24 animate-pulse" />}>
            <AddUniverseModal onClose={() => setShowAddUniverse(false)} />
          </Suspense>
        </Show>
      </ErrorBoundary>
    </PageContainer>
  );
}
