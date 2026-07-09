// src/features/watchlist/useVault.ts
//
// Phase 10.3 — Compatibility Wrapper
// -----------------------------------
// useVault() is now a COMPATIBILITY WRAPPER around useUserLibrary().
// The READ path (watchlist, loading, isGuest, error) delegates entirely
// to the shared UserLibraryProvider. Only the WRITE methods (which call
// vaultAdapter + episodeProgressAdapter) and PRESETS (Firestore) remain.
//
// DEPRECATED: New code should use useUserLibrary() directly. This wrapper
// exists only so existing consumers (CollectionsPage, WatchlistView,
// DetailsModal, etc.) continue working without modification.
//
// Architecture:
//   App → UserLibraryProvider → useUserLibrary() → useVault() (compat) → consumers
//
// The provider owns the SINGLE fetch + auth subscription + state.
// This wrapper adds only vault-specific WRITE methods + presets on top.
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent } from "solid-js";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/core/firebase";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { UserLibrary } from "~/shared/hooks/useUserLibrary";
import {
  deleteVaultItemInSupabase,
  toggleFavoriteInSupabase,
  togglePinnedInSupabase,
  updateNotesInSupabase,
  updateProgressInSupabase,
  updateRatingInSupabase,
  updateStatusInSupabase,
  updateWatchDateInSupabase
} from "./vaultAdapter";
import {
  updateSeasonEpisodeInSupabase,
  updateWatchProgressInSupabase
} from "./episodeProgressAdapter";
import {
  savePreset as svcSavePreset,
  deletePreset as svcDeletePreset,
  renamePreset as svcRenamePreset
} from "./watchlistService";
import type { WatchProgress, FilterPreset, VaultFilters } from "~/shared/types";

/**
 * Vault interface — extends UserLibrary with vault-specific write methods
 * and presets.
 */
export interface VaultStore extends UserLibrary {
  readonly presets: () => FilterPreset[];
  readonly uid: () => string | null;
  readonly updateStatus: (itemId: string, status: string) => Promise<void>;
  readonly updateRating: (itemId: string, rating: number) => Promise<void>;
  readonly updateNotes: (itemId: string, notes: string) => Promise<void>;
  readonly updateWatchDate: (itemId: string, watchDate: string) => Promise<void>;
  readonly updateSeasonEpisode: (itemId: string, season: number, episode: number) => Promise<void>;
  readonly updateWatchProgress: (itemId: string, progress: WatchProgress) => Promise<void>;
  readonly deleteWatchlistItem: (itemId: string) => Promise<void>;
  readonly toggleFavorite: (itemId: string) => Promise<void>;
  readonly togglePinned: (itemId: string) => Promise<void>;
  readonly updateProgress: (itemId: string, progressMinutes: number) => Promise<void>;
  readonly savePreset: (name: string, filters: VaultFilters) => Promise<void>;
  readonly deletePreset: (presetId: string) => Promise<void>;
  readonly renamePreset: (presetId: string, name: string) => Promise<void>;
}

