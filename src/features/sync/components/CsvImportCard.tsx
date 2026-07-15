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
//   3. Convert candidates to raw item shape → run through normalizeBatch()
//      (same normalization pipeline as JSON import — proper rating scaling,
//      status mapping, date normalization, field validation)
//   4. Show preview (count + sample titles)
//   5. On confirm, batch-upsert to vault via restoreBackup() pipeline
//      (same robust batch + retry logic as JSON import, including the
//      missing-column-aware retry that handles DBs without v2.2/v2.3
//      migration columns)
//   6. Cancel button WORKS — sets a flag that the import loop checks
//   7. Failure log is displayed inline so the user can see WHY items
//      failed (with a Copy button to copy all error details)
//
// ARCHITECTURE:
//   Reuses BackupService.restoreBackup() for the actual write so CSV
//   import gets the SAME batch-upsert + retry + rate-limit-handling
//   + missing-column-aware retry as JSON import. No duplicated write logic.

import { Show, For, createSignal, type Component } from "solid-js";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import {
  parseWatchlistCsv,
  readFileAsText,
  type ImportCandidate,
} from "../import/csvImport";
import { normalizeBatch } from "../backup/normalizeBackup";
import {
  restoreBackup,
  type ParsedBackup,
  type RestoreResult,
} from "../backup/BackupService";

