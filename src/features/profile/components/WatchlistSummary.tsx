// src/features/profile/components/WatchlistSummary.tsx
import { createMemo, type Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface WatchlistSummaryProps {
  watchlist: () => WatchlistItem[];
}

/**
 * WatchlistSummary — one beautiful sentence.
 *
 * "247 Titles — 38 Watching, 192 Completed, 17 Planned."
 *
 * A grid of stat boxes is a dashboard. A sentence is a bio. It reads
 * as personality: "I'm someone with 247 titles, mostly completed."
 *
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

  const sentence = createMemo(() => {
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
      aria-label={`Open your watchlist — ${stats().total} titles total, ${sentence()}`}
    >
      <p class="watchlist-summary-text">
        <strong>{stats().total}</strong> Titles
        <Show when={sentence()}>
          {" — "}
          {sentence()}
        </Show>
      </p>
      <span class="material-symbols-outlined watchlist-summary-icon" aria-hidden="true">
        chevron_right
      </span>
    </a>
  );
};

import { Show } from "solid-js";
export default WatchlistSummary;
