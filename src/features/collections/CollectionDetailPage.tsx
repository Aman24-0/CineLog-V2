// src/features/collections/CollectionDetailPage.tsx
import { Show, createSignal, createEffect, ErrorBoundary, For, type Component } from "solid-js";
import { isServer } from "solid-js/web";
import { Portal } from "solid-js/web";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { getCurrentUid } from "~/shared/hooks/useAuth";
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
  const { userCollections, getUniversePrefs, removeFromCollection, addToCollection, refreshCollections } = useCollections();
  const { openTitle } = useModalState();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] = createSignal<TimelineProvider>("cinelog");

  // loading is ALWAYS true initially (including SSR) so the skeleton
  // renders. Never false until the client resolves the collection.
  const [collection, setCollection] = createSignal<Collection | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);

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
        setCollection(curated);
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

            {/* Entry renderer — single Timeline view (rail + numbered nodes).
                The view-mode toggle was removed in v3 — there's only one
                view now. The active sort is conveyed by the order-switch
                buttons above and by the Timeline header label. */}
            <TimelineEngine
              collection={collection()!}
              order={activeOrder()}
              provider={activeProvider()}
              onOpenEntry={handleOpenEntry}
              selectMode={selectMode()}
              selectedIds={selectedIds()}
              onToggleSelected={toggleSelected}
              onEdit={() => navigate(`/collections/${collection()!.id}/edit`)}
            />
          </div>

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
