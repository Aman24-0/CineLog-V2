// src/features/stats/components/StatsShareModal.tsx
//
// StatsShareModal — a GlassModal that shows a shareable summary card
// with the user's key stats (total titles, hours watched, avg rating,
// completion %, top genre) and three actions:
//
//   1. Share — uses the Web Share API when available (mobile native
//      sheet), otherwise copies a text summary to the clipboard.
//   2. Export CSV — generates a CSV of the user's ratings and
//      triggers a browser download.
//   3. Download as Image — uses html2canvas to rasterise the share
//      card to a PNG and download it. The card has its own ref so
//      we capture only the branded card, not the whole modal chrome.
//
// The modal is presentational — it receives the stats via props and
// calls back to the parent for sharing/exporting so the parent owns
// the user's library data.

import { Show, For, createSignal, type Component } from "solid-js";
import { GlassModal, GlassButton, GlassAvatar } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import { useAuth } from "~/shared/hooks/useAuth";
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
  /** Optional display name shown in the branded header. */
  displayName?: string;
  /** Optional avatar URL shown in the branded header. */
  avatarUrl?: string | null;
}

interface SummaryRow {
  label: string;
  value: string;
}

const StatsShareModal: Component<StatsShareModalProps> = (props) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const notify = (
    msg: string,
    type: "success" | "error" | "info",
    duration?: number
  ) => showToast(msg, type, duration ?? (type === "error" ? 4000 : 2500));

  // Ref to the shareable card so html2canvas can capture only that
  // element rather than the whole modal (which includes the action
  // buttons and footer that shouldn't be in the image).
  let cardRef: HTMLDivElement | undefined;

  const [capturing, setCapturing] = createSignal(false);

  // Resolve display name + avatar — props override auth user.
  const displayName = (): string =>
    props.displayName ?? user()?.displayName ?? "CineLog user";
  const avatarUrl = (): string | null | undefined =>
    props.avatarUrl !== undefined ? props.avatarUrl : user()?.photoURL;

  const summaryRows = (): SummaryRow[] => {
    const s = props.stats;
    return [
      { label: "Total Titles", value: String(s.overview.totalTitles) },
      { label: "Hours Watched", value: String(s.overview.totalHoursWatched) },
      {
        label: "Average Rating",
        value:
          s.overview.averageRating > 0
            ? `${s.overview.averageRating} / 10`
            : "—"
      },
      {
        label: "Completed",
        value: `${s.overview.completedCount} (${s.overview.completedPercentage}%)`
      },
      { label: "Top Genre", value: s.genres[0]?.genre ?? "—" },
      {
        label: "Favourite Decade",
        value:
          s.decades.length > 0
            ? s.decades.reduce((max, d) => (d.count > max.count ? d : max))
                .decade
            : "—"
      }
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

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: "My CineLog Stats",
          text,
          url: url || undefined
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
    const header = [
      "Title",
      "Type",
      "Status",
      "Rating",
      "Runtime (min)",
      "Genres",
      "Released",
      "Added"
    ];
    const rows = list.map((m) => {
      const title = (m.title ?? m.name ?? "").replace(/"/g, '""');
      const genres = (m.genresList ?? []).join("; ").replace(/"/g, '""');
      const year = (m.release_date ?? m.first_air_date ?? "").slice(0, 4);
      const added = typeof m.addedAt === "string" ? m.addedAt : "";
      return [
        title,
        m.media_type,
        m.status,
        String(m.rating ?? ""),
        String(m.runtime ?? ""),
        genres,
        year,
        added
      ];
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

  /**
   * handleDownloadImage — rasterise the share card to a PNG and
   * download it. Uses html2canvas (loaded dynamically so the rest
   * of the app doesn't pay the bundle cost unless the user clicks
   * the button).
   *
   * The cardRef captures only the branded share card — not the
   * modal header or action buttons — so the downloaded image looks
   * like a self-contained shareable.
   */
  const handleDownloadImage = async () => {
    if (!cardRef) {
      notify("Couldn't find the card to capture.", "error");
      return;
    }
    if (capturing()) return;
    setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef, {
        backgroundColor: "#0a0a0f",
        scale: 2, // 2x for retina quality
        useCORS: true,
        logging: false
      });
      canvas.toBlob((blob) => {
        if (!blob) {
          notify("Couldn't generate the image.", "error");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cinelog-stats-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify("Image downloaded", "success");
      }, "image/png");
    } catch (err) {
      console.error("[StatsShareModal] html2canvas failed:", err);
      notify("Couldn't capture the card as an image.", "error", 4000);
    } finally {
      setCapturing(false);
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
        {/* Branded share card — captured by html2canvas */}
        <div class="stats-share-card stats-share-card-branded" ref={cardRef}>
          <div class="stats-share-card-header stats-share-card-header-branded">
            <GlassAvatar
              src={avatarUrl() ?? null}
              name={displayName()}
              size="sm"
              class="stats-share-card-avatar"
            />
            <div class="stats-share-card-brand">
              <div class="stats-share-card-logo">
                <span class="stats-share-card-logo-text">
                  <span class="stats-share-card-logo-cine">CINE</span>
                  <span class="stats-share-card-logo-log">LOG</span>
                </span>
                <span
                  class="material-symbols-outlined stats-share-card-logo-icon"
                  aria-hidden="true"
                >
                  movie
                </span>
              </div>
              <p class="stats-share-card-eyebrow">My Cinematic Stats</p>
              <p class="stats-share-card-name">{displayName()}</p>
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
            icon="image"
            fullWidth
            disabled={capturing()}
            onClick={handleDownloadImage}
          >
            {capturing() ? "Capturing…" : "Download as Image"}
          </GlassButton>
          <GlassButton
            variant="ghost"
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
            Public profile:{" "}
            <span>
              {typeof window !== "undefined" ? window.location.origin : ""}/u/
              {props.username}
            </span>
          </p>
        </Show>
      </div>
    </GlassModal>
  );
};

export default StatsShareModal;
