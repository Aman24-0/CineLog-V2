// src/features/sync/components/BackupCards.tsx
//
// BackupCards — the export section of the Sync page.
//
// Renders the "Export as JSON" button (creates a V2 backup document from
// the user's watchlist and downloads it as a .json file).
//
// ARCHITECTURE:
//   Reads BACKUP_STRATEGIES from BackupService. To add a new export type,
//   register it there — this component picks it up automatically.
//
// NOTE: "Create Backup" (in-memory snapshot) and "Restore Backup" were
// removed. "Create Backup" didn't persist anything (just showed a toast).
// "Restore Backup" was 100% duplicate of "Import from JSON" — both called
// the same parseBackupFile + previewBackup + restoreBackup pipeline.
// The sync page now has a clean 2+2 structure:
//   IMPORT  → Import from JSON  +  Import from CSV
//   EXPORT  → Export as JSON    +  Export as CSV

import { For, createSignal, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import {
  BACKUP_STRATEGIES,
  createBackupFromWatchlist,
  exportBackup
} from "../backup/BackupService";

const BackupCards: Component = () => {
  const library = useUserLibrary();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = createSignal(false);

  const handleAction = async (strategyId: string) => {
    if (strategyId === "export") {
      const watchlist = library.watchlist();
      if (watchlist.length === 0) {
        showToast("Your vault is empty — nothing to export.", "info");
        return;
      }

      setIsExporting(true);
      try {
        // createBackupFromWatchlist is now async — it fetches
        // collections + presets + episode progress from Supabase
        // in addition to the in-memory watchlist.
        const doc = await createBackupFromWatchlist(
          watchlist,
          user()?.uid ?? null
        );
        exportBackup(doc);

        const collectionCount = doc.library.collections?.length ?? 0;
        const presetCount = doc.library.presets?.length ?? 0;
        const progressCount = doc.library.episodeProgress?.length ?? 0;
        showToast(
          `Backup downloaded — ${doc.library.watchlist.length} titles` +
            (collectionCount > 0 ? `, ${collectionCount} collections` : "") +
            (presetCount > 0 ? `, ${presetCount} presets` : "") +
            (progressCount > 0 ? `, ${progressCount} episode records` : ""),
          "success"
        );
      } catch (err) {
        console.error("[BackupCards] Export failed:", err);
        showToast("Couldn't create backup — please try again.", "error");
      } finally {
        setIsExporting(false);
      }
      return;
    }
  };

  return (
    <div class="sync-backup-cards">
      {/* Available strategies */}
      <For each={BACKUP_STRATEGIES}>
        {(strategy) => (
          <button
            type="button"
            class="sync-backup-card focus-ring"
            onClick={() => handleAction(strategy.id)}
            disabled={isExporting()}
            aria-label={strategy.displayName}
            aria-busy={isExporting()}
          >
            <div class="sync-backup-card-icon" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "22px", color: "var(--p)" }}
                aria-hidden="true"
              >
                {strategy.icon}
              </span>
            </div>
            <div class="sync-backup-card-text">
              <p class="sync-backup-card-title">
                {isExporting() ? "Exporting…" : strategy.displayName}
              </p>
              <p class="sync-backup-card-desc">
                {isExporting()
                  ? "Fetching collections + presets + episode progress…"
                  : strategy.description}
              </p>
            </div>
            <span
              class="material-symbols-outlined sync-backup-card-chevron"
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </button>
        )}
      </For>
    </div>
  );
};

export default BackupCards;
