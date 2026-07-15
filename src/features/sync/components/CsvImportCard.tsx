// src/features/sync/components/CsvImportCard.tsx
//
// CsvImportCard — CSV import for the Sync page.
//
// Lets the user import a CSV file exported from:
//   - CineLog V1 (generic format: id,title,media_type,status,rating,watch_date,added_at,notes)
//   - CineLog V2 (same generic format)
//   - Letterboxd / Trakt / IMDb (auto-detected from header row)
//
// FLOW:
//   1. User selects a .csv file
//   2. parseWatchlistCsv() → list of ImportCandidate
//   3. Show preview (count + sample titles)
//   4. On confirm, batch-upsert to vault via restoreBackup() pipeline
//      (same robust batch + retry logic as JSON import)
//   5. Cancel button WORKS — sets a flag that the import loop checks
//
// ARCHITECTURE:
//   Reuses BackupService.restoreBackup() for the actual write so CSV
//   import gets the SAME batch-upsert + retry + rate-limit-handling
//   as JSON import. No duplicated write logic.

import { Show, createSignal, type Component } from "solid-js";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { WatchlistItem } from "~/shared/types";
import {
  parseWatchlistCsv,
  readFileAsText,
  type ImportCandidate,
} from "../import/csvImport";
import { restoreBackup, type ParsedBackup } from "../backup/BackupService";

