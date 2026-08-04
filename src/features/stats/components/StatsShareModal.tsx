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
//   3. Download as Image — POSTs the card payload to the server-side
//      `/api/share-card` route, which renders a PNG via headless
//      Chromium. (Phase 7 Task 6 — replaces the previous client-side
//      `html2canvas` approach that added ~300KB to the bundle.)
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
import type { ShareCardPayload } from "~/lib/shareCard/templates";

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

  // Phase 7 Task 6: capturing state is still used for the button label,
  // but the capture itself now happens server-side via /api/share-card.
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
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/profile`
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
   * handleDownloadImage — POST the card payload to the server-side
   * `/api/share-card` route, which renders a PNG via headless
   * Chromium and returns the image bytes. The downloaded file is
   * a self-contained branded shareable.
   *
   * Phase 7 Task 6: this replaces the previous client-side
   * `html2canvas` approach. The card payload is built from the same
   * `summaryRows()` accessor the in-modal card renders, so the
   * server-rendered PNG matches what the user sees.
   *
   * On error (network failure, 401, 5xx, 503 when Chromium isn't
   * available), we show a toast and fall back to the Web Share API
   * with just the text summary (so the user still gets SOMETHING).
   */
  const handleDownloadImage = async () => {
    if (capturing()) return;
    setCapturing(true);
    try {
      const payload: ShareCardPayload = {
        template: "stats",
        displayName: displayName(),
        avatarUrl: avatarUrl() ?? null,
        title: "My Cinematic Stats",
        eyebrow: "My Cinematic Stats",
        rows: summaryRows(),
        footer: "cinelog.app"
      };

      const resp = await fetch("/api/share-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      if (!resp.ok) {
        // 401 / 5xx / 503 → fall back to text share.
        const errBody = await resp.json().catch(() => ({} as { error?: string }));
        console.warn(
          "[StatsShareModal] /api/share-card failed:",
          resp.status,
          errBody?.error
        );
        notify(
          resp.status === 503
            ? "Image rendering isn't available right now. Try the text Share instead."
            : "Couldn't generate the image. Try the text Share instead.",
          "error",
          4000
        );
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cinelog-stats-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify("Image downloaded", "success");
    } catch (err) {
      console.error("[StatsShareModal] share-card fetch failed:", err);
      notify("Couldn't generate the image. Try the text Share instead.", "error", 4000);
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
        {/* Branded share card — shown in-modal for preview.
            The PNG download is rendered server-side by /api/share-card
            (Phase 7 Task 6) using the same payload this card shows. */}
        <div class="stats-share-card stats-share-card-branded">
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
            Profile:{" "}
            <span>
              {typeof window !== "undefined" ? window.location.origin : ""}/profile
            </span>
          </p>
        </Show>
      </div>
    </GlassModal>
  );
};

export default StatsShareModal;
