// src/features/sync/import/sources/JsonImportWizard.tsx
//
// JsonImportWizard — file-upload import flow for CineLog backup files.
//
// FLOW:
//   Upload → Parse → Preview (counts + duplicates) → Import (progress) → Complete
//
// Supports both backup formats (auto-detected by parseBackupFile):
//   - Flat array: [WatchlistItem, ...]  (V1 export)
//   - Wrapped:    { version, library: { watchlist } }  (V2 export)
//
// The wizard reuses the BackupService for parsing, preview, and restore
// so the import path is identical to the "Restore Backup" flow — no
// duplicated logic.

import {
  createSignal, Show, For, type Component,
} from "solid-js";
import type { ImportResult } from "../ImportSource";
import {
  parseBackupFile, previewBackup, restoreBackup,
  type ParsedBackup, type BackupPreview, type RestoreResult,
} from "../../backup/BackupService";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useToast } from "~/shared/hooks/useToast";

interface JsonImportWizardProps {
  onComplete: (result: ImportResult) => void;
  onCancel: () => void;
}

type Step = "upload" | "preview" | "importing" | "complete";

const JsonImportWizard: Component<JsonImportWizardProps> = (props) => {
  const library = useUserLibrary();
  const { showToast } = useToast();
  const [step, setStep] = createSignal<Step>("upload");
  const [parsed, setParsed] = createSignal<ParsedBackup | null>(null);
  const [preview, setPreview] = createSignal<BackupPreview | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal({ processed: 0, total: 0, imported: 0, skipped: 0, failed: 0 });
  const [result, setResult] = createSignal<RestoreResult | null>(null);
  const [cancelRequested, setCancelRequested] = createSignal(false);

  const handleFileSelect = async (file: File) => {
    setError(null);
    try {
      const p = await parseBackupFile(file);
      setParsed(p);
      setPreview(previewBackup(p, library.watchlist()));
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    }
  };

  const handleImport = async () => {
    if (!parsed()) return;
    setStep("importing");
    setError(null);
    setCancelRequested(false);
    setProgress({ processed: 0, total: parsed()!.items.length, imported: 0, skipped: 0, failed: 0 });
    try {
      const res = await restoreBackup(parsed()!, library.watchlist(), {
        onProgress: (processed, total, imported, skipped, failed) => {
          setProgress({ processed, total, imported, skipped, failed });
        },
        shouldCancel: () => cancelRequested(),
      });
      setResult(res);
      setStep("complete");
      setCancelRequested(false);
      void library.refresh();
      if (cancelRequested()) {
        showToast(`Import cancelled — ${res.imported} of ${parsed()!.items.length} titles imported`, "info", 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStep("preview");
      setCancelRequested(false);
    }
  };

  const handleCancelImport = () => {
    if (step() === "importing") {
      // Signal the restore loop to stop after the current item
      setCancelRequested(true);
      showToast("Cancelling import…", "info", 2000);
    } else {
      props.onCancel();
    }
  };

  const handleFinish = () => {
    if (result()) {
      const r = result()!;
      props.onComplete({
        imported: r.imported,
        skipped: r.skipped,
        failed: r.failed,
        duplicates: r.duplicates,
        repaired: r.repaired,
        summary: r.summary,
      });
    } else {
      props.onCancel();
    }
  };

  return (
    <div class="v1-wizard">
      <div class="v1-wizard-content">
        {/* UPLOAD */}
        <Show when={step() === "upload"}>
          <div class="v1-wizard-panel">
            <div class="v1-wizard-hero-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">file_json</span>
            </div>
            <h2 class="v1-wizard-title">Import from JSON</h2>
            <p class="v1-wizard-body">
              Select a CineLog backup file to import. Both V1 and V2 backup formats are supported.
              Titles already in your library will be skipped — no duplicates.
            </p>
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
            <Show when={error()}>
              <p class="v1-wizard-error" role="alert">{error()}</p>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-ghost focus-ring" onClick={props.onCancel}>Cancel</button>
            </div>
          </div>
        </Show>

        {/* PREVIEW */}
        <Show when={step() === "preview" && preview()}>
          <div class="v1-wizard-panel">
            <h2 class="v1-wizard-title">Import Preview</h2>
            <p class="v1-wizard-body">Here's what was found in your backup file.</p>
            <div class="v1-wizard-preview-grid">
              <PreviewStat icon="movie" label="Movies" value={preview()!.movies} />
              <PreviewStat icon="tv" label="Series" value={preview()!.series} />
              <PreviewStat icon="star" label="Ratings" value={preview()!.ratings} />
              <PreviewStat icon="sticky_note_2" label="Notes" value={preview()!.notes} />
              <PreviewStat icon="check_circle" label="Completed" value={preview()!.completed} />
              <PreviewStat icon="play_circle" label="Watching" value={preview()!.watching} />
              <PreviewStat icon="content_copy" label="Duplicates" value={preview()!.duplicates} accent="warning" />
              <PreviewStat icon="download" label="Will Import" value={preview()!.willImport} accent="primary" />
            </div>
            <Show when={preview()!.repaired > 0}>
              <div class="v1-wizard-resume">
                <span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--p)" }} aria-hidden="true">auto_fix_high</span>
                <span>{preview()!.repaired} titles were automatically repaired (missing fields filled in).</span>
              </div>
            </Show>
            <Show when={preview()!.failed > 0}>
              <p class="v1-wizard-body" style={{ "font-size": "0.75rem", color: "var(--text-muted)" }}>
                {preview()!.failed} titles couldn't be imported (missing ID or invalid format) and will be skipped.
              </p>
            </Show>
            <Show when={preview()!.duplicates > 0}>
              <p class="v1-wizard-body" style={{ "font-size": "0.75rem", color: "var(--text-muted)" }}>
                {preview()!.duplicates} titles already in your library will be skipped.
              </p>
            </Show>
            <Show when={error()}>
              <p class="v1-wizard-error" role="alert">{error()}</p>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-ghost focus-ring" onClick={() => { setStep("upload"); setParsed(null); setPreview(null); setError(null); }}>Back</button>
              <button class="btn-primary focus-ring" onClick={handleImport} disabled={preview()!.willImport === 0}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">play_arrow</span>
                Import {preview()!.willImport} Titles
              </button>
            </div>
          </div>
        </Show>

        {/* IMPORTING (progress bar) */}
        <Show when={step() === "importing"}>
          <div class="v1-wizard-panel">
            <h2 class="v1-wizard-title">Importing your library…</h2>
            <p class="v1-wizard-body">
              {cancelRequested()
                ? "Cancelling — finishing current item…"
                : "Do not close this window. You can cancel anytime."}
            </p>
            <div class="v1-wizard-progress">
              <div class="v1-wizard-progress-bar">
                <div
                  class="v1-wizard-progress-fill"
                  style={{ width: `${progress().total > 0 ? (progress().processed / progress().total) * 100 : 0}%` }}
                />
              </div>
              <div class="v1-wizard-progress-stats">
                <span>{progress().processed} / {progress().total}</span>
                <span>{progress().imported} imported · {progress().skipped} skipped · {progress().failed} failed</span>
              </div>
            </div>
            <div class="v1-wizard-actions">
              <button
                class="btn-ghost focus-ring"
                onClick={handleCancelImport}
                disabled={cancelRequested()}
              >
                <Show when={!cancelRequested()} fallback="Cancelling…">
                  Cancel Import
                </Show>
              </button>
            </div>
          </div>
        </Show>

        {/* COMPLETE */}
        <Show when={step() === "complete" && result()}>
          <div class="v1-wizard-panel">
            <div class="v1-wizard-hero-icon v1-wizard-hero-icon-success" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">check_circle</span>
            </div>
            <h2 class="v1-wizard-title">Import Complete</h2>
            <p class="v1-wizard-body">{result()!.summary}</p>
            <div class="v1-wizard-result-grid">
              <PreviewStat icon="check" label="Imported" value={result()!.imported} accent="primary" />
              <PreviewStat icon="content_copy" label="Duplicates" value={result()!.duplicates} accent={result()!.duplicates > 0 ? "warning" : undefined} />
              <PreviewStat icon="auto_fix_high" label="Repaired" value={result()!.repaired} />
              <PreviewStat icon="skip_next" label="Skipped" value={result()!.skipped} />
              <PreviewStat icon="error" label="Failed" value={result()!.failed} accent={result()!.failed > 0 ? "warning" : undefined} />
            </div>
            {/* Failure log — shown only when there are failures, so the user can see WHY items failed */}
            <Show when={result()!.failed > 0 && result()!.failureLog && result()!.failureLog.length > 0}>
              <div class="v1-wizard-failure-log">
                <div class="v1-wizard-failure-log-header">
                  <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--text-muted)" }} aria-hidden="true">bug_report</span>
                  <span class="v1-wizard-failure-log-title">Why {result()!.failed} items failed</span>
                  <button
                    type="button"
                    class="v1-wizard-copy-btn focus-ring"
                    onClick={() => {
                      const text = result()!.failureLog
                        .map((f) => `- ${f.title ?? "(no title)"}: ${f.reason}`)
                        .join("\n");
                      navigator.clipboard?.writeText(text).then(
                        () => showToast("Error details copied to clipboard", "success", 2000),
                        () => showToast("Could not copy — your browser blocked clipboard access", "error", 3000),
                      );
                    }}
                    aria-label="Copy error details"
                  >
                    <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">content_copy</span>
                    Copy
                  </button>
                </div>
                <div class="v1-wizard-failure-log-list">
                  <For each={result()!.failureLog.slice(0, 8)}>
                    {(f) => (
                      <div class="v1-wizard-failure-log-item">
                        <span class="v1-wizard-failure-log-item-title">{f.title ?? "(no title)"}</span>
                        <span class="v1-wizard-failure-log-item-reason">{f.reason}</span>
                      </div>
                    )}
                  </For>
                  <Show when={result()!.failureLog.length > 8}>
                    <p class="v1-wizard-failure-log-more">
                      + {result()!.failureLog.length - 8} more — tap “Copy” to see all.
                    </p>
                  </Show>
                </div>
              </div>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-primary focus-ring" onClick={handleFinish}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">check</span>
                Done
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper component — reused from V1MigrationWizard's PreviewStat pattern
// ---------------------------------------------------------------------------

const PreviewStat: Component<{ icon: string; label: string; value: number; accent?: "primary" | "warning" }> = (props) => (
  <div class="v1-wizard-stat" data-accent={props.accent}>
    <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">{props.icon}</span>
    <div class="v1-wizard-stat-text">
      <span class="v1-wizard-stat-value">{props.value}</span>
      <span class="v1-wizard-stat-label">{props.label}</span>
    </div>
  </div>
);

export default JsonImportWizard;
