// src/features/sync/components/CsvExportCard.tsx
//
// CsvExportCard — added to the Sync page in the v2 Settings redesign.
//
// Renders 4 buttons: Export CSV in Letterboxd / Trakt / IMDb / Generic formats.
// Each calls exportWatchlistCsv with the appropriate format.

import { For, Show, createSignal, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useToast } from "~/shared/hooks/useToast";
import { exportWatchlistCsv } from "../export/csvExport";

interface CsvFormat {
  id: "letterboxd" | "trakt" | "imdb" | "generic";
  label: string;
  desc: string;
  icon: string;
}

const FORMATS: CsvFormat[] = [
  {
    id: "generic",
    label: "CineLog (full)",
    desc: "All fields, .csv — best for re-import or Excel",
    icon: "data_object"
  },
  {
    id: "letterboxd",
    label: "Letterboxd",
    desc: "Movies only — imports into Letterboxd",
    icon: "movie"
  },
  {
    id: "trakt",
    label: "Trakt",
    desc: "Movies + shows — imports into Trakt",
    icon: "tv"
  },
  {
    id: "imdb",
    label: "IMDb",
    desc: "IMDb watchlist format",
    icon: "rate_review"
  }
];

const CsvExportCard: Component = () => {
  const library = useUserLibrary();
  const { showToast } = useToast();
  const [exporting, setExporting] = createSignal<string | null>(null);

  const handleExport = (format: CsvFormat["id"]) => {
    const items = library.watchlist();
    if (items.length === 0) {
      showToast("Your vault is empty — nothing to export.", "info");
      return;
    }
    setExporting(format);
    try {
      exportWatchlistCsv(items, format);
      showToast(
        `Exported ${items.length} titles as ${format} CSV`,
        "success",
        2000
      );
    } catch (e) {
      console.error("[csv-export] failed:", e);
      showToast("Export failed. Try again.", "error");
    } finally {
      // Small delay so the spinner is visible even on instant exports
      setTimeout(() => setExporting(null), 500);
    }
  };

  return (
    <div class="setting-group">
      <For each={FORMATS}>
        {(fmt) => (
          <button
            type="button"
            class="setting-row focus-ring"
            onClick={() => handleExport(fmt.id)}
            disabled={exporting() !== null}
            aria-label={`Export as ${fmt.label} CSV`}
          >
            <div class="setting-row-icon" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              >
                {fmt.icon}
              </span>
            </div>
            <div class="setting-row-text">
              <span class="setting-row-label">{fmt.label} CSV</span>
              <span class="setting-row-desc">{fmt.desc}</span>
            </div>
            <Show
              when={exporting() === fmt.id}
              fallback={
                <span
                  class="material-symbols-outlined setting-row-chevron"
                  aria-hidden="true"
                >
                  download
                </span>
              }
            >
              <span
                class="material-symbols-outlined setting-row-chevron"
                aria-hidden="true"
                style={{ animation: "spin 1s linear infinite" }}
              >
                progress_activity
              </span>
            </Show>
          </button>
        )}
      </For>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CsvExportCard;