const useVaultLogic = (): VaultStore => {
  // READ path: delegate to the shared UserLibraryProvider
  const library = useUserLibrary();
  const { watchlist, loading, isGuest, error, refresh } = library;

  const { showToast } = useToast();
  const [presets, setPresets] = createSignal<FilterPreset[]>([]);

  // Presets still need their own Firestore onSnapshot (no Supabase table yet)
  let unsubPresets: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    // Subscribe to auth for presets subscription lifecycle only.
    // The vault data itself is handled by UserLibraryProvider.
    const subscription = onSessionChange(async (_event, session: Session | null) => {
      const supabaseUid = session?.user?.id ?? null;
      if (unsubPresets) { unsubPresets(); unsubPresets = null; }

      if (supabaseUid) {
        // PRESETS: still on Firestore (no Supabase PresetRepository).
        unsubPresets = onSnapshot(
          collection(db, "users", supabaseUid, "presets"),
          (snap) => {
            setPresets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FilterPreset));
          },
          (err) => console.error("Error fetching presets:", err)
        );
      } else {
        setPresets([]);
      }
    });
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
    if (unsubPresets) unsubPresets();
  });

  // uid — derived from the auth provider (same source as UserLibraryProvider)
  const uid = () => getCurrentUid();

  // ---- Write operations (ALL via Supabase through vaultAdapter) ----
  // After each write, refresh() is called to re-fetch from the provider.
  // This triggers the SINGLE fetch in UserLibraryProvider — no duplicate.

  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateStatusInSupabase(uid()!, itemId, item.media_type, status);
      await refresh();
      showToast("Status updated!", "success");
    } catch (err) { showToast("Failed to update status.", "error"); throw err; }
  };

  const updateRating = async (itemId: string, rating: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateRatingInSupabase(uid()!, itemId, item.media_type, rating);
      await refresh();
      showToast("Rating updated!", "success");
    } catch (err) { showToast("Failed to update rating.", "error"); throw err; }
  };

  const updateNotes = async (itemId: string, notes: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateNotesInSupabase(uid()!, itemId, item.media_type, notes);
      await refresh();
      showToast("Notes saved!", "success");
    } catch (err) { showToast("Failed to save notes.", "error"); throw err; }
  };

  const updateWatchDate = async (itemId: string, watchDate: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateWatchDateInSupabase(uid()!, itemId, item.media_type, watchDate);
      await refresh();
      showToast("Watch date updated!", "success");
    } catch (err) { showToast("Failed to update watch date.", "error"); throw err; }
  };

  const updateSeasonEpisode = async (itemId: string, season: number, episode: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateSeasonEpisodeInSupabase(uid()!, itemId, item.media_type, season, episode);
      await refresh();
      showToast("Episode progress updated!", "success");
    } catch (err) { showToast("Failed to update episode progress.", "error"); throw err; }
  };

  const updateWatchProgress = async (itemId: string, progress: WatchProgress) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    const item = watchlist().find((m) => m.id === itemId);
    try {
      if (item && (item.status === "Planned" || item.status === "Plan to Watch")) {
        await updateStatusInSupabase(uid()!, itemId, item.media_type, "Watching");
      }
      if (item) {
        await updateWatchProgressInSupabase(uid()!, itemId, item.media_type, progress);
      }
      await refresh();
    } catch (err) { showToast("Failed to save progress.", "error"); throw err; }
  };

  const deleteWatchlistItem = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await deleteVaultItemInSupabase(uid()!, itemId, item.media_type);
      await refresh();
      showToast("Item deleted.", "success");
    } catch (err) { showToast("Failed to delete item.", "error"); throw err; }
  };

  const toggleFavorite = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await toggleFavoriteInSupabase(uid()!, itemId, item.media_type, false);
      await refresh();
    } catch (err) { showToast("Failed to toggle favorite.", "error"); throw err; }
  };

  const togglePinned = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await togglePinnedInSupabase(uid()!, itemId, item.media_type, false);
      await refresh();
    } catch (err) { showToast("Failed to toggle pin.", "error"); throw err; }
  };

  const updateProgress = async (itemId: string, progressMinutes: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateProgressInSupabase(uid()!, itemId, item.media_type, progressMinutes);
      await refresh();
    } catch (err) { showToast("Failed to update progress.", "error"); throw err; }
  };

  // ---- Presets (still Firestore — no Supabase table yet) ----
  const savePreset = async (name: string, filters: VaultFilters) => {
    if (!uid()) return;
    try { await svcSavePreset(uid()!, name, filters); showToast("Preset saved!", "success"); }
    catch { showToast("Failed to save preset.", "error"); }
  };
  const deletePreset = async (presetId: string) => {
    if (!uid()) return;
    try { await svcDeletePreset(uid()!, presetId); showToast("Preset deleted.", "success"); }
    catch { showToast("Failed to delete preset.", "error"); }
  };
  const renamePreset = async (presetId: string, name: string) => {
    if (!uid()) return;
    try { await svcRenamePreset(uid()!, presetId, name); showToast("Preset renamed.", "success"); }
    catch { showToast("Failed to rename preset.", "error"); }
  };

  return {
    watchlist, loading, isGuest, error,
    presets, uid,
    updateStatus, updateRating, updateNotes, updateWatchDate,
    updateSeasonEpisode, updateWatchProgress, deleteWatchlistItem,
    toggleFavorite, togglePinned, updateProgress,
    savePreset, deletePreset, renamePreset,
    refresh
  };
};

const VaultContext = createContext<VaultStore>();

export const VaultProvider: ParentComponent = (props) => {
  const vault = useVaultLogic();
  return <VaultContext.Provider value={vault}>{props.children}</VaultContext.Provider>;
};

/** @deprecated Use useUserLibrary() directly for read-only access. */
export function useVault(): VaultStore {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
