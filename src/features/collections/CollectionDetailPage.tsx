// src/features/collections/CollectionDetailPage.tsx
import {
  Show,
  createSignal,
  createEffect,
  createMemo,
  ErrorBoundary,
  For
} from "solid-js";
import { isServer } from "solid-js/web";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { NotFoundState } from "~/shared/ui/states";
import { useVault } from "~/features/watchlist/useVault";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { useToast } from "~/shared/hooks/useToast";
import {
  fetchCuratedUniverseBySlug,
  fetchPhasesForUniverse,
  fetchViewingOrdersForUniverse,
  withCustomViewingOrders,
  withPhases
} from "./curatedUniverseAdapter";
import { useCuratedUniverses } from "./hooks/useCuratedUniverses";
import UniverseDashboard from "./components/UniverseDashboard";
import RichUniverseHub from "./components/RichUniverseHub";
import TimelineEngine from "./components/TimelineEngine";
import CollectionActionBar from "./components/CollectionActionBar";
import CollectionSortFilter from "./components/CollectionSortFilter";
import AddTitlesModal from "./components/AddTitlesModal";
import ReorderModal from "./components/ReorderModal";
import EntryListRow from "./components/EntryListRow";
import FolderEditor from "./components/FolderEditor";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import BulkActionBar from "./components/BulkActionBar";
import { useCollectionFilter } from "./hooks/useCollectionFilter";
import {
  useCollectionSort,
  type UserCollectionSortMode
} from "./hooks/useCollectionSort";
import { GlassEmptyState } from "~/shared/ui/glass";
import type {
  Collection,
  CollectionEntry,
  UniversePhase,
  ViewingOrder,
  TimelineProvider,
  WatchlistItem
} from "~/shared/types";

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
  const { watchlist, refresh: refreshVault } = useVault();
  const {
    userCollections,
    getUniversePrefs,
    removeFromCollection,
    addToCollection,
    archiveCollection,
    unarchiveCollection,
    deleteCollection,
    duplicateCollection,
    resolveSmartCollection,
    removeUniverseFromPrefs
  } = useCollections();
  const { openTitle } = useModalState();
  const { showToast } = useToast();
  const { refresh: refreshUniverses, removeSubscribedUniverse } = useCuratedUniverses();

  const [activeOrder, setActiveOrder] =
    createSignal<ViewingOrder>("chronological");
  const [activeProvider, setActiveProvider] =
    createSignal<TimelineProvider>("cinelog");

  // loading is ALWAYS true initially (including SSR) so the skeleton
  // renders. Never false until the client resolves the collection.
  const [collection, setCollection] = createSignal<Collection | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);
  // Phase dividers — fetched separately for curated universes.
  // Empty for user collections.
  const [phases, setPhases] = createSignal<UniversePhase[]>([]);
  // Folder editor modal — opened by the pencil icon on the hero.
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(
    null
  );
  // Add Titles modal — opened by the Add Titles action.
  const [showAddTitles, setShowAddTitles] = createSignal(false);
  // Reorder modal — opened by the Reorder action.
  const [showReorder, setShowReorder] = createSignal(false);
  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = createSignal<Collection | null>(null);
  // Unsubscribe confirmation dialog (universes only)
  const [unsubscribeTarget, setUnsubscribeTarget] =
    createSignal<Collection | null>(null);
  // Phase 6 Task 1 — Refreshing state for the "Refresh smart collection"
  // button. Re-evaluates the smart rules against the user's current vault
  // (which we already do reactively, but the button also pulls a fresh
  // vault from Supabase in case new items were added on another device).
  const [isRefreshingSmart, setIsRefreshingSmart] = createSignal(false);
  // Smart-collection builder modal — opened by the "Edit rules" action.
  const [showSmartBuilder, setShowSmartBuilder] = createSignal(false);

  // Phase 6.2 Task 2a — Multi-select bulk mode for entries.
  // bulkMode: when true, EntryListRow shows checkboxes instead of remove
  //   buttons, and a BulkActionBar appears at the bottom of the entry list.
  // selectedEntryKeys: a Set of "media_type:id" strings for entries the
  //   user has tapped. Cleared on cancel / after a successful bulk remove.
  // isBulkRemoving: disables the bulk bar buttons while the sequential
  //   remove operations are in-flight.
  const [bulkMode, setBulkMode] = createSignal(false);
  const [selectedEntryKeys, setSelectedEntryKeys] = createSignal<Set<string>>(
    new Set()
  );
  const [isBulkRemoving, setIsBulkRemoving] = createSignal(false);

  const entryKey = (e: CollectionEntry) => `${e.media_type}:${e.id}`;

  const toggleEntrySelection = (entry: CollectionEntry) => {
    const key = entryKey(entry);
    setSelectedEntryKeys((prev) => {
      const next = new Set<string>(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    const all = new Set<string>();
    for (const e of filteredUserEntries()) all.add(entryKey(e));
    setSelectedEntryKeys(all);
  };

  const deselectAll = () => setSelectedEntryKeys(new Set<string>());

  const exitBulkMode = () => {
    setBulkMode(false);
    deselectAll();
  };

  const enterBulkMode = () => {
    setBulkMode(true);
    // Don't pre-select anything — let the user choose.
    deselectAll();
  };

  const handleBulkRemove = async () => {
    const col = collection();
    if (!col) return;
    const selected = selectedEntryKeys();
    if (selected.size === 0) return;
    // Find the actual entry objects so we can pass them to removeFromCollection.
    // We use the FULL entry list (not filtered) because the user may have
    // selected entries that are now hidden by a filter.
    const allEntries = col.entries ?? [];
    const toRemove = allEntries.filter((e) => selected.has(entryKey(e)));
    if (toRemove.length === 0) {
      exitBulkMode();
      return;
    }
    setIsBulkRemoving(true);
    let successCount = 0;
    let failCount = 0;
    // Sequential — preserves the optimistic-update pattern in
    // removeFromCollection (each call updates the local signal immediately).
    for (const entry of toRemove) {
      try {
        await removeFromCollection(col.id, entry.id, entry.media_type);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(
          `[CollectionDetailPage] bulk-remove failed for ${entry.id}:`,
          err
        );
      }
    }
    setIsBulkRemoving(false);
    if (successCount > 0) {
      showToast(
        `Removed ${successCount} entr${successCount === 1 ? "y" : "ies"} from ${col.name}.`,
        "success"
      );
    }
    if (failCount > 0) {
      showToast(
        `Failed to remove ${failCount} entr${failCount === 1 ? "y" : "ies"}.`,
        "error"
      );
    }
    exitBulkMode();
  };

  const isUniverse = createMemo(() => collection()?.type === "curated");

  // Sort mode — only used for USER collections. Universes use the
  // activeOrder signal (story/release/franchise) directly.
  const [userSortMode, setUserSortMode] =
    createSignal<UserCollectionSortMode>("manual");

  // Filter — search + status pills. Applies to BOTH user collections
  // and universes. The vault is passed so the filter can resolve each
  // entry's status + the rich cast/director/genre search index.
  const filter = useCollectionFilter({ vault: watchlist });

  // Sort hook for USER collections — wraps the entries accessor and
  // returns a sorted memo. Universes skip this (TimelineEngine does
  // its own sort via timelineSort.ts).
  const sortHook = useCollectionSort();

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
        //    dividers from the `universe_phases` table AND custom
        //    viewing orders from `universe_viewing_orders` (Phase 9
        //    Chunk 5a). Both are rendered in the user-side UI.
        const [universePhases, viewingOrders] = await Promise.all([
          fetchPhasesForUniverse(curated.id),
          fetchViewingOrdersForUniverse(curated.id)
        ]);
        if (myEpoch !== resolveEpoch) return;
        let enriched = curated;
        if (universePhases.length > 0) {
          enriched = withPhases(enriched, universePhases);
        }
        if (viewingOrders.length > 0) {
          enriched = withCustomViewingOrders(enriched, viewingOrders);
        }
        setCollection(enriched);
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
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/collections/${col.id}`
        : "";
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Collection link copied", "success", 1500),
        () => showToast("Copy failed", "error", 1500)
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
    // Phase 9 Chunk 5a: Optimistic removal — drop the universe from the
    // shared subscribedUniverses signal immediately so the Collections
    // grid updates without waiting for the refetch.
    removeSubscribedUniverse(target.id);
    try {
      await removeUniverseFromPrefs(target.id);
      await refreshUniverses();
    } catch (err) {
      console.error("[CollectionDetailPage] Unsubscribe failed:", err);
      // On error, the refresh above won't have run; force a refresh to
      // reconcile the optimistic removal with the server state.
      await refreshUniverses();
    }
    setUnsubscribeTarget(null);
    showToast(`Unsubscribed from "${target.name}"`, "success");
    navigate("/collections");
  };

  // ── Smart collection actions ──────────────────────────────────────
  //
  // Phase 6 Task 1 — Smart collections evaluate their rules against the
  // user's vault LIVE (resolveSmartCollection), so the entry list always
  // reflects the current vault state. The "Refresh" button pulls a fresh
  // vault from Supabase (in case items were added on another device) and
  // shows a confirmation toast with the new match count.

  const handleRefreshSmart = async () => {
    const col = collection();
    if (!col?.isSmart) return;
    setIsRefreshingSmart(true);
    try {
      await refreshVault();
      const matched = resolveSmartCollection(collection()!, watchlist());
      showToast(
        `Refreshed — ${matched.length} title${matched.length === 1 ? "" : "s"} match.`,
        "success",
        2000
      );
    } catch (err) {
      console.error("[CollectionDetailPage] Refresh smart failed:", err);
      showToast("Failed to refresh. Try again.", "error");
    } finally {
      setIsRefreshingSmart(false);
    }
  };

  const handleEditSmartRules = () => {
    setShowSmartBuilder(true);
  };

  // ── Entry actions (status / rating cycle / remove) ─────────────
  const { updateStatus, updateRating } = useVault();
  void addToCollection; // addToCollection is used by AddTitlesModal directly

  const cycleStatus = async (entry: CollectionEntry) => {
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    const current = v?.status ?? null;
    // Planned → Watching → Completed → Planned (loop)
    const next =
      current === "Planned"
        ? "Watching"
        : current === "Watching"
          ? "Completed"
          : current === "Completed"
            ? "Planned"
            : "Planned";
    // If not in vault, the cycle starts at Planned (which also adds
    // the title to the vault via updateStatus on a non-existent id —
    // for now we just no-op when not in vault; the user should add it
    // via the row's "+" button which opens the Details modal).
    if (!v) {
      showToast(
        "Open the title to add it to your watchlist first.",
        "info",
        2000
      );
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
    const next =
      current === 0
        ? 5
        : current === 5
          ? 6
          : current === 6
            ? 7
            : current === 7
              ? 8
              : current === 8
                ? 9
                : current === 9
                  ? 10
                  : current === 10
                    ? 0
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

  // Add a universe entry that isn't in the user's vault to the vault.
  // Used by the TimelineEntry "+" missing badge on the universe detail
  // page — lets users browsing a curated universe one-tap add titles
  // they haven't watched yet. After the create succeeds, we refresh
  // the vault so the filter's vaultMap updates immediately (the entry
  // will then show under its matching status pill and the "+"
  // badge disappears).
  const handleAddToWatchlist = async (entry: CollectionEntry) => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    try {
      const item: WatchlistItem = {
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
      await createVaultItemInSupabase(uid, item);
      await refreshVault();
      const name = entry.title || entry.name || "Title";
      showToast(`Added "${name}" to your watchlist`, "success", 1800);
    } catch (err) {
      console.error("[CollectionDetailPage] Failed to add to vault:", err);
      showToast("Failed to add to watchlist.", "error");
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
    setActiveOrder(
      prefs?.preferredOrder ?? col.defaultOrder ?? "chronological"
    );
    setActiveProvider(prefs?.preferredProvider ?? "cinelog");
  });

  // ── Filtered + sorted entries (USER collections only — universes use TimelineEngine) ──
  const userEntries = createMemo<CollectionEntry[]>(() => {
    const col = collection();
    if (!col || col.type === "curated") return [];
    // Phase 6 Task 1: smart collections resolve their entries DYNAMICALLY
    // from the user's vault (the rules are evaluated against the current
    // watchlist()). This means a smart collection's entry list updates
    // automatically as the user adds/removes vault items — no manual
    // refresh needed. The "Refresh" button on the action bar pulls a
    // fresh vault from Supabase to catch changes from other devices.
    if (col.isSmart && Array.isArray(col.smartRules) && col.smartRules.length > 0) {
      return resolveSmartCollection(col, watchlist());
    }
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
              if (typeof g === "string" && g.toLowerCase().includes(q))
                return true;
            }
          }
        }
        return false;
      }
      return true;
    });
  });

  // ── Universe entries + filter ──────────────────────────────────
  // Universes use the TimelineEngine for rendering, but the same
  // search/status filter from Row 2 must apply. We build a filtered
  // Collection object (entries replaced) and pass it to TimelineEngine.
  //
  // Filter semantics for universes (per spec):
  //   - "all"        → every entry, including those not in the user's
  //                    vault (treated as "Unwatched").
  //   - "watching"   → only entries whose vault status === "Watching".
  //   - "completed"  → only entries whose vault status === "Completed".
  //   - "planned"    → only entries whose vault status === "Planned"
  //                    (also covers legacy "Plan to Watch").
  //   - search       → matches title, franchise, entryType on the entry
  //                    plus cast/director/genre from the joined vault
  //                    item (vault item is null for non-vault entries).
  const universeEntries = createMemo<CollectionEntry[]>(() => {
    const col = collection();
    if (!col || col.type !== "curated") return [];
    return col.entries ?? [];
  });

  // Use the filter factory from useCollectionFilter — same matchesStatus
  // + matchesSearch logic as the user-entries path, just wrapped in a
  // memo that tracks universeEntries + the filter's status/search signals.
  // Note: `filter` here is the useCollectionFilter hook's RETURN OBJECT
  // (status/search/setStatus signals + a `filter` factory method). We
  // call `filter.filter(...)` to invoke the factory.
  // ESLint: universeEntries is an Accessor passed by reference to the
  // filter factory, which wraps it in a createMemo (tracked scope). The
  // lint rule can't see through the factory's call boundary.
  // eslint-disable-next-line solid/reactivity
  const filteredUniverseEntries = filter.filter(universeEntries);

  // Build a derived Collection with the filtered entries for TimelineEngine.
  // Returns null when collection() is null; the parent only reads this
  // inside <Show when={collection()}> blocks so null is never observed.
  const universeCollection = createMemo<Collection | null>(() => {
    const col = collection();
    if (!col) return null;
    const entries = filteredUniverseEntries();
    // Skip cloning when no filter is active — preserves object identity
    // so TimelineEngine's keyed <For> doesn't re-render every entry.
    if (entries.length === (col.entries ?? []).length) return col;
    return { ...col, entries };
  });

  // Whether to show drag handles on entry rows. Only when:
  //   - User collection (not universe)
  //   - Sort mode = Manual
  //   - No active filter (search or status pill other than All) —
  //     dragging when the list is filtered would reorder the wrong
  //     subset, so we hide handles until filters are cleared.
  const showDragHandles = createMemo(
    () =>
      !isUniverse() &&
      userSortMode() === "manual" &&
      filter.status() === "all" &&
      !filter.debouncedSearch()
  );

  // Whether to show the Reorder button in the action bar — same
  // conditions as the drag handles, but the button is always useful
  // even with filters (since ReorderModal operates on the full list).
  const showReorderButton = createMemo(
    () => !isUniverse() && userSortMode() === "manual"
  );

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      {/* Loading state — always renders during SSR + initial client load.
          Includes a11y attributes for screen readers. */}
      <Show when={loading()}>
        <div
          class="page-enter"
          style={{ padding: "var(--sp-12) var(--sp-5)" }}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading collection"
        >
          {/* Simple skeleton — the hero loads fast so we don't need
              a fancy multi-shape placeholder. */}
          <div
            class="skeleton-base"
            style={{
              width: "100%",
              "aspect-ratio": "16/9",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--sp-4)"
            }}
            aria-hidden="true"
          />
          <div
            class="skeleton-base"
            style={{
              width: "60%",
              height: "1.5rem",
              margin: "0 auto var(--sp-2)"
            }}
            aria-hidden="true"
          />
          <div
            class="skeleton-base"
            style={{ width: "40%", height: "1rem", margin: "0 auto" }}
            aria-hidden="true"
          />
        </div>
      </Show>

      {/* Not found state — uses the shared NotFoundState component
          for consistent UX and a11y across the app. */}
      <Show when={!loading() && notFound()}>
        <NotFoundState
          resourceType="Collection"
          message="This collection may have been deleted or is no longer available."
          backHref="/collections"
          backLabel="Back to Collections"
          variant="page"
        />
      </Show>

      {/* Loaded state */}
      <Show when={!loading() && !notFound() && collection()}>
        <ErrorBoundary
          fallback={(err) => {
            console.error("[CollectionDetailPage] Render error:", err);
            return (
              <div class="page-enter">
                <button
                  type="button"
                  class="collections-back-btn"
                  onClick={() => navigate("/collections")}
                  aria-label="Back to Collections"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "18px" }}
                    aria-hidden="true"
                  >
                    arrow_back
                  </span>
                </button>
                <div class="collections-detail-empty">
                  <p class="type-body-soft" style={{ "text-align": "center" }}>
                    Something went wrong loading this collection.
                  </p>
                  <button
                    class="btn-ghost"
                    onClick={() => navigate("/collections")}
                  >
                    Back to Collections
                  </button>
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
              onEdit={
                !isUniverse()
                  ? () => setEditingFolder(collection()!)
                  : undefined
              }
            />

            {/* Phase 9 Chunk 5a: Rich Universe Hub — renders lore,
                viewing_order_guide, custom viewing order selector,
                sub-universe filter, and an enhanced entry grid with
                story notes, key events, and entry point badges.
                Only rendered when the universe has Phase 9 Chunk 5a
                rich data (lore, viewing_order_guide, or custom
                viewing orders). Universes without that data fall
                through to the existing TimelineEngine below. */}
            <Show
              when={
                collection()?.type === "curated" &&
                (
                  collection()?.lore ||
                  collection()?.viewingOrderGuide ||
                  (collection()?.customViewingOrders ?? []).length > 0 ||
                  (collection()?.entries ?? []).some(
                    (e) => e.storyNote || (e.keyEvents && e.keyEvents.length > 0) || e.isEntryPoint
                  )
                )
              }
            >
              <RichUniverseHub collection={collection()!} />
            </Show>

            {/* Row 1: Action Bar */}
            <CollectionActionBar
              collection={collection()!}
              showReorder={showReorderButton()}
              bulkMode={bulkMode()}
              onAddTitles={() => setShowAddTitles(true)}
              onReorder={() => setShowReorder(true)}
              onSelect={() => {
                if (bulkMode()) exitBulkMode();
                else enterBulkMode();
              }}
              onShare={handleShare}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onUnsubscribe={handleUnsubscribe}
            />

            {/* Smart collection controls — Refresh + Edit Rules.
                Phase 6 Task 1: smart collections evaluate their rules
                against the vault live, but the user can pull a fresh
                vault from Supabase (in case items were added on another
                device) or re-open the builder to tweak the rules. */}
            <Show when={collection()?.isSmart}>
              <div
                class="smart-collection-controls"
                style={{
                  display: "flex",
                  gap: "var(--sp-2)",
                  "margin-top": "var(--sp-2)",
                  "flex-wrap": "wrap"
                }}
              >
                <button
                  type="button"
                  class="collection-action-bar-btn focus-ring"
                  onClick={() => void handleRefreshSmart()}
                  disabled={isRefreshingSmart()}
                  aria-label="Refresh smart collection"
                  title="Re-evaluate rules against your current vault"
                >
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      "font-size": "18px",
                      // Spin animation while refreshing — uses a CSS
                      // animation defined in utilities/transitions.css
                      // via the `spin` class. We add it conditionally
                      // to avoid the animation running when not refreshing.
                      animation: isRefreshingSmart()
                        ? "cinelog-spin 0.9s linear infinite"
                        : "none"
                    }}
                  >
                    refresh
                  </span>
                  <span class="collection-action-bar-btn-label">
                    {isRefreshingSmart() ? "Refreshing…" : "Refresh"}
                  </span>
                </button>
                <button
                  type="button"
                  class="collection-action-bar-btn focus-ring"
                  onClick={() => handleEditSmartRules()}
                  aria-label="Edit smart collection rules"
                  title="Edit rules"
                >
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-size": "18px" }}
                  >
                    tune
                  </span>
                  <span class="collection-action-bar-btn-label">
                    Edit Rules
                  </span>
                </button>
              </div>
            </Show>

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
                TimelineEngine for universes. Both paths apply the
                Row 2 search + status filter to their entries. */}
            <Show
              when={!isUniverse()}
              fallback={
                <Show
                  when={filteredUniverseEntries().length > 0}
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
                          : "This universe has no titles yet."
                      }
                      variant="default"
                    />
                  }
                >
                  <TimelineEngine
                    collection={universeCollection() ?? collection()!}
                    order={activeOrder()}
                    provider={activeProvider()}
                    onOpenEntry={handleOpenEntry}
                    onAddToWatchlist={handleAddToWatchlist}
                    phases={phases()}
                  />
                </Show>
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
                      const v = vaultMap().get(
                        `${entry.media_type}:${entry.id}`
                      );
                      const key = `${entry.media_type}:${entry.id}`;
                      return (
                        <EntryListRow
                          entry={entry}
                          index={i()}
                          status={v?.status}
                          rating={v?.rating}
                          episodeProgress={
                            episodeProgressOf(entry) ?? undefined
                          }
                          draggable={showDragHandles() && !bulkMode()}
                          showRemove
                          selectable={bulkMode()}
                          selected={selectedEntryKeys().has(key)}
                          onToggleSelect={() => toggleEntrySelection(entry)}
                          onOpen={() => handleOpenEntry(entry)}
                          onCycleStatus={() => cycleStatus(entry)}
                          onCycleRating={() => cycleRating(entry)}
                          onRemove={() => handleRemoveEntry(entry)}
                        />
                      );
                    }}
                  </For>
                </div>

                {/* Phase 6.2 Task 2a — BulkActionBar appears below the
                    entry list when bulkMode is active. Sticky at the
                    bottom so it stays visible while scrolling. */}
                <Show when={bulkMode()}>
                  <BulkActionBar
                    selectedCount={selectedEntryKeys().size}
                    totalShown={filteredUserEntries().length}
                    isRemoving={isBulkRemoving()}
                    onSelectAll={selectAllVisible}
                    onDeselectAll={deselectAll}
                    onBulkRemove={handleBulkRemove}
                    onCancel={exitBulkMode}
                  />
                </Show>
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

          {/* Smart collection builder — opened by the "Edit Rules" action.
              Passes the collection's existing rules + combinator as the
              initial state, and the collectionId so the builder calls
              updateSmartRules (instead of createSmartCollection). */}
          <Show when={showSmartBuilder() && collection()?.isSmart}>
            <SmartCollectionBuilder
              onClose={() => setShowSmartBuilder(false)}
              collectionId={collection()!.id}
              initial={{
                name: collection()!.name,
                rules: collection()!.smartRules ?? [],
                combinator: collection()!.smartRulesCombinator ?? "and"
              }}
            />
          </Show>

          {/* Delete confirmation dialog */}
          <Show when={deleteTarget()}>
            {(target) => (
              <div
                class="animate-fade-in fixed inset-0 z-[999999] flex items-center justify-center p-4"
                style={{
                  background: "rgba(0,0,0,0.85)",
                  "backdrop-filter": "blur(8px)",
                  "-webkit-backdrop-filter": "blur(8px)"
                }}
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
                  <div
                    style={{
                      "text-align": "center",
                      "margin-bottom": "var(--sp-5)"
                    }}
                  >
                    <div
                      class="glass-empty-state-icon"
                      aria-hidden="true"
                      style={{ margin: "0 auto var(--sp-3)" }}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "32px", color: "#f87171" }}
                        aria-hidden="true"
                      >
                        delete
                      </span>
                    </div>
                    <h3
                      style={{
                        "font-family": "'Bebas Neue', sans-serif",
                        "font-size": "1.5rem",
                        color: "var(--text-strong)",
                        margin: "0 0 var(--sp-2)"
                      }}
                    >
                      Delete "{target().name}"?
                    </h3>
                    <p
                      style={{
                        "font-family": "'Outfit', sans-serif",
                        "font-size": "0.8125rem",
                        color: "var(--text-soft)",
                        margin: "0",
                        "line-height": "1.5"
                      }}
                    >
                      This will permanently remove the collection and all its
                      entries. This cannot be undone.
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
                      style={{
                        flex: "1",
                        background: "#f87171",
                        "box-shadow":
                          "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)"
                      }}
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
                class="animate-fade-in fixed inset-0 z-[999999] flex items-center justify-center p-4"
                style={{
                  background: "rgba(0,0,0,0.85)",
                  "backdrop-filter": "blur(8px)",
                  "-webkit-backdrop-filter": "blur(8px)"
                }}
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
                  <div
                    style={{
                      "text-align": "center",
                      "margin-bottom": "var(--sp-5)"
                    }}
                  >
                    <div
                      class="glass-empty-state-icon"
                      aria-hidden="true"
                      style={{ margin: "0 auto var(--sp-3)" }}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "32px", color: "#f87171" }}
                        aria-hidden="true"
                      >
                        remove_circle
                      </span>
                    </div>
                    <h3
                      style={{
                        "font-family": "'Bebas Neue', sans-serif",
                        "font-size": "1.5rem",
                        color: "var(--text-strong)",
                        margin: "0 0 var(--sp-2)"
                      }}
                    >
                      Unsubscribe from "{target().name}"?
                    </h3>
                    <p
                      style={{
                        "font-family": "'Outfit', sans-serif",
                        "font-size": "0.8125rem",
                        color: "var(--text-soft)",
                        margin: "0",
                        "line-height": "1.5"
                      }}
                    >
                      You'll lose access to this universe's timeline. You can
                      re-subscribe anytime from "Add Universe".
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
                      style={{
                        flex: "1",
                        background: "#f87171",
                        "box-shadow":
                          "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)"
                      }}
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
