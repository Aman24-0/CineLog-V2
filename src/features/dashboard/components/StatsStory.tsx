// src/features/dashboard/components/StatsStory.tsx
import { createMemo, Show, Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface StatsStoryProps {
  watchlist: WatchlistItem[];
  onNavigate: (status: string) => void;
}

const mode = (arr: string[]): string => {
  if (arr.length === 0) return "—";
  const counts: Record<string, number> = {};
  let max = 0;
  let modeVal = "—";
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > max) {
      max = counts[v];
      modeVal = v;
    }
  }
  return modeVal;
};

interface StoryCell {
  value: string;
  label: string;
  sub?: string;
  accent?: boolean;
  onClick?: () => void;
}

/**
 * StatsStory — storytelling stats panel.
 *
 * NOT four isolated cards. Instead, a single glass panel with 4 narrative
 * cells that tell the story of the user's watching habits:
 *
 *  1. THIS YEAR — completed titles this year (temporal context)
 *  2. IN PROGRESS — currently watching count (actionable)
 *  3. TOP GENRE — most-watched genre (personality)
 *  4. AVG RATING — average IMDb rating (quality signal)
 *
 * Each cell is clickable where it makes sense (This Year → vault filtered
 * to completed, In Progress → vault filtered to watching).
 *
 * The panel uses .stats-story CSS (glass surface, responsive 2x2 / 1x4 grid).
 */
const StatsStory: Component<StatsStoryProps> = (props) => {
  const cells = createMemo<StoryCell[]>(() => {
    const list = props.watchlist;
    const currentYear = new Date().getFullYear().toString();

    // 1. This Year — completed this year
    const completedThisYear = list.filter(
      (m) => m.status === "Completed" && m.watchDate?.startsWith(currentYear)
    ).length;

    // 2. In Progress — currently watching
    const inProgress = list.filter(
      (m) => m.watchProgress && m.watchProgress.currentTime > 0 && m.status !== "Completed"
    ).length;
    const watching = list.filter((m) => m.status === "Watching").length;

    // 3. Top Genre
    const genres = list.flatMap((m) => m.genresList || []);
    const topGenre = mode(genres);

    // 4. Average IMDb
    const imdbRatings = list
      .map((m) => parseFloat(m.imdbRating || "0"))
      .filter((r) => !isNaN(r) && r > 0);
    const avgImdb =
      imdbRatings.length > 0
        ? (imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length).toFixed(1)
        : "—";

    // 5. Total vault (used as sub for This Year)
    const total = list.length;

    return [
      {
        value: String(completedThisYear),
        label: "This Year",
        sub: `${total} total`,
        accent: completedThisYear > 0,
        onClick: () => props.onNavigate("Completed")
      },
      {
        value: String(inProgress + watching),
        label: "In Progress",
        sub: inProgress > 0 ? `${inProgress} resumable` : `${watching} watching`,
        accent: inProgress > 0,
        onClick: () => props.onNavigate("Watching")
      },
      {
        value: topGenre,
        label: "Top Genre",
        sub: list.length > 0 ? `${list.length} titles` : ""
      },
      {
        value: avgImdb,
        label: "Avg IMDb",
        sub: imdbRatings.length > 0 ? `${imdbRatings.length} rated` : "no ratings"
      }
    ];
  });

  return (
    <div class="stats-story animate-fade-up">
      <div class="stats-story-grid">
        {cells().map((cell) => (
          <div
            class="stats-story-cell"
            onClick={cell.onClick}
            onKeyDown={(e) => {
              if (cell.onClick && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                cell.onClick();
              }
            }}
            role={cell.onClick ? "button" : undefined}
            tabindex={cell.onClick ? 0 : undefined}
            aria-label={cell.onClick ? `${cell.value} ${cell.label} — click to view` : `${cell.value} ${cell.label}`}
            style={{
              cursor: cell.onClick ? "pointer" : "default",
              transition: "opacity var(--dur-fast) var(--ease-out)"
            }}
          >
            <span
              class={`stats-story-value${cell.accent ? " stats-story-value-accent" : ""}`}
              style={cell.value.length > 6 ? { "font-size": "1.25rem" } : {}}
            >
              {cell.value}
            </span>
            <span class="stats-story-label">{cell.label}</span>
            <Show when={cell.sub}>
              <span class="stats-story-sub">{cell.sub}</span>
            </Show>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsStory;
