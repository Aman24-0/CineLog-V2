// src/features/watchlist/useVaultPresets.ts
import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import {
  fetchPresetsFromSupabase,
  createPresetInSupabase,
  renamePresetInSupabase,
  deletePresetFromSupabase,
} from "./presetAdapter";
import type { FilterPreset, VaultFilters } from "~/shared/types";

/**
 * useVaultPresets — owns the presets signal + CRUD operations.
 *
 * Extracted from useVault.tsx to keep that file under the 250-line limit.
 * Presets are Supabase-backed (Phase 12.2 migration); this hook owns the
 * local signal cache and re-fetches on session changes.
 *
 * The hook subscribes to `onSessionChange` so presets auto-refresh when
 * the user signs in/out. Callers get accessors + save/delete/rename
 * handlers that already wire up toast feedback + cache refresh.
 */
export interface UseVaultPresetsResult {
  presets: () => FilterPreset[];
  refreshPresets: (userId: string) => Promise<void>;
  savePreset: (name: string, filters: VaultFilters) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
  renamePreset: (presetId: string, name: string) => Promise<void>;
}

export function useVaultPresets(): UseVaultPresetsResult {
  const { showToast } = useToast();
  const [presets, setPresets] = createSignal<FilterPreset[]>([]);

  let unsubAuth: (() => void) | null = null;

  /** Refresh presets from Supabase (single source of truth). */
  const refreshPresets = async (userId: string) => {
    try {
      const items = await fetchPresetsFromSupabase(userId);
      setPresets(items);
    } catch (err) {
      console.error("[useVault] Error fetching presets:", err);
    }
  };

  onMount(() => {
    try {
      const subscription = onSessionChange(
        async (_event, session: Session | null) => {
          const supabaseUid = session?.user?.id ?? null;
          if (supabaseUid) {
            await refreshPresets(supabaseUid);
          } else {
            setPresets([]);
          }
        },
      );
      unsubAuth = () => subscription.unsubscribe();
    } catch (err) {
      console.error("[useVault] Presets auth subscription failed:", err);
    }
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
  });

  const uid = () => getCurrentUid();

  const savePreset = async (name: string, filters: VaultFilters) => {
    if (!uid()) return;
    try {
      await createPresetInSupabase(uid()!, name, filters);
      await refreshPresets(uid()!);
      showToast("Preset saved!", "success");
    } catch {
      showToast("Failed to save preset.", "error");
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!uid()) return;
    try {
      await deletePresetFromSupabase(presetId);
      await refreshPresets(uid()!);
      showToast("Preset deleted.", "success");
    } catch {
      showToast("Failed to delete preset.", "error");
    }
  };

  const renamePreset = async (presetId: string, name: string) => {
    if (!uid()) return;
    try {
      await renamePresetInSupabase(presetId, name);
      await refreshPresets(uid()!);
      showToast("Preset renamed.", "success");
    } catch {
      showToast("Failed to rename preset.", "error");
    }
  };

  return { presets, refreshPresets, savePreset, deletePreset, renamePreset };
}
