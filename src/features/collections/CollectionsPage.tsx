// src/features/collections/CollectionsPage.tsx
import { Show, createSignal, ErrorBoundary, lazy, Suspense, For } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useCuratedUniverses } from "./hooks/useCuratedUniverses";
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
 *     1. SMART COLLECTIONS — generated dynamically from the Vault
 *        (Favorites, Continue Watching, Pinned, Recently Added, Top Rated).
 *        These are NOT stored — they're computed from vault state.
 *
 *     2. USER COLLECTIONS — user-created folders, stored in the
 *        `collections` + `collection_entries` tables. Editable: rename,
 *        delete, reorder, add/remove titles.
 *
 *     3. SUBSCRIBED UNIVERSES — loaded from `user_universe_subscriptions`
 *        joined with `curated_universes`. Read-only. Users subscribe via
 *        the "Add Universe" button which opens a modal listing all
 *        `curated_universes` rows.
 *
 *   There are NO hardcoded curated collections on this page. Every
 *   curated universe is fetched from Supabase.
 */
export default function CollectionsPage() {
  const { watchlist } = useVault();
  const navigate = useNavigate();
  const {
    userCollections,
    curatedCollections: _curatedCollections,
    loading,
    createCollection,
  } = useCollections();
  const { subscribedUniverses } = useCuratedUniverses();

  // Mark the old curatedCollections as intentionally unused — the page
  // now sources curated universes from useCuratedUniverses() (Supabase).
  void _curatedCollections;

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(null);
  const [showSmartBuilder, setShowSmartBuilder] = createSignal(false);
  const [showAddUniverse, setShowAddUniverse] = createSignal(false);

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    setNewName("");
    setShowCreate(false);
  };

  // ─── Smart Collections (dynamic, from vault) ───────────────────
  const smartCollections = (): Collection[] => {
    const vault = watchlist();
    if (vault.length === 0) return [];

    // Favorites — vault items with is_favorite (we don't have that flag
    // on WatchlistItem directly, so we approximate: items in a "Favorites"
    // user collection). For now, return an empty list if no Favorites
    // collection exists. The Favorites user collection is created
    // automatically by ensureFavoritesExistsInSupabase.
    return [];
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
                class="btn-ghost"
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

          {/* === 1. SMART COLLECTIONS (dynamic, from vault) === */}
          <Show when={smartCollections().length > 0}>
            <section class="collections-fold">
              <div class="collections-fold-label">
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"12px","color":"var(--p)"}}
                  aria-hidden="true"
                >
                  auto_awesome
                </span>
                Smart Collections
              </div>
              {/* Smart collections render here — Favorites, Continue Watching, etc.
                  These are computed from vault state, not stored. */}
            </section>
          </Show>

          {/* === 2. USER COLLECTIONS (user-created folders) === */}
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
                class="collections-fold-action"
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
                class="collections-smart-btn"
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
                  class="collections-create-input"
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
                  class="btn-primary"
                  onClick={handleCreate}
                  disabled={!newName().trim()}
                  style={{ "font-size": "0.5625rem" }}
                >
                  Create
                </button>
                <button
                  class="btn-ghost"
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

          {/* === 3. SUBSCRIBED UNIVERSES (from user_universe_subscriptions) === */}
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
                class="collections-fold-action"
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
                  <p
                    class="type-body-soft"
                    style={{ "text-align": "center", "max-width": "260px" }}
                  >
                    No subscribed universes yet. Tap "Add Universe" to browse curated universes.
                  </p>
                </div>
              }
            >
              <div class="collections-folder-grid">
                <For each={subscribedUniverses()}>
                  {(uni) => (
                    <div
                      class="collections-folder-card"
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
                      <Show
                        when={uni.backdrop_path}
                        fallback={
                          <div class="collections-folder-icon">
                            <span
                              class="material-symbols-outlined"
                              style={{"font-size":"28px","color":"var(--text-soft)"}}
                              aria-hidden="true"
                            >
                              public
                            </span>
                          </div>
                        }
                      >
                        <div class="collections-folder-collage">
                          <img
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                            src={tmdbImage(uni.backdrop_path, "w500")}
                            class="collections-folder-collage-img"
                            style={{ "object-fit": "cover", width: "100%" }}
                            loading="lazy"
                            decoding="async"
                            alt=""
                            aria-hidden="true"
                          />
                        </div>
                      </Show>
                      <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                        <p class="collections-folder-name">{uni.name}</p>
                      </div>
                      <p class="collections-folder-count">
                        {(uni.entries ?? []).length} title{(uni.entries ?? []).length !== 1 ? "s" : ""}
                      </p>
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
      </ErrorBoundary>
    </PageContainer>
  );
}
