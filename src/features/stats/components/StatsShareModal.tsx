// src/features/stats/components/StatsShareModal.tsx
//
// StatsShareModal — a GlassModal that shows a shareable summary card
// with the user's key stats (total titles, hours watched, avg rating,
// completion %, top genre) and two actions:
//
//   1. Share — uses the Web Share API when available (mobile native
//      sheet), otherwise copies a text summary to the clipboard.
//   2. Export CSV — generates a CSV of the user's ratings and
//      triggers a browser download.
//
// The modal is presentational — it receives the stats via props and
// calls back to the parent for sharing/exporting so the parent owns
// the user's library data.

import { Show, For, type Component } from "solid-js";
import { GlassModal, GlassButton } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import type { AllStats } from "~/lib/supabase/repositories/stats";
import type { WatchlistItem } from "~/shared/types";

interface StatsShareModalProps {
  open: boolean;
  onClose: () => void;
  stats: AllStats;
  /** The user's watchlist — used for CSV export. */
  watchlist: WatchlistItem[];
  /** Optional profile username for the public stats link. */
  username?: string;
}

interface SummaryRow {
  label: string;
  value: string;
}

const StatsShareModal: Component<StatsShareModalProps> = (props) => {
  const { showToast } = useToast();
  const notify = (msg: string, type: "success" | "error" | "info", duration?: number) =>
    showToast(msg, type, duration ?? (type === "error" ? 4000 : 2500));

  const summaryRows = (): SummaryRow[] => {
    const s = props.stats;
    return [
      { label: "Total Titles", value: String(s.overview.totalTitles) },
      { label: "Hours Watched", value: String(s.overview.totalHoursWatched) },
      { label: "Average Rating", value: s.overview.averageRating > 0 ? `${s.overview.averageRating} / 10` : "—" },
      { label: "Completed", value: `${s.overview.completedCount} (${s.overview.completedPercentage}%)` },
      { label: "Top Genre", value: s.genres[0]?.genre ?? "—" },
      { label: "Favourite Decade", value: s.decades.length > 0 ? s.decades.reduce((max, d) => (d.count > max.count ? d : max)).decade : "—" },
    ];
  };

  const shareText = (): string => {
    const s = props.stats;
    const rows = summaryRows();
    const lines = rows.map((r) => `• ${r.label}: ${r.value}`).join("\n");
    return `My CineLog stats:\n${lines}\n\nTotal runtime: ${s.overview.totalHoursWatched}h across ${s.overview.totalTitles} titles.`;
  };

  const handleShare = async () => {
    const text = shareText();
    const url =
      props.username && props.username.length > 0
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/u/${props.username}`
        : typeof window !== "undefined"
          ? window.location.href
          : "";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "My CineLog Stats",
          text,
          url: url || undefined,
        });
        notify("Shared!", "success");
      } catch (err) {
        // user cancelled or share failed — fall back to clipboard
        if (err instanceof DOMException && err.name === "AbortError") return;
        await copyToClipboard(`${text}\n${url}`.trim());
      }
    } else {
      await copyToClipboard(`${text}\n${url}`.trim());
    }
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      notify("Stats copied to clipboard", "success");
    } catch {
      notify("Couldn't copy. Long-press to copy manually.", "error", 4000);
    }
  };

  const handleExportCsv = () => {
    const list = props.watchlist;
    if (list.length === 0) {
      notify("No titles to export yet.", "error");
      return;
    }
    const header = ["Title", "Type", "Status", "Rating", "Runtime (min)", "Genres", "Released", "Added"];
    const rows = list.map((m) => {
      const title = (m.title ?? m.name ?? "").replace(/"/g, '""');
      const genres = (m.genresList ?? []).join("; ").replace(/"/g, '""');
      const year = (m.release_date ?? m.first_air_date ?? "").slice(0, 4);
      const added = typeof m.addedAt === "string" ? m.addedAt : "";
      return [title, m.media_type, m.status, String(m.rating ?? ""), String(m.runtime ?? ""), genres, year, added];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");

    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cinelog-stats-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(`Exported ${list.length} titles to CSV`, "success");
    } catch {
      notify("Couldn't generate the CSV file.", "error");
    }
  };

  return (
    <GlassModal
      open={props.open}
      onClose={props.onClose}
      title="Share Your Stats"
      icon="share"
      size="md"
    >
      <div class="stats-share-modal-body">
        <div class="stats-share-card">
          <div class="stats-share-card-header">
            <span class="material-symbols-outlined" aria-hidden="true">insights</span>
            <div>
              <p class="stats-share-card-eyebrow">CineLog</p>
              <p class="stats-share-card-title">My Cinematic Stats</p>
            </div>
          </div>
          <div class="stats-share-card-grid">
            <For each={summaryRows()}>
              {(row) => (
                <div class="stats-share-card-row">
                  <span class="stats-share-card-label">{row.label}</span>
                  <span class="stats-share-card-value">{row.value}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="stats-share-actions">
          <GlassButton
            variant="primary"
            size="default"
            icon="share"
            fullWidth
            onClick={handleShare}
          >
            Share
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="default"
            icon="download"
            fullWidth
            onClick={handleExportCsv}
          >
            Export CSV
          </GlassButton>
        </div>
        <Show when={props.username}>
          <p class="stats-share-footnote">
            Public profile: <span>{typeof window !== "undefined" ? window.location.origin : ""}/u/{props.username}</span>
          </p>
        </Show>
      </div>
    </GlassModal>
  );
};

export default StatsShareModal;
