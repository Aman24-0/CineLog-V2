// src/features/sync/components/CsvImportCard.tsx
//
// CsvImportCard — added to the Sync page in the v2 Settings redesign.
//
// Lets the user import a CSV file exported from Letterboxd / Trakt / IMDb /
// generic CineLog. Auto-detects format from the header row.
//
// On file select:
//   1. Read file as text
//   2. parseWatchlistCsv() → list of ImportCandidate
//   3. Show preview (count + sample of first 3 titles)
//   4. On confirm, bulk-add to vault via createVaultItemInSupabase

import { Show, For, createSignal, type Component } from "solid-js";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import type { WatchlistItem } from "~/shared/types";
import {
  parseWatchlistCsv,
  readFileAsText,
  type ImportCandidate,
} from "../import/csvImport";

const CsvImportCard: Component = () => {
  const { showToast } = useToast();
  const [candidates, setCandidates] = createSignal<ImportCandidate[]>([]);
  const [source, setSource] = createSignal<string>("unknown");
  const [parsing, setParsing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
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
    setProgress({ done: 0, total: items.length, imported: 0, failed: 0 });

    let imported = 0;
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      try {
        // Skip items that don't have a TMDB id — we can't safely add them
        // without risk of creating duplicates with wrong metadata.
        if (!c.id) {
          console.warn("[csv-import] skipping (no TMDB id):", c.title);
          failed++;
          setProgress({ done: i + 1, total: items.length, imported, failed });
          continue;
        }
        const item: WatchlistItem = {
          id: c.id,
          title: c.title,
          media_type: c.media_type,
          status: c.status,
          rating: c.rating,
          watchDate: c.watchDate,
          notes: c.notes,
        } as WatchlistItem;
        await createVaultItemInSupabase(uid, item);
        imported++;
      } catch (e) {
        console.error("[csv-import] failed to add:", c.title, e);
        failed++;
      }
      setProgress({ done: i + 1, total: items.length, imported, failed });
    }

    setImporting(false);
    setCandidates([]);
    showToast(`Imported ${imported} of ${items.length} titles${failed > 0 ? ` (${failed} failed — see console)` : ""}`, imported > 0 ? "success" : "error", 4000);
  };

  const handleCancel = () => {
    setCandidates([]);
    setSource("unknown");
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
                Note: titles without a TMDB id will be skipped during import (CSV exports from Letterboxd/Trakt may not include TMDB ids).
              </p>
            </Show>
            <Show when={importing()}>
              <p style={{ "font-size": "0.8125rem", color: "var(--p)", margin: "0 0 var(--sp-3) 0" }}>
                Importing… {progress().done}/{progress().total} ({progress().imported} ok, {progress().failed} failed)
              </p>
            </Show>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button
                type="button"
                class="settings-link-btn focus-ring"
                onClick={handleConfirmImport}
                disabled={importing()}
                style={{ background: "var(--p-dim)", "border-color": "var(--p)", color: "var(--p)" }}
              >
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">download_for_offline</span>
                Import {candidates().length} titles
              </button>
              <button
                type="button"
                class="settings-link-btn focus-ring"
                onClick={handleCancel}
                disabled={importing()}
              >
                Cancel
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
              {parsing() ? "Parsing…" : "Letterboxd / Trakt / IMDb / CineLog CSV — auto-detected"}
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
