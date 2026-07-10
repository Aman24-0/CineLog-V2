// src/features/profile/components/WatchlistSummary.tsx
import { Show, createMemo, type Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface WatchlistSummaryProps {
  watchlist: () => WatchlistItem[];
}

/**
 * WatchlistSummary — a story-driven sentence, not a boring stat.
 *
 * Instead of "1 Title — 1 Planned", it generates contextual text:
 *   • Empty: "Your cinematic journey starts here."
 *   • 1-5: "Your collection has begun."
 *   • 6-20: "You're building something special."
 *   • 21-50: "You're a dedicated cinephile."
 *   • 51-100: "Cinema is clearly your passion."
 *   • 100+: "You're a true cinema explorer."
 *
 * Followed by the breakdown sentence.
 * Tappable → /watchlist.
 */
const WatchlistSummary: Component<WatchlistSummaryProps> = (props) => {
  const stats = createMemo(() => {
    const list = props.watchlist();
    const watching = list.filter((m) => m.status === "Watching").length;
    const completed = list.filter((m) => m.status === "Completed").length;
    const planned = list.filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    ).length;
    return { total: list.length, watching, completed, planned };
  });

  // Story-driven headline based on collection size.
  const headline = createMemo((): string => {
    const total = stats().total;
    if (total === 0) return "Your cinematic journey starts here.";
    if (total <= 5) return "Your collection has begun.";
    if (total <= 20) return "You're building something special.";
    if (total <= 50) return "You're a dedicated cinephile.";
    if (total <= 100) return "Cinema is clearly your passion.";
    return "You're a true cinema explorer.";
  });

  // Breakdown sentence — only shows non-zero categories.
  const breakdown = createMemo((): string => {
    const s = stats();
    const parts: string[] = [];
    if (s.watching > 0) parts.push(`${s.watching} watching`);
    if (s.completed > 0) parts.push(`${s.completed} completed`);
    if (s.planned > 0) parts.push(`${s.planned} planned`);
    return parts.join(", ");
  });

  return (
    <a
      href="/watchlist"
      class="watchlist-summary focus-ring"
      aria-label={`Open your watchlist — ${stats().total} titles total${breakdown() ? `, ${breakdown()}` : ""}`}
    >
      <div class="watchlist-summary-content">
        <p class="watchlist-summary-headline">{headline()}</p>
        <Show when={stats().total > 0}>
          <p class="watchlist-summary-text">
            <strong>{stats().total}</strong> {stats().total !== 1 ? "titles" : "title"}
            <Show when={breakdown()}>
              {" — "}{breakdown()}
            </Show>
          </p>
        </Show>
      </div>
      <span class="material-symbols-outlined watchlist-summary-icon" aria-hidden="true">
        chevron_right
      </span>
    </a>
  );
};

export default WatchlistSummary;
