// src/features/collections/CollectionsPage.tsx
import { Show, createSignal, ErrorBoundary, lazy, Suspense } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import FolderEditor from "./components/FolderEditor";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import CollectionsHeader from "./components/CollectionsHeader";
import CollectionsStats from "./components/CollectionsStats";
import CollectionsGrid from "./components/CollectionsGrid";
import FranchiseGrid from "./components/FranchiseGrid";
import type { Collection } from "~/shared/types";

// Lazy-load the AddUniverseModal so it doesn't bloat the initial bundle.
const AddUniverseModal = lazy(() => import("./components/AddUniverseModal"));

/**
 * CollectionsPage — orchestration only.
 *
 * ARCHITECTURE (BUG 3 + BUG 5):
 *   User Collections are PRIMARY. Curated Universes are SECONDARY.
 *   The page layout reflects this separation:
 *
 *     1. Page eyebrow + featured universe hero (CollectionsHeader)
 *     2. Pinned + Continue-Your-Universe rails (CollectionsStats) — curated
 *     3. YOUR COLLECTIONS — user-created folders (PRIMARY)
 *     4. Explore Universes — curated franchise explorer (SECONDARY)
 *     5. Add Universe button — opens modal to browse/import curated universes
 *
 *   Suggested universes are NO LONGER rendered inline. The "Add Universe"
 *   button opens a modal where users browse, search, and import curated
 *   universes. This keeps the page focused on user collections.
 */
export default function CollectionsPage() {
  const { watchlist } = useVault();
  const {
    userCollections,
    curatedCollections,
    loading,
    createCollection,
    getCollectionProgress,
    pinnedUniverses,
  } = useCollections();

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
          {/* === SECONDARY: Featured universe hero + curated rails === */}
          <CollectionsHeader
            curatedCollections={curatedCollections}
            watchlist={watchlist}
            getCollectionProgress={getCollectionProgress}
          />

          <CollectionsStats
            curatedCollections={curatedCollections}
            pinnedUniverses={pinnedUniverses}
            watchlist={watchlist}
            getCollectionProgress={getCollectionProgress}
          />

          {/* === PRIMARY: YOUR COLLECTIONS (user-created folders) === */}
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

          {/* === SECONDARY: Explore Universes (curated, read-only) === */}
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span
                class="material-symbols-outlined"
                style={{"font-size":"12px","color":"var(--p)"}}
                aria-hidden="true"
              >
                auto_awesome
              </span>
              Explore Universes
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
            <FranchiseGrid />
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

        {/* Add Universe modal — replaces inline UniverseSuggestions (BUG 3) */}
        <Show when={showAddUniverse()}>
          <Suspense fallback={null}>
            <AddUniverseModal onClose={() => setShowAddUniverse(false)} />
          </Suspense>
        </Show>
      </ErrorBoundary>
    </PageContainer>
  );
}
