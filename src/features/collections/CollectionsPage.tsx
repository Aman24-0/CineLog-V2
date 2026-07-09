// src/features/collections/CollectionsPage.tsx
import { Show, createSignal, ErrorBoundary } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import FolderEditor from "./components/FolderEditor";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import CollectionsHeader from "./components/CollectionsHeader";
import CollectionsStats from "./components/CollectionsStats";
import CollectionsFilters from "./components/CollectionsFilters";
import type { Collection } from "~/shared/types";

/**
 * CollectionsPage — orchestration only.
 *
 * Owns top-level state (showCreate, newName, editingFolder, showSmartBuilder)
 * and composes:
 *   - CollectionsHeader (eyebrow + featured universe hero)
 *   - CollectionsStats (pinned + continue-your-universe rails)
 *   - CollectionsFilters (franchise explorer + suggestions + your collections)
 *
 * Folder/Smart modal state lives here so the section components stay pure.
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

          <CollectionsFilters
            loading={loading}
            userCollections={userCollections}
            showCreate={showCreate}
            newName={newName}
            onNewNameChange={setNewName}
            onCreate={handleCreate}
            onCancelCreate={() => setShowCreate(false)}
            onShowCreate={() => setShowCreate(true)}
            onShowSmartBuilder={() => setShowSmartBuilder(true)}
            onEditFolder={(col) => setEditingFolder(col)}
          />
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
      </ErrorBoundary>
    </PageContainer>
  );
}
