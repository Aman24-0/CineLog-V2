// src/features/sync/components/BackupCards.tsx
//
// BackupCards — the backup section of the Sync page.
//
// Renders cards for: Create Backup, Export Backup, Restore Backup.
// Plus future strategies (Scheduled, Encrypted, Cloud) as "coming soon".
//
// ARCHITECTURE:
//   Reads BACKUP_STRATEGIES + FUTURE_BACKUP_STRATEGIES from BackupService.
//   To add a new backup type, register it there — this component picks
//   it up automatically.

import { For, Show, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useToast } from "~/shared/hooks/useToast";
import {
  BACKUP_STRATEGIES, FUTURE_BACKUP_STRATEGIES,
  createBackupFromWatchlist, exportBackup, parseBackupFile, previewBackup,
  restoreBackup, type BackupDocument, type BackupPreview, type RestoreResult,
} from "../backup/BackupService";

const BackupCards: Component = () => {
  const library = useUserLibrary();
  const { showToast } = useToast();
  const [restoreOpen, setRestoreOpen] = createSignal(false);
  const [restoreDoc, setRestoreDoc] = createSignal<BackupDocument | null>(null);
  const [restorePreview, setRestorePreview] = createSignal<BackupPreview | null>(null);
  const [restoreResult, setRestoreResult] = createSignal<RestoreResult | null>(null);
  const [restoring, setRestoring] = createSignal(false);
  const [restoreError, setRestoreError] = createSignal<string | null>(null);

  const handleAction = async (strategyId: string) => {
    if (strategyId === "create") {
      const doc = createBackupFromWatchlist(library.watchlist());
      showToast(`Backup created — ${doc.library.watchlist.length} titles`, "success");
      return;
    }
    if (strategyId === "export") {
      const doc = createBackupFromWatchlist(library.watchlist());
      exportBackup(doc);
      showToast("Backup downloaded", "success");
      return;
    }
    if (strategyId === "restore") {
      setRestoreOpen(true);
      return;
    }
  };

  const handleFileSelect = async (file: File) => {
    setRestoreError(null);
    try {
      const doc = await parseBackupFile(file);
      setRestoreDoc(doc);
      setRestorePreview(previewBackup(doc));
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Failed to read backup file.");
    }
  };

  const handleRestore = async () => {
    if (!restoreDoc()) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const result = await restoreBackup(restoreDoc()!, library.watchlist());
      setRestoreResult(result);
      void library.refresh();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  };

  const handleCloseRestore = () => {
    setRestoreOpen(false);
    setRestoreDoc(null);
    setRestorePreview(null);
    setRestoreResult(null);
    setRestoreError(null);
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
            aria-label={strategy.displayName}
          >
            <div class="sync-backup-card-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "22px", color: "var(--p)" }} aria-hidden="true">{strategy.icon}</span>
            </div>
            <div class="sync-backup-card-text">
              <p class="sync-backup-card-title">{strategy.displayName}</p>
              <p class="sync-backup-card-desc">{strategy.description}</p>
            </div>
            <span class="material-symbols-outlined sync-backup-card-chevron" aria-hidden="true">arrow_forward</span>
          </button>
        )}
      </For>

      {/* Future strategies */}
      <For each={FUTURE_BACKUP_STRATEGIES}>
        {(strategy) => (
          <div class="sync-backup-card sync-backup-card-future" aria-disabled="true">
            <div class="sync-backup-card-icon sync-backup-card-icon-future" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "22px", color: "var(--text-dim)" }} aria-hidden="true">{strategy.icon}</span>
            </div>
            <div class="sync-backup-card-text">
              <p class="sync-backup-card-title">{strategy.displayName}</p>
              <p class="sync-backup-card-desc">{strategy.description}</p>
            </div>
            <span class="sync-backup-card-badge">{strategy.comingSoonLabel}</span>
          </div>
        )}
      </For>

      {/* Restore modal */}
      <Show when={restoreOpen()}>
        <Portal>
          <div
            class="modal-backdrop fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{
              background: "rgba(0,0,0,0.85)",
              "backdrop-filter": "blur(8px)",
              "-webkit-backdrop-filter": "blur(8px)",
            }}
            onClick={handleCloseRestore}
            role="dialog"
            aria-modal="true"
            aria-label="Restore backup"
          >
            <div
              class="modal-sheet-enter modal-surface sync-restore-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="sheet-handle sm:hidden" aria-hidden="true" />
              <button
                type="button"
                onClick={handleCloseRestore}
                class="sync-wizard-close focus-ring"
                aria-label="Close restore"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">close</span>
              </button>

              <Show when={!restoreResult()} fallback={
                <div class="sync-restore-result">
                  <div class="sync-restore-result-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">check_circle</span>
                  </div>
                  <h2 class="sync-restore-result-title">Restore Complete</h2>
                  <p class="sync-restore-result-body">{restoreResult()!.summary}</p>
                  <button class="btn-primary focus-ring" onClick={handleCloseRestore}>Done</button>
                </div>
              }>
                <Show when={!restoreDoc()} fallback={
                  <div class="sync-restore-preview">
                    <h2 class="sync-restore-title">Restore Preview</h2>
                    <p class="sync-restore-body">This backup contains:</p>
                    <div class="sync-restore-preview-grid">
                      <span><strong>{restorePreview()!.titles}</strong> titles</span>
                      <span><strong>{restorePreview()!.ratings}</strong> ratings</span>
                      <span><strong>{restorePreview()!.notes}</strong> notes</span>
                    </div>
                    <p class="sync-restore-note">
                      Titles already in your library will be skipped. No duplicates will be created.
                    </p>
                    <Show when={restoreError()}>
                      <p class="sync-restore-error" role="alert">{restoreError()}</p>
                    </Show>
                    <div class="sync-restore-actions">
                      <button class="btn-ghost focus-ring" onClick={handleCloseRestore} disabled={restoring()}>Cancel</button>
                      <button class="btn-primary focus-ring" onClick={handleRestore} disabled={restoring()}>
                        {restoring() ? "Restoring…" : "Restore Now"}
                      </button>
                    </div>
                  </div>
                }>
                  <div class="sync-restore-upload">
                    <h2 class="sync-restore-title">Restore from Backup</h2>
                    <p class="sync-restore-body">Select a CineLog backup file (.json) to restore your library.</p>
                    <label class="sync-restore-file-label focus-ring">
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          if (file) void handleFileSelect(file);
                        }}
                        style={{ display: "none" }}
                      />
                      <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">upload_file</span>
                      Choose backup file
                    </label>
                    <Show when={restoreError()}>
                      <p class="sync-restore-error" role="alert">{restoreError()}</p>
                    </Show>
                    <button class="btn-ghost focus-ring sync-restore-cancel" onClick={handleCloseRestore}>Cancel</button>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default BackupCards;
