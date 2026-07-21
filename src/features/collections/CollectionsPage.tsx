// src/features/collections/CollectionsPage.tsx
import { Show, createSignal, ErrorBoundary, lazy, Suspense, For } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useCollections } from "./hooks/useCollections";
import { useCuratedUniverses } from "./hooks/useCuratedUniverses";
import { useUniversePrefsLogic } from "./hooks/useUniversePrefs";
import { useToast } from "~/shared/hooks/useToast";
import { tmdbImage } from "~/core/tmdb/tmdb";
import FolderEditor from "./components/FolderEditor";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import CollectionsGrid from "./components/CollectionsGrid";
import type { Collection } from "~/shared/types";

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
  const { showToast } = useToast();
  const {
    userCollections,
    curatedCollections: _curatedCollections,
    loading,
    createCollection,
  } = useCollections();
  const { subscribedUniverses, refresh: refreshUniverses } = useCuratedUniverses();
  const { removeUniverseFromPrefs } = useUniversePrefsLogic();

  void _curatedCollections;

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(null);
  const [showSmartBuilder, setShowSmartBuilder] = createSignal(false);
  const [showAddUniverse, setShowAddUniverse] = createSignal(false);
  const [unsubscribeTarget, setUnsubscribeTarget] = createSignal<Collection | null>(null);

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    setNewName("");
    setShowCreate(false);
  };

  const handleUnsubscribe = async () => {
    const target = unsubscribeTarget();
    if (!target) return;
    await removeUniverseFromPrefs(target.id);
    await refreshUniverses();
    setUnsubscribeTarget(null);
    showToast(`Unsubscribed from "${target.name}"`, "success");
  };

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      <ErrorBoundary
        fallback={(err) => {
          console.error("[CollectionsPage] Render error:", err);
          return (
            <div
              class="page-enter"
              style={{ padding: "var(--sp-8)", "text-align": "center" }}
            >
              <p class="type-body-soft">Something went wrong loading collections.</p>
              <p
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-dim)",
                  "margin-top": "var(--sp-2)",
                }}
              >
                {String(err)}
              </p>
              <button
                class="btn-ghost focus-ring"
                style={{ "margin-top": "var(--sp-4)" }}
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          );
        }}
      >
        <div class="page-enter relative">
          {/* === PAGE EYEBROW === */}
          <div class="collections-eyebrow-block">
            <p class="collections-eyebrow">Collections</p>
            <h1 class="collections-page-title">Your Cinematic Universe</h1>
            <p class="collections-page-subtitle">
              Organize your titles into folders and subscribe to curated universes.
            </p>
          </div>

          {/* === USER COLLECTIONS === */}
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span
                class="material-symbols-outlined"
                style={{"font-size":"12px","color":"var(--p)"}}
                aria-hidden="true"
              >
                folder
              </span>
              Your Collections
              <button
                type="button"
                class="collections-fold-action focus-ring"
                onClick={() => setShowCreate(true)}
                aria-label="Create new collection"
              >
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"14px"}}
                  aria-hidden="true"
                >
                  add
                </span>
                New
              </button>
              <button
                type="button"
                class="collections-smart-btn focus-ring"
                onClick={() => setShowSmartBuilder(true)}
                aria-label="Create smart collection"
                style={{ "margin-left": "auto" }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"12px"}}
                  aria-hidden="true"
                >
                  auto_awesome
                </span>
                Smart
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
                  class="btn-primary focus-ring"
                  onClick={handleCreate}
                  disabled={!newName().trim()}
                  style={{ "font-size": "0.5625rem" }}
                >
                  Create
                </button>
                <button
                  class="btn-ghost focus-ring"
                  onClick={() => setShowCreate(false)}
                  style={{ "font-size": "0.5625rem" }}
                >
                  Cancel
                </button>
              </div>
            </Show>

            <CollectionsGrid
              loading={loading}
              userCollections={userCollections}
              onEditFolder={(col) => setEditingFolder(col)}
            />
          </section>

          {/* === SUBSCRIBED UNIVERSES === */}
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span
                class="material-symbols-outlined"
                style={{"font-size":"12px","color":"var(--p)"}}
                aria-hidden="true"
              >
                public
              </span>
              Subscribed Universes
              <button
                type="button"
                class="collections-fold-action focus-ring"
                onClick={() => setShowAddUniverse(true)}
                aria-label="Add universe"
                style={{ "margin-left": "auto" }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"14px"}}
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
                          when={uni.poster_path || uni.backdrop_path || (uni.entries ?? []).some((e) => e.poster_path)}
                          fallback={
                            <div class="collection-card-empty-art" aria-hidden="true">
                              <span
                                class="material-symbols-outlined"
                                style={{ "font-size": "36px", color: "var(--text-dim)" }}
                                aria-hidden="true"
                              >
                                public
                              </span>
                              <Show when={(uni.entries ?? []).length === 0}>
                                <span class="collection-card-empty-text">No titles yet</span>
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
                                when={(uni.entries ?? []).filter((e) => e.poster_path).length >= 1}
                                fallback={
                                  <img
                                    src={tmdbImage(uni.backdrop_path, "w500")}
                                    class="collage-img"
                                    style={{ width: "100%", height: "100%", "object-fit": "cover" }}
                                    loading="lazy"
                                    decoding="async"
                                    alt=""
                                    aria-hidden="true"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                }
                              >
                                <div class="collage-grid-4">
                                  <For each={(uni.entries ?? []).filter((e) => e.poster_path).slice(0, 4)}>
                                    {(entry) => (
                                      <img
                                        src={tmdbImage(entry.poster_path, "w92")}
                                        class="collage-img"
                                        loading="lazy"
                                        decoding="async"
                                        alt=""
                                        aria-hidden="true"
                                        onError={(e) => { e.currentTarget.style.display = "none"; }}
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
                                  ? (uni.poster_path.startsWith("http")
                                      ? uni.poster_path
                                      : tmdbImage(uni.poster_path, "w500"))
                                  : (uni.backdrop_path!.startsWith("http")
                                      ? uni.backdrop_path!
                                      : tmdbImage(uni.backdrop_path, "w500"))
                              }
                              class="collage-img"
                              style={{ width: "100%", height: "100%", "object-fit": "cover" }}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              aria-hidden="true"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </Show>
                        </Show>

                        {/* Universe badge */}
                        <div class="collection-card-badges">
                          <span class="collection-badge" title="Curated Universe">
                            <span class="material-symbols-outlined" style={{ "font-size": "10px", color: "var(--p)" }} aria-hidden="true">public</span>
                          </span>
                        </div>

                        {/* Three-dot menu for unsubscribe */}
                        <button
                          type="button"
                          class="collection-card-menu focus-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUnsubscribeTarget(uni);
                          }}
                          aria-label={`Options for ${uni.name}`}
                        >
                          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                            more_vert
                          </span>
                        </button>
                      </div>

                      {/* Info area */}
                      <div class="collection-card-info">
                        <div class="collection-card-name-row">
                          <p class="collection-card-name">{uni.name}</p>
                        </div>
                        <Show when={uni.description}>
                          <p class="collection-card-desc">{uni.description}</p>
                        </Show>
                        <div class="collection-card-stats">
                          <span class="collection-card-stats-text">
                            {(uni.entries ?? []).length} {(uni.entries ?? []).length !== 1 ? "titles" : "title"}
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

        {/* Folder editor modal */}
        <Show when={editingFolder()}>
          <FolderEditor
            collection={editingFolder()!}
            onClose={() => setEditingFolder(null)}
          />
        </Show>

        {/* Smart collection builder */}
        <Show when={showSmartBuilder()}>
          <SmartCollectionBuilder onClose={() => setShowSmartBuilder(false)} />
        </Show>

        {/* Add Universe modal — lists ALL curated_universes from Supabase */}
        <Show when={showAddUniverse()}>
          <Suspense fallback={null}>
            <AddUniverseModal onClose={() => setShowAddUniverse(false)} />
          </Suspense>
        </Show>

        {/* Unsubscribe confirmation dialog */}
        <Show when={unsubscribeTarget()}>
          {(target) => (
            <div
              class="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in"
              style={{ background: "rgba(0,0,0,0.85)", "backdrop-filter": "blur(8px)", "-webkit-backdrop-filter": "blur(8px)" }}
              onClick={() => setUnsubscribeTarget(null)}
              role="dialog"
              aria-modal="true"
              aria-label={`Unsubscribe from ${target().name}`}
            >
              <div
                class="modal-surface w-full max-w-sm p-6"
                style={{ "border-radius": "var(--radius-xl)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ "text-align": "center", "margin-bottom": "var(--sp-5)" }}>
                  <div class="empty-premium-icon" aria-hidden="true" style={{ margin: "0 auto var(--sp-3)" }}>
                    <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                      remove_circle
                    </span>
                  </div>
                  <h3 style={{ "font-family": "'Bebas Neue', sans-serif", "font-size": "1.5rem", color: "var(--text-strong)", margin: "0 0 var(--sp-2)" }}>
                    Unsubscribe from "{target().name}"?
                  </h3>
                  <p style={{ "font-family": "'Outfit', sans-serif", "font-size": "0.8125rem", color: "var(--text-soft)", margin: "0", "line-height": "1.5" }}>
                    You'll lose access to this universe's timeline. You can re-subscribe anytime from "Add Universe".
                  </p>
                </div>
                <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                  <button
                    type="button"
                    class="btn-ghost focus-ring"
                    onClick={() => setUnsubscribeTarget(null)}
                    style={{ flex: "1" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-primary focus-ring setting-row-danger"
                    onClick={handleUnsubscribe}
                    style={{ flex: "1", background: "#f87171", "box-shadow": "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)" }}
                  >
                    Unsubscribe
                  </button>
                </div>
              </div>
            </div>
          )}
        </Show>
      </ErrorBoundary>
    </PageContainer>
  );
}
