// src/features/collections/CollectionDetailPage.tsx
import { Show, createSignal, createEffect, createMemo, ErrorBoundary, For, type Component } from "solid-js";
import { isServer } from "solid-js/web";
import { Portal } from "solid-js/web";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { useToast } from "~/shared/hooks/useToast";
import { fetchCuratedUniverseBySlug, fetchPhasesForUniverse, withPhases } from "./curatedUniverseAdapter";
import { useUniversePrefsLogic } from "./hooks/useUniversePrefs";
import { useCuratedUniverses } from "./hooks/useCuratedUniverses";
import UniverseDashboard from "./components/UniverseDashboard";
import TimelineEngine from "./components/TimelineEngine";
import CollectionActionDock from "./components/CollectionActionDock";
import CollectionToolbar from "./components/CollectionToolbar";
import FolderEditor from "./components/FolderEditor";
import { useCollectionFilter } from "./hooks/useCollectionFilter";
import { useCollectionSort, type UserCollectionSortMode } from "./hooks/useCollectionSort";
import type { Collection, CollectionEntry, UniversePhase, ViewingOrder, TimelineProvider, WatchlistItem } from "~/shared/types";

/**
 * CollectionDetailPage — renders a single collection or curated universe.
 *
 * ARCHITECTURE (Database Bible):
 *   The route param `id` can be:
 *     1. A user collection UUID → looked up in userCollections()
 *     2. A curated universe slug → fetched from Supabase curated_universes
 *
 * SSR safety:
 *   loading is ALWAYS true initially (including SSR) so the skeleton
 *   renders. The createEffect on the client resolves the collection.
 *
 * RACE CONDITION PREVENTION:
 *   A `resolveEpoch` counter tracks the latest resolveCollection call.
 *   When userCollections populates (changing from 0 to N), the effect
 *   re-runs. The previous async fetch (which was searching for a curated
 *   universe with a UUID) is still in flight. When it resolves, it
 *   checks if its epoch matches the current one — if not, it ignores
 *   the result. This prevents stale `notFound = true` from overriding
 *   a successful collection lookup.
 */
