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
import CollectionActionBar from "./components/CollectionActionBar";
import CollectionSortFilter from "./components/CollectionSortFilter";
import AddTitlesModal from "./components/AddTitlesModal";
import ReorderModal from "./components/ReorderModal";
import EntryListRow from "./components/EntryListRow";
import FolderEditor from "./components/FolderEditor";
import { useCollectionFilter } from "./hooks/useCollectionFilter";
import { useCollectionSort, type UserCollectionSortMode } from "./hooks/useCollectionSort";
import { GlassEmptyState } from "~/shared/ui/glass";
import type { Collection, CollectionEntry, UniversePhase, ViewingOrder, TimelineProvider, WatchlistItem } from "~/shared/types";

/**
 * CollectionDetailPage — renders a single collection or curated universe.
 *
 * ARCHITECTURE (v4 — final polish):
 *   The route param `id` can be:
 *     1. A user collection UUID → looked up in userCollections()
 *     2. A curated universe slug → fetched from Supabase curated_universes
 *
 * LAYOUT (single page, no more edit-page navigation):
 *
 *   ┌─ UniverseDashboard (hero + stats + pencil edit) ─┐
 *   │  Curated by CineLog (for universes)              │
 *   │  Title                                            │
 *   │  Stats strip                          [✏️]        │
 *   └─────────────────────────────────────────────────┘
 *   ┌─ Row 1: CollectionActionBar ─────────────────────┐
 *   │ [+ Add Titles] [↕ Reorder] [Share]    [⋮ More]   │  (user)
 *   │ [Share] [Unsubscribe]                            │  (universe)
 *   └─────────────────────────────────────────────────┘
 *   ┌─ Row 2: CollectionSortFilter ────────────────────┐
 *   │ [Sort ▾] [🔍 Search…] [All][Watching][Completed][Planned] │
 *   └─────────────────────────────────────────────────┘
 *   ┌─ Entry list ─────────────────────────────────────┐
 *   │ USER collections: EntryListRow × N (flat list,    │
 *   │   with drag handles when sort=Manual)             │
 *   │ UNIVERSES: TimelineEngine (rail + numbered nodes  │
 *   │   + phase dividers between entries)               │
 *   └─────────────────────────────────────────────────┘
 *
 * Removed (v4):
 *   - The "Edit Timeline" full-page route (/collections/[id]/edit).
 *     Replaced by the ReorderModal (in-context modal sheet).
 *   - The "Edit" text in the action bar. The hero's pencil icon
 *     (bottom-right of the backdrop) is now the only edit entry point.
 *   - Custom Entry creation. The old UniverseEditPage allowed custom
 *     entries; that whole page is gone, so custom entries can no
 *     longer be created. Existing custom entries (if any) still
 *     render but can't be edited.
 *   - Universe overrides (pin/hide/notes). Universes are now fully
 *     read-only on the consumer side. The saveOverrides method still
 *     exists on useCollections for compatibility but is no longer
 *     invoked from any UI.
 *
 * SSR safety:
 *   loading is ALWAYS true initially (including SSR) so the skeleton
 *   renders. The createEffect on the client resolves the collection.
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
    unarchiveCollection,
    deleteCollection,
    duplicateCollection,
    reorderEntries,
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
  // Folder editor modal — opened by the pencil icon on the hero.
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(null);
  // Add Titles modal — opened by the Add Titles action.
  const [showAddTitles, setShowAddTitles] = createSignal(false);
  // Reorder modal — opened by the Reorder action.
  const [showReorder, setShowReorder] = createSignal(false);
  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = createSignal<Collection | null>(null);
  // Unsubscribe confirmation dialog (universes only)
  const [unsubscribeTarget, setUnsubscribeTarget] = createSignal<Collection | null>(null);

  const isUniverse = createMemo(() => collection()?.type === "curated");

  // Sort mode — only used for USER collections. Universes use the
  // activeOrder signal (story/release/franchise) directly.
  const [userSortMode, setUserSortMode] = createSignal<UserCollectionSortMode>("manual");

  // Filter — search + status pills. Applies to BOTH user collections
  // and universes. The vault is passed so the filter can resolve each
  // entry's status + the rich cast/director/genre search index.
  const filter = useCollectionFilter({ vault: watchlist });

  // Sort hook for USER collections — wraps the entries accessor and
  // returns a sorted memo. Universes skip this (TimelineEngine does
  // its own sort via timelineSort.ts).
  const sortHook = useCollectionSort();
  const sortMode = () => isUniverse() ? "manual" as UserCollectionSortMode : userSortMode();

  // ── Vault lookups for the EntryListRow (status, rating, episode progress) ──
  const vaultMap = createMemo<Map<string, WatchlistItem>>(() => {
    const map = new Map<string, WatchlistItem>();
    for (const item of watchlist()) {
      map.set(`${item.media_type}:${item.id}`, item);
    }
    return map;
  });

  // Episode progress string for a TV entry (e.g. "3/10 eps").
  // Returns null for movies or when no tracker is set.
  const episodeProgressOf = (entry: CollectionEntry): string | null => {
    if (entry.media_type !== "tv") return null;
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    if (!v) return null;
    const season = v.season;
    const episode = v.episode;
    // Prefer seasons array for the total — fall back to totalEps.
    let total: number | null = null;
    if (v.seasons && v.seasons.length > 0) {
      const s = v.seasons.find((s) => s.number === season);
      if (s) total = s.count;
    }
    if (total == null) total = v.totalEps ?? null;
    if (season == null || episode == null) return null;
    if (total == null) return `S${season} E${episode}`;
    return `S${season} E${episode}/${total}`;
  };

  // Race condition guard — incremented on every resolveCollection call.
  // When an async result comes back, it checks if its epoch matches
  // the current one. If not, the result is stale and ignored.
  let resolveEpoch = 0;

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

  // ── Action handlers ──────────────────────────────────────────
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
      // Immediately navigate the user back to /collections — the
      // archived collection is hidden from the default grid.
      navigate("/collections");
    }
  };

  const handleUnarchive = async () => {
    const col = collection();
    if (!col) return;
    await unarchiveCollection(col.id);
    showToast("Collection restored.", "success", 1500);
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

  const handleDuplicate = async () => {
    const col = collection();
    if (!col) return;
    await duplicateCollection(col.id);
    showToast("Collection duplicated.", "success", 1500);
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

  // ── Entry actions (status / rating cycle / remove) ─────────────
  const { updateStatus, updateRating } = useVault();
  void addToCollection; // addToCollection is used by AddTitlesModal directly

  const cycleStatus = async (entry: CollectionEntry) => {
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    const current = v?.status ?? null;
    // Planned → Watching → Completed → Planned (loop)
    const next = current === "Planned" ? "Watching"
              : current === "Watching" ? "Completed"
              : current === "Completed" ? "Planned"
              : "Planned";
    // If not in vault, the cycle starts at Planned (which also adds
    // the title to the vault via updateStatus on a non-existent id —
    // for now we just no-op when not in vault; the user should add it
    // via the row's "+" button which opens the Details modal).
    if (!v) {
      showToast("Open the title to add it to your watchlist first.", "info", 2000);
      return;
    }
    try {
      await updateStatus(v.id, next);
    } catch (err) {
      console.error("[CollectionDetailPage] Failed to update status:", err);
      showToast("Failed to update status.", "error");
    }
  };

  const cycleRating = async (entry: CollectionEntry) => {
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    if (!v) {
      showToast("Open the title to rate it first.", "info", 2000);
      return;
    }
    // Cycle: 0 → 5 → 6 → 7 → 8 → 9 → 10 → 0
    const current = v.rating ?? 0;
    const next = current === 0 ? 5
              : current === 5 ? 6
              : current === 6 ? 7
              : current === 7 ? 8
              : current === 8 ? 9
              : current === 9 ? 10
              : current === 10 ? 0
              : 5;
    try {
      await updateRating(v.id, next);
    } catch (err) {
      console.error("[CollectionDetailPage] Failed to update rating:", err);
      showToast("Failed to update rating.", "error");
    }
  };

  const handleRemoveEntry = async (entry: CollectionEntry) => {
    const col = collection();
    if (!col) return;
    await removeFromCollection(col.id, entry.id, entry.media_type);
  };

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

  // ── Filtered + sorted entries (USER collections only — universes use TimelineEngine) ──
  const userEntries = createMemo<CollectionEntry[]>(() => {
    const col = collection();
    if (!col || col.type === "curated") return [];
    return col.entries ?? [];
  });

  // Apply sort, then filter. Both are pure memos.
  const sortedUserEntries = createMemo(() => {
    const entries = userEntries();
    if (entries.length === 0) return [];
    return sortHook.sortNow(entries);
  });

  const filteredUserEntries = createMemo(() => {
    const entries = sortedUserEntries();
    if (entries.length === 0) return [];
    const s = filter.status();
    const q = filter.debouncedSearch();
    if (s === "all" && !q) return entries;
    // Reuse the filter's matchesStatus + matchesSearch via a fresh
    // pass — the filter hook exposes a `filter` factory but that
    // wraps an accessor; here we apply it inline for clarity.
    return entries.filter((e) => {
      // Status check
      if (s !== "all") {
        const v = vaultMap().get(`${e.media_type}:${e.id}`);
        if (!v) return false; // not in vault → only visible under "all"
        const st = (v.status ?? "").toLowerCase();
        if (s === "planned") {
          if (st !== "planned" && st !== "plan to watch") return false;
        } else if (st !== s) {
          return false;
        }
      }
      // Search check
      if (q) {
        const title = (e.title ?? e.name ?? "").toLowerCase();
        if (title.includes(q)) return true;
        if ((e.franchise ?? "").toLowerCase().includes(q)) return true;
        if ((e.entryType ?? "").toLowerCase().includes(q)) return true;
        const v = vaultMap().get(`${e.media_type}:${e.id}`);
        if (v) {
          if ((v.director ?? "").toLowerCase().includes(q)) return true;
          if (v.castList) {
            for (const c of v.castList) {
              if (c.toLowerCase().includes(q)) return true;
            }
          }
          if (v.genresList) {
            for (const g of v.genresList) {
              if (typeof g === "string" && g.toLowerCase().includes(q)) return true;
            }
          }
        }
        return false;
      }
      return true;
    });
  });

  // Whether to show drag handles on entry rows. Only when:
  //   - User collection (not universe)
  //   - Sort mode = Manual
  //   - No active filter (search or status pill other than All) —
  //     dragging when the list is filtered would reorder the wrong
  //     subset, so we hide handles until filters are cleared.
  const showDragHandles = createMemo(() =>
    !isUniverse()
    && userSortMode() === "manual"
    && filter.status() === "all"
    && !filter.debouncedSearch(),
  );

  // Whether to show the Reorder button in the action bar — same
  // conditions as the drag handles, but the button is always useful
  // even with filters (since ReorderModal operates on the full list).
  const showReorderButton = createMemo(() => !isUniverse() && userSortMode() === "manual");

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      {/* Loading state — always renders during SSR + initial client load */}
      <Show when={loading()}>
        <div class="page-enter" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
          {/* Simple skeleton — the hero loads fast so we don't need
              a fancy multi-shape placeholder. */}
          <div class="skeleton-base" style={{ width: "100%", "aspect-ratio": "16/9", "border-radius": "var(--radius-md)", "margin-bottom": "var(--sp-4)" }} />
          <div class="skeleton-base" style={{ width: "60%", height: "1.5rem", "margin": "0 auto var(--sp-2)" }} />
          <div class="skeleton-base" style={{ width: "40%", height: "1rem", "margin": "0 auto" }} />
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
            {/* Hero — UniverseDashboard. Pencil icon (bottom-right)
                opens the FolderEditor for USER collections. */}
            <UniverseDashboard
              collection={collection()!}
              activeOrder={activeOrder()}
              activeProvider={activeProvider()}
              onOrderChange={setActiveOrder}
              onProviderChange={setActiveProvider}
              onEdit={!isUniverse() ? () => setEditingFolder(collection()!) : undefined}
            />

            {/* Row 1: Action Bar */}
            <CollectionActionBar
              collection={collection()!}
              showReorder={showReorderButton()}
              onAddTitles={() => setShowAddTitles(true)}
              onReorder={() => setShowReorder(true)}
              onShare={handleShare}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onUnsubscribe={handleUnsubscribe}
            />

            {/* Row 2: Sort + Search + Filter chips */}
            <CollectionSortFilter
              collection={collection()!}
              search={filter.search}
              onSearchInput={filter.onSearchInput}
              status={filter.status}
              onStatusChange={filter.setStatus}
              sortMode={isUniverse() ? undefined : userSortMode}
              onSortModeChange={isUniverse() ? undefined : setUserSortMode}
            />

            {/* Entry renderer — flat list for user collections,
                TimelineEngine for universes. */}
            <Show
              when={!isUniverse()}
              fallback={
                <TimelineEngine
                  collection={collection()!}
                  order={activeOrder()}
                  provider={activeProvider()}
                  onOpenEntry={handleOpenEntry}
                  phases={phases()}
                />
              }
            >
              <Show
                when={filteredUserEntries().length > 0}
                fallback={
                  <GlassEmptyState
                    icon="video_library"
                    title={
                      filter.debouncedSearch() || filter.status() !== "all"
                        ? "No titles match"
                        : "No titles yet"
                    }
                    message={
                      filter.debouncedSearch() || filter.status() !== "all"
                        ? "Try adjusting your search or filters."
                        : "Use 'Add Titles' above to pull titles from your watchlist into this collection."
                    }
                    variant="default"
                  />
                }
              >
                <div class="collection-entry-list" role="list">
                  <For each={filteredUserEntries()}>
                    {(entry, i) => {
                      const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
                      return (
                        <EntryListRow
                          entry={entry}
                          index={i()}
                          status={v?.status}
                          rating={v?.rating}
                          episodeProgress={episodeProgressOf(entry) ?? undefined}
                          draggable={showDragHandles()}
                          showRemove
                          onOpen={() => handleOpenEntry(entry)}
                          onCycleStatus={() => cycleStatus(entry)}
                          onCycleRating={() => cycleRating(entry)}
                          onRemove={() => handleRemoveEntry(entry)}
                        />
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          {/* Folder editor modal — opened by the pencil icon */}
          <Show when={editingFolder()}>
            <FolderEditor
              collection={editingFolder()!}
              onClose={() => setEditingFolder(null)}
            />
          </Show>

          {/* Add Titles modal — opened by the Add Titles action */}
          <Show when={showAddTitles()}>
            <AddTitlesModal
              collection={collection()!}
              onClose={() => setShowAddTitles(false)}
            />
          </Show>

          {/* Reorder modal — opened by the Reorder action */}
          <Show when={showReorder()}>
            <ReorderModal
              collection={collection()!}
              onClose={() => setShowReorder(false)}
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
        </ErrorBoundary>
      </Show>
    </PageContainer>
  );
}