const CsvImportCard: Component = () => {
  const { showToast } = useToast();
  const library = useUserLibrary();
  const [candidates, setCandidates] = createSignal<ImportCandidate[]>([]);
  const [source, setSource] = createSignal<string>("unknown");
  const [parsing, setParsing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [cancelRequested, setCancelRequested] = createSignal(false);
  const [progress, setProgress] = createSignal({ done: 0, total: 0, imported: 0, failed: 0 });

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const text = await readFileAsText(file);
      const result = parseWatchlistCsv(text);
      setSource(result.source);
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        showToast(`No titles found in CSV (skipped ${result.skipped} malformed rows)`, "info", 2500);
      } else {
        showToast(`Parsed ${result.candidates.length} titles from ${result.source} CSV`, "success", 2000);
      }
    } catch (e) {
      console.error("[csv-import] parse failed:", e);
      showToast("Could not parse CSV file. Make sure it's a valid CSV.", "error");
      setCandidates([]);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    const items = candidates();
    if (items.length === 0) return;
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to import titles.", "error");
      return;
    }
    setImporting(true);
    setCancelRequested(false);
    setProgress({ done: 0, total: items.length, imported: 0, failed: 0 });

    // Convert CSV candidates to WatchlistItem objects that the
    // BackupService.restoreBackup pipeline can consume.
    const watchlistItems: WatchlistItem[] = [];
    let skippedNoId = 0;
    for (const c of items) {
      if (!c.id) {
        skippedNoId++;
        continue;
      }
      watchlistItems.push({
        id: c.id,
        title: c.title,
        media_type: c.media_type,
        status: c.status,
        rating: c.rating,
        watchDate: c.watchDate,
        notes: c.notes ?? "",
        addedAt: c.watchDate ?? new Date().toISOString(),
        updatedAt: c.watchDate ?? new Date().toISOString(),
        genresList: [],
        platformsList: [],
      } as WatchlistItem);
    }

    if (skippedNoId > 0) {
      console.warn(`[csv-import] ${skippedNoId} items skipped (no TMDB id)`);
    }

    // Use the same restoreBackup pipeline as JSON import — gets batch
    // upsert, retry logic, rate-limit handling, and cancellation for free.
    const parsed: ParsedBackup = {
      items: watchlistItems,
      format: "flat-array",
      failures: [],
      repairedCount: 0,
    };

    try {
      const result = await restoreBackup(parsed, library.watchlist(), {
        onProgress: (processed, total, imported, _skipped, failed) => {
          setProgress({ done: processed, total, imported, failed });
        },
        shouldCancel: () => cancelRequested(),
      });

      const wasCancelled = cancelRequested();
      setImporting(false);
      setCandidates([]);
      setCancelRequested(false);

      if (wasCancelled) {
        showToast(`Import cancelled — ${result.imported} of ${items.length} titles imported`, "info", 4000);
      } else {
        const msg = `Imported ${result.imported} of ${items.length} titles${result.failed > 0 ? ` (${result.failed} failed)` : ""}`;
        showToast(msg, result.imported > 0 ? "success" : "error", 4000);
      }
      void library.refresh();
    } catch (e) {
      console.error("[csv-import] import failed:", e);
      setImporting(false);
      showToast("Import failed. Please try again.", "error");
    }
  };

  const handleCancel = () => {
    if (importing()) {
      // Signal the import loop to stop after the current batch
      setCancelRequested(true);
      showToast("Cancelling import…", "info", 2000);
    } else {
      // Not importing — just clear the preview
      setCandidates([]);
      setSource("unknown");
    }
  };

  return (
    <div class="setting-group">
      <Show
        when={candidates().length === 0}
        fallback={
          <div style={{ padding: "var(--sp-4) var(--sp-5)" }}>
            <p style={{ "font-family": "'Outfit', sans-serif", "font-weight": 700, "font-size": "0.9375rem", color: "var(--text-strong)", margin: "0 0 var(--sp-2) 0" }}>
              {candidates().length} titles ready to import ({source()})
            </p>
            <p style={{ "font-size": "0.8125rem", color: "var(--text-muted)", margin: "0 0 var(--sp-3) 0" }}>
              First few: {candidates().slice(0, 3).map((c) => c.title).join(", ")}
              {candidates().length > 3 ? ` … +${candidates().length - 3} more` : ""}
            </p>
            <Show when={candidates().some((c) => !c.id)}>
              <p style={{ "font-size": "0.75rem", color: "var(--text-muted)", margin: "0 0 var(--sp-3) 0" }}>
                Note: titles without a TMDB id will be skipped during import.
              </p>
            </Show>
            <Show when={importing()}>
              <div style={{ "margin-bottom": "var(--sp-3)" }}>
                <div style={{ "font-size": "0.8125rem", color: "var(--p)", "margin-bottom": "var(--sp-1)" }}>
                  Importing… {progress().done}/{progress().total} ({progress().imported} ok, {progress().failed} failed)
                  <Show when={cancelRequested()}>
                    <span style={{ color: "var(--text-muted)", "margin-left": "var(--sp-2)" }}>— cancelling…</span>
                  </Show>
                </div>
                <div style={{ width: "100%", height: "4px", background: "var(--surface)", "border-radius": "2px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${progress().total > 0 ? (progress().done / progress().total) * 100 : 0}%`,
                      height: "100%",
                      background: "var(--p)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            </Show>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button
                type="button"
                class="settings-link-btn focus-ring"
                onClick={handleConfirmImport}
                disabled={importing() && !cancelRequested()}
                style={{ background: "var(--p-dim)", "border-color": "var(--p)", color: "var(--p)" }}
              >
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">download_for_offline</span>
                <Show when={!importing()} fallback={
                  <Show when={!cancelRequested()} fallback="Cancelling…">Importing…</Show>
                }>
                  Import {candidates().length} titles
                </Show>
              </button>
              <button
                type="button"
                class="settings-link-btn focus-ring"
                onClick={handleCancel}
                disabled={cancelRequested()}
              >
                <Show when={importing()} fallback="Cancel">Cancel Import</Show>
              </button>
            </div>
          </div>
        }
      >
        <label class="setting-row focus-ring" style={{ cursor: "pointer" }}>
          <div class="setting-row-icon" aria-hidden="true">
            <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">upload_file</span>
          </div>
          <div class="setting-row-text">
            <span class="setting-row-label">Import from CSV</span>
            <span class="setting-row-desc">
              {parsing() ? "Parsing…" : "CineLog / Letterboxd / Trakt / IMDb — auto-detected"}
            </span>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handleFile(file);
              e.currentTarget.value = ""; // allow re-selecting same file
            }}
            aria-label="Choose CSV file"
          />
          <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">upload</span>
        </label>
      </Show>
    </div>
  );
};

export default CsvImportCard;