export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const {
    userCollections,
    getUniversePrefs,
    removeFromCollection,
    addToCollection,
    refreshCollections,
    archiveCollection,
    deleteCollection,
  } = useCollections();
  const { openTitle } = useModalState();
  const { showToast } = useToast();
  const { removeUniverseFromPrefs } = useUniversePrefsLogic();
  const { refresh: refreshUniverses } = useCuratedUniverses();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] = createSignal<TimelineProvider>("cinelog");

  // loading is ALWAYS true initially (including SSR) so the skeleton
  // renders. Never false until the client resolves the collection.
  const [collection, setCollection] = createSignal<Collection | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);
  // Phase dividers — fetched separately for curated universes.
  // Empty for user collections.
  const [phases, setPhases] = createSignal<UniversePhase[]>([]);
  // Folder editor modal — opened by the "Edit" action in the dock.
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(null);
  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = createSignal<Collection | null>(null);
  // Unsubscribe confirmation dialog (universes only)
  const [unsubscribeTarget, setUnsubscribeTarget] = createSignal<Collection | null>(null);

  const isUniverse = createMemo(() => collection()?.type === "curated");

  // Sort mode — only used for USER collections. Universes use the
  // activeOrder signal (story/release/franchise) directly. The hook
  // is instantiated (not destructured) so its reactive state is
  // ready when the toolbar changes modes; we read the mode back via
  // the userSortMode signal below.
  void useCollectionSort();
  const [userSortMode, setUserSortMode] = createSignal<UserCollectionSortMode>("manual");

  // Filter — search + status pills. Applies to BOTH user collections
  // and universes. The vault status lookup is built from the user's
  // watchlist so the pills can show "Watching 5 / Completed 12" etc.
  const statusOf = createMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const item of watchlist()) {
      map[`${item.media_type}:${item.id}`] = (item.status ?? "planned").toLowerCase();
    }
    return map;
  });

  const filter = useCollectionFilter({ statusOf });

  // ── Batch Select Mode ──────────────────────────────────────────
  // When active, each timeline entry shows a checkbox. Selected
  // entries can be removed from this folder or moved to another
  // folder. The Select button lives in UniverseDashboard; the
  // checkboxes live in TimelineEntry. State is lifted here so both
  // can read/write it.
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = createSignal(false);

  const toggleSelectMode = () => {
    setSelectMode(!selectMode());
    if (selectMode()) {
      // Entering select mode — clear any previous selection
      setSelectedIds(new Set<string>());
    }
  };

  const toggleSelected = (entry: CollectionEntry) => {
    const key = `${entry.media_type}:${entry.id}`;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedCount = () => selectedIds().size;

  // Batch remove: remove every selected entry from this collection.
  const handleBatchRemove = async () => {
    const col = collection();
    if (!col) return;
    const count = selectedIds().size;
    if (count === 0) return;
    const ids = Array.from(selectedIds());
    // Run deletes in parallel with Promise.allSettled (instead of
    // sequential loop). Each individual removeFromCollection call
    // previously triggered a refreshCollections() after each delete —
    // for 20 items that was 20 Supabase refetches. We pass a flag
    // to skip the per-item refresh and do ONE refresh at the end.
    await Promise.allSettled(
      ids.map((key) => {
        const [mediaType, id] = key.split(":");
        return removeFromCollection(col.id, id, mediaType);
      })
    );
    // Single refresh after all deletes are complete.
    const uid = getCurrentUid();
    if (uid) await refreshCollections(uid);
    setSelectedIds(new Set<string>());
    setSelectMode(false);
  };

  // Move selected entries to another folder: add to target, then
  // remove from current.
  const handleMoveToFolder = async (targetCollectionId: string) => {
    const col = collection();
    if (!col) return;
    const ids = Array.from(selectedIds());
    for (const key of ids) {
      const [mediaType, id] = key.split(":");
      // Find the entry to build a CollectionEntry for addToCollection
      const entry = (col.entries ?? []).find(
        (e) => String(e.id) === id && e.media_type === mediaType
      );
      if (entry) {
        await addToCollection(targetCollectionId, entry);
        await removeFromCollection(col.id, id, mediaType);
      }
    }
    setSelectedIds(new Set<string>());
    setSelectMode(false);
    setShowMoveDialog(false);
  };

  // Race condition guard — incremented on every resolveCollection call.
  // When an async result comes back, it checks if its epoch matches
  // the current one. If not, the result is stale and ignored.
  let resolveEpoch = 0;

  // Resolve the collection. Client-only.
  const resolveCollection = async (id: string) => {
    if (isServer) return;

    const myEpoch = ++resolveEpoch;
    setLoading(true);
    setNotFound(false);
    setPhases([]);

    try {
      // 1. Check user collections first (synchronous lookup).
      const userCol = userCollections().find((c) => c.id === id);
      if (userCol) {
        // Check for staleness — another resolve might have started.
        if (myEpoch !== resolveEpoch) return;
        setCollection(userCol);
        setLoading(false);
        return;
      }

      // 2. If userCollections is empty (still loading), DON'T fall through
      //    to the curated universe lookup yet. Wait for userCollections
      //    to populate. The createEffect will re-run when
      //    userCollections().length changes.
      if (userCollections().length === 0) {
        // Keep loading true — the effect will re-run when collections load.
        return;
      }

      // 3. userCollections has loaded but doesn't contain this ID.
      //    Try fetching as a curated universe by slug.
      const curated = await fetchCuratedUniverseBySlug(id);
      if (myEpoch !== resolveEpoch) return; // stale

      if (curated) {
        // 4. For curated universes, also fetch admin-authored phase
        //    dividers from the `universe_phases` table. These are
        //    rendered as section headers in the TimelineEngine.
        const universePhases = await fetchPhasesForUniverse(curated.id);
        if (myEpoch !== resolveEpoch) return;
        setCollection(universePhases.length > 0 ? withPhases(curated, universePhases) : curated);
        setPhases(universePhases);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      if (myEpoch !== resolveEpoch) return; // stale
      console.error("[CollectionDetailPage] Failed to load collection:", err);
      setNotFound(true);
    } finally {
      if (myEpoch === resolveEpoch) {
        setLoading(false);
      }
    }
  };

  // ── Action dock handlers ──
  const handleShare = () => {
    const col = collection();
    if (!col) return;
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/collections/${col.id}`
      : "";
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Collection link copied", "success", 1500),
        () => showToast("Copy failed", "error", 1500),
      );
    }
  };

  const handleArchive = async () => {
    const col = collection();
    if (!col) return;
    const ok = await archiveCollection(col.id);
    if (ok) {
      // Immediately navigate the user back to /collections as
      // specified — the archived collection is hidden from the
      // default grid.
      navigate("/collections");
    }
  };

  const handleDelete = () => {
    const col = collection();
    if (!col) return;
    setDeleteTarget(col);
  };

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    await deleteCollection(target.id);
    setDeleteTarget(null);
    navigate("/collections");
  };

  const handleUnsubscribe = () => {
    const col = collection();
    if (!col) return;
    setUnsubscribeTarget(col);
  };

  const confirmUnsubscribe = async () => {
    const target = unsubscribeTarget();
    if (!target) return;
    await removeUniverseFromPrefs(target.id);
    await refreshUniverses();
    setUnsubscribeTarget(null);
    showToast(`Unsubscribed from "${target.name}"`, "success");
    navigate("/collections");
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

      {/* Loading state — always renders during SSR + initial client load */}
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
            {/* Universe Dashboard — enhanced hero + stats + actions.
                The sort order selector lives here. */}
            <UniverseDashboard
              collection={collection()!}
              activeOrder={activeOrder()}
              activeProvider={activeProvider()}
              onOrderChange={setActiveOrder}
              onProviderChange={setActiveProvider}
              selectMode={selectMode()}
              selectedCount={selectedCount()}
              onToggleSelectMode={toggleSelectMode}
              onBatchRemove={handleBatchRemove}
              onOpenMoveDialog={() => setShowMoveDialog(true)}
            />

            {/* Action Dock — contextual actions for the collection.
                USER collections: Add Titles, Edit, Share, More (Archive/Delete).
                SUBSCRIBED UNIVERSES: Share, Unsubscribe only. */}
            <CollectionActionDock
              collection={collection()!}
              onAddTitles={() => navigate(`/collections/${collection()!.id}/edit`)}
              onEdit={() => setEditingFolder(collection()!)}
              onShare={handleShare}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onUnsubscribe={handleUnsubscribe}
            />

            {/* Toolbar — sort (user collections only), search, status pills.
                Universes are locked to "Timeline Order". */}
            <CollectionToolbar
              collection={collection()!}
              search={filter.search}
              onSearchInput={filter.onSearchInput}
              status={filter.status}
              onStatusChange={filter.setStatus}
              sortMode={isUniverse() ? undefined : userSortMode}
              onSortModeChange={isUniverse() ? undefined : setUserSortMode}
            />

            {/* Entry renderer — single Timeline view (rail + numbered nodes).
                The view-mode toggle was removed in v3 — there's only one
                view now. The active sort is conveyed by the order-switch
                buttons above and by the Timeline header label.
                For universes, phase dividers are rendered as section
                headers between entries. */}
            <TimelineEngine
              collection={collection()!}
              order={activeOrder()}
              provider={activeProvider()}
              onOpenEntry={handleOpenEntry}
              selectMode={selectMode()}
              selectedIds={selectedIds()}
              onToggleSelected={toggleSelected}
              onEdit={() => navigate(`/collections/${collection()!.id}/edit`)}
              phases={phases()}
            />
          </div>

          {/* Folder editor modal — opened by the Edit action */}
          <Show when={editingFolder()}>
            <FolderEditor
              collection={editingFolder()!}
              onClose={() => setEditingFolder(null)}
            />
          </Show>

          {/* Delete confirmation dialog */}
          <Show when={deleteTarget()}>
            {(target) => (
              <div
                class="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in"
                style={{ background: "rgba(0,0,0,0.85)", "backdrop-filter": "blur(8px)", "-webkit-backdrop-filter": "blur(8px)" }}
                onClick={() => setDeleteTarget(null)}
                role="dialog"
                aria-modal="true"
                aria-label={`Delete ${target().name}`}
              >
                <div
                  class="modal-surface w-full max-w-sm p-6"
                  style={{ "border-radius": "var(--radius-xl)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ "text-align": "center", "margin-bottom": "var(--sp-5)" }}>
                    <div class="glass-empty-state-icon" aria-hidden="true" style={{ margin: "0 auto var(--sp-3)" }}>
                      <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                        delete
                      </span>
                    </div>
                    <h3 style={{ "font-family": "'Bebas Neue', sans-serif", "font-size": "1.5rem", color: "var(--text-strong)", margin: "0 0 var(--sp-2)" }}>
                      Delete "{target().name}"?
                    </h3>
                    <p style={{ "font-family": "'Outfit', sans-serif", "font-size": "0.8125rem", color: "var(--text-soft)", margin: "0", "line-height": "1.5" }}>
                      This will permanently remove the collection and all its entries. This cannot be undone.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <button
                      type="button"
                      class="btn-ghost focus-ring"
                      onClick={() => setDeleteTarget(null)}
                      style={{ flex: "1" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="btn-primary focus-ring setting-row-danger"
                      onClick={confirmDelete}
                      style={{ flex: "1", background: "#f87171", "box-shadow": "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Show>

          {/* Unsubscribe confirmation dialog (universes only) */}
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
                    <div class="glass-empty-state-icon" aria-hidden="true" style={{ margin: "0 auto var(--sp-3)" }}>
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
                      onClick={confirmUnsubscribe}
                      style={{ flex: "1", background: "#f87171", "box-shadow": "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)" }}
                    >
                      Unsubscribe
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Show>

          {/* Move-to-folder dialog — shown when user clicks "Move" in select mode */}
          <Show when={showMoveDialog()}>
            <MoveToFolderDialog
              currentCollectionId={collection()!.id}
              selectedCount={selectedCount()}
              onClose={() => setShowMoveDialog(false)}
              onMove={handleMoveToFolder}
            />
          </Show>
        </ErrorBoundary>
      </Show>
    </PageContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MoveToFolderDialog — pick a target folder to move selected entries to.
// Reuses the same folder-tile visual language as AddToFolderSheet.
// ──────────────────────────────────────────────────────────────────────────

interface MoveToFolderDialogProps {
  currentCollectionId: string;
  selectedCount: number;
  onClose: () => void;
  onMove: (targetCollectionId: string) => void;
}

const MoveToFolderDialog: Component<MoveToFolderDialogProps> = (props) => {
  const { userCollections } = useCollections();

  // Other folders (exclude the current one — can't move to the same folder)
  const targetFolders = () =>
    userCollections().filter((c) => c.id !== props.currentCollectionId);

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[999998] flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.75)", "backdrop-filter": "blur(12px)", "-webkit-backdrop-filter": "blur(12px)" }}
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label="Move to folder"
      >
        <div
          class="folder-sheet w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
          style={{
            "max-height": "70dvh",
            "min-height": "0",
            background: "var(--glass-bg-strong)",
            "backdrop-filter": "blur(28px)",
            "-webkit-backdrop-filter": "blur(28px)",
            border: "1px solid var(--hairline-2)",
            "box-shadow": "var(--shadow-elevated)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex justify-between items-center px-6 pt-5 pb-4 flex-shrink-0" style={{ "border-bottom": "1px solid var(--hairline)" }}>
            <div>
              <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
                Move {props.selectedCount} {props.selectedCount === 1 ? "title" : "titles"}
              </h3>
              <p style={{ "font-size": "0.75rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                Choose a destination folder
              </p>
            </div>
            <button
              onClick={() => props.onClose()}
              class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-soft)", border: "1px solid var(--hairline)" }}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">close</span>
            </button>
          </div>

          {/* Folder list */}
          <div class="flex-1 overflow-y-auto hide-scrollbar px-4 py-4 space-y-2.5" style={{ "overscroll-behavior": "contain" }}>
            <Show when={targetFolders().length > 0} fallback={
              <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
                No other folders. Create one from the Collections page first.
              </p>
            }>
              <For each={targetFolders()}>
                {(col) => (
                  <button
                    type="button"
                    class="folder-tile focus-ring"
                    onClick={() => props.onMove(col.id)}
                    aria-label={`Move to ${col.name}`}
                  >
                    <div class="folder-tile-icon">
                      <Show when={col.isFavorites} fallback={
                        <span class="material-symbols-outlined" aria-hidden="true">folder</span>
                      }>
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                          aria-hidden="true"
                        >favorite</span>
                      </Show>
                    </div>
                    <div class="folder-tile-text">
                      <p class="folder-tile-name">{col.name}</p>
                      <p class="folder-tile-count">
                        {col.entries?.length ?? 0} {(col.entries?.length ?? 0) === 1 ? "title" : "titles"}
                      </p>
                    </div>
                    <span class="material-symbols-outlined" style={{ "font-size": "20px", color: "var(--text-dim)" }} aria-hidden="true">
                      chevron_right
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};