const CsvImportCard: Component = () => {
  const { showToast } = useToast();
  const library = useUserLibrary();
  const [candidates, setCandidates] = createSignal<ImportCandidate[]>([]);
  const [source, setSource] = createSignal<string>("unknown");
  const [parsing, setParsing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [cancelRequested, setCancelRequested] = createSignal(false);
  const [progress, setProgress] = createSignal({ done: 0, total: 0, imported: 0, failed: 0 });
  const [result, setResult] = createSignal<RestoreResult | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setResult(null);
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
    setResult(null);
    setProgress({ done: 0, total: items.length, imported: 0, failed: 0 });

    // ── Convert CSV candidates to raw item shape ──────────────────────
    // Build raw objects that normalizeBatch() can consume. This gives CSV
    // import the SAME normalization pipeline as JSON import:
    //   - Ratings get scaled (integer 1-5 → 2-10, percentages → 0-10, etc.)
    //   - Status values get mapped (lowercase → Title Case, etc.)
    //   - Dates get normalized (Firestore timestamps → ISO, etc.)
    //   - Fields get validated (id, media_type, status)
    //   - Missing fields get repaired (notes, genresList, platformsList)
    //
    // Previously CSV import bypassed normalizeBatch, which meant ratings
    // like "5" stayed as 5 (instead of becoming 10) and status values
    // weren't validated. Running through normalizeBatch fixes this.
    //
    // We also forward ALL extended fields from the candidate (runtime,
    // genresList, castList, poster_path, etc.) so they survive into the
    // in-memory WatchlistItem — they're not persisted to the vault table
    // (which only stores user-owned state), but they ARE used for the
    // import preview and as a fallback when TMDB enrichment is slow or
    // the tmdb_id doesn't resolve.
    const rawItems: Record<string, unknown>[] = [];
    let skippedNoId = 0;
    for (const c of items) {
      if (!c.id) {
        skippedNoId++;
        continue;
      }
      // Use added_at from the CSV if present (preserves the original add
      // timestamp). Fall back to watch_date, then to now() — in that order.
      // This ensures the timeline shows items on the date they were
      // actually added, not "today" for every Planned item.
      const addedAt = c.addedAt ?? c.watchDate ?? new Date().toISOString();
      const raw: Record<string, unknown> = {
        id: c.id,
        title: c.title,
        media_type: c.media_type,
        status: c.status,
        rating: c.rating,
        watchDate: c.watchDate,
        notes: c.notes ?? "",
        addedAt,
        updatedAt: c.updatedAt ?? addedAt,
        // Forward extended fields if present. normalizeBatch will repair
        // missing arrays to [] and pass strings through unchanged.
        ...(c.runtime != null && { runtime: c.runtime }),
        ...(c.totalEps != null && { totalEps: c.totalEps }),
        ...(c.season != null && { season: c.season }),
        ...(c.episode != null && { episode: c.episode }),
        ...(c.genresList != null && { genresList: c.genresList }),
        ...(c.platformsList != null && { platformsList: c.platformsList }),
        ...(c.castList != null && { castList: c.castList }),
        ...(c.director && { director: c.director }),
        ...(c.imdbId && { imdbId: c.imdbId }),
        ...(c.imdbRating && { imdbRating: c.imdbRating }),
        ...(c.rtRating && { rtRating: c.rtRating }),
        ...(c.region && { region: c.region }),
        ...(c.tag && { tag: c.tag }),
        ...(c.poster_path && { poster_path: c.poster_path }),
        ...(c.backdrop_path && { backdrop_path: c.backdrop_path }),
        ...(c.release_date && { release_date: c.release_date }),
      };
      // Preserve year for Letterboxd/Trakt/IMDb candidates (used for
      // TMDB search disambiguation if we ever add that feature).
      if (c.year) raw.year = c.year;
      rawItems.push(raw);
    }

    if (skippedNoId > 0) {
      console.warn(`[csv-import] ${skippedNoId} items skipped (no TMDB id)`);
    }

    // Run through the SAME normalization pipeline as JSON import.
    const batch = normalizeBatch(rawItems);

    if (batch.items.length === 0) {
      setImporting(false);
      const reasons = batch.failures.slice(0, 3).map((f) => f.reason).join("; ");
      showToast(`No valid titles to import. ${reasons}`, "error", 5000);
      return;
    }

    // Use the same restoreBackup pipeline as JSON import — gets batch
    // upsert, retry logic, rate-limit handling, missing-column-aware
    // retry, and cancellation for free.
    const parsed: ParsedBackup = {
      items: batch.items,
      format: "flat-array",
      failures: batch.failures,
      repairedCount: batch.repairedCount,
    };

    try {
      const res = await restoreBackup(parsed, library.watchlist(), {
        onProgress: (processed, total, imported, _skipped, failed) => {
          setProgress({ done: processed, total, imported, failed });
        },
        shouldCancel: () => cancelRequested(),
      });

      const wasCancelled = cancelRequested();
      setImporting(false);
      setCancelRequested(false);
      setResult(res);
      // Keep candidates so the failure log + result panel can render.
      // setCandidates([]) happens when user dismisses the result.

      if (wasCancelled) {
        showToast(`Import cancelled — ${res.imported} of ${items.length} titles imported`, "info", 4000);
      } else if (res.failed > 0 && res.imported === 0) {
        showToast(`Import failed — ${res.failed} of ${items.length} titles could not be imported. See details below.`, "error", 5000);
      } else if (res.failed > 0) {
        showToast(`Imported ${res.imported} of ${items.length} titles (${res.failed} failed — see details)`, "info", 4000);
      } else {
        showToast(`Imported ${res.imported} of ${items.length} titles`, "success", 3000);
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
    } else if (result()) {
      // Import complete — dismiss the result panel
      setResult(null);
      setCandidates([]);
      setSource("unknown");
    } else {
      // Not importing — just clear the preview
      setCandidates([]);
      setSource("unknown");
    }
  };

  const handleCopyErrors = () => {
    const r = result();
    if (!r || !r.failureLog || r.failureLog.length === 0) return;
    const text = r.failureLog
      .map((f) => `- ${f.title ?? "(no title)"}: ${f.reason}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(
      () => showToast("Error details copied to clipboard", "success", 2000),
      () => showToast("Could not copy — your browser blocked clipboard access", "error", 3000),
    );
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

            {/* ── Result + Failure log ─────────────────────────────── */}
            <Show when={result() && !importing()}>
              <div class="csv-import-result">
                <p style={{
                  "font-size": "0.875rem",
                  "font-weight": 600,
                  color: result()!.failed > 0 ? "var(--text-strong)" : "var(--p)",
                  margin: "0 0 var(--sp-2) 0",
                }}>
                  {result()!.imported} imported
                  {result()!.failed > 0 ? ` · ${result()!.failed} failed` : ""}
                  {" · "}{result()!.duplicates > 0 ? `${result()!.duplicates} updated ` : "of "}{candidates().length} titles
                </p>

                {/* Failure log — visible only when there are failures */}
                <Show when={result()!.failed > 0 && result()!.failureLog && result()!.failureLog.length > 0}>
                  <div class="csv-import-failure-log">
                    <div class="csv-import-failure-log-header">
                      <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--text-muted)" }} aria-hidden="true">bug_report</span>
                      <span class="csv-import-failure-log-title">Why {result()!.failed} items failed</span>
                      <button
                        type="button"
                        class="csv-import-copy-btn focus-ring"
                        onClick={handleCopyErrors}
                        aria-label="Copy error details"
                      >
                        <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">content_copy</span>
                        Copy
                      </button>
                    </div>
                    <div class="csv-import-failure-log-list">
                      <For each={result()!.failureLog.slice(0, 10)}>
                        {(f) => (
                          <div class="csv-import-failure-log-item">
                            <span class="csv-import-failure-log-item-title">{f.title ?? "(no title)"}</span>
                            <span class="csv-import-failure-log-item-reason">{f.reason}</span>
                          </div>
                        )}
                      </For>
                      <Show when={result()!.failureLog.length > 10}>
                        <p class="csv-import-failure-log-more">
                          + {result()!.failureLog.length - 10} more — tap "Copy" to see all.
                        </p>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <div style={{ display: "flex", gap: "var(--sp-2)", "margin-top": "var(--sp-3)" }}>
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
                <Show when={importing()} fallback={result() ? "Dismiss" : "Cancel"}>Cancel Import</Show>
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
