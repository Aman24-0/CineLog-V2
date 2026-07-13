// src/features/profile/components/CinemaInsight.tsx
//
// Sprint 2C — Final Implementation.
// Cinema Insight — CineLog's signature section.
// Dynamic self-insight generated from watchlist data.
// Hides entirely when insufficient data (< 5 titles).
//
// Insight priority:
//   1. Dominant genre percentage (e.g., "Your vault is 74% Science Fiction")
//   2. Recurring director (e.g., "Christopher Nolan appears 8 times in your vault")
//   3. Decade affinity (e.g., "Your favorite decade is the 2010s")
//   4. Weekend watcher (e.g., "You watch 65% of titles on weekends")
//   5. Movie vs TV split (e.g., "You're 80% movies, 20% series")
//   6. Completion rate (e.g., "You finish 93% of series you start")
//   7. Rating tendency (e.g., "You rate higher than the average cinephile")
//   8. Genre diversity (e.g., "You explore more genres than 82% of users")
//
// Only one insight is shown — the most interesting one.
// Green accent on the key statistic (touchpoint #3).

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type { StatsData } from "../useStats";

interface CinemaInsightProps {
  stats: Accessor<StatsData | null>;
  watchlist: Accessor<WatchlistItem[]>;
}

interface InsightResult {
  stat: string;       // The highlighted number/word
  narrative: string;  // The full sentence (stat is embedded)
  icon: string;
}

const CinemaInsight: Component<CinemaInsightProps> = (props) => {
  const insight = createMemo<InsightResult | null>(() => {
    const s = props.stats();
    const list = props.watchlist();
    if (!s || list.length < 5) return null;

    // Priority 1: Dominant genre percentage (if > 50%)
    if (s.topGenres.length > 0) {
      const top = s.topGenres[0];
      if (top.pct >= 50) {
        return {
          stat: `${top.pct}%`,
          narrative: `Your vault is ${top.pct}% ${top.name}`,
          icon: "auto_awesome",
        };
      }
    }

    // Priority 2: Recurring director (if appears 3+ times)
    if (s.topDirectors.length > 0 && s.topDirectors[0].count >= 3) {
      const dir = s.topDirectors[0];
      return {
        stat: String(dir.count),
        narrative: `${dir.name} appears ${dir.count} times in your vault`,
        icon: "person",
      };
    }

    // Priority 3: Decade affinity
    if (s.favoriteDecade && s.total >= 10) {
      return {
        stat: s.favoriteDecade,
        narrative: `Your favorite decade is the ${s.favoriteDecade}`,
        icon: "history",
      };
    }

    // Priority 4: Weekend watcher (if weekend > 55%)
    if (s.weekdayVsWeekend && (s.weekdayVsWeekend.weekday + s.weekdayVsWeekend.weekend) >= 5) {
      const total = s.weekdayVsWeekend.weekday + s.weekdayVsWeekend.weekend;
      const weekendPct = Math.round((s.weekdayVsWeekend.weekend / total) * 100);
      if (weekendPct >= 55) {
        return {
          stat: `${weekendPct}%`,
          narrative: `You watch ${weekendPct}% of titles on weekends`,
          icon: "weekend",
        };
      }
    }

    // Priority 5: Movie vs TV split (if heavily skewed > 75%)
    if (s.moviePct >= 75) {
      return {
        stat: `${s.moviePct}%`,
        narrative: `You're ${s.moviePct}% movies — a true film purist`,
        icon: "movie",
      };
    }
    if (s.tvPct >= 75) {
      return {
        stat: `${s.tvPct}%`,
        narrative: `You're ${s.tvPct}% series — a dedicated binge watcher`,
        icon: "tv",
      };
    }

    // Priority 6: Completion rate (for series watchers)
    const seriesItems = list.filter((m) => m.media_type === "tv");
    if (seriesItems.length >= 5) {
      const completed = seriesItems.filter((m) => m.status === "Completed").length;
      const completionPct = Math.round((completed / seriesItems.length) * 100);
      if (completionPct >= 80) {
        return {
          stat: `${completionPct}%`,
          narrative: `You finish ${completionPct}% of series you start`,
          icon: "task_alt",
        };
      }
    }

    // Priority 7: Genre diversity
    const genreCount = s.topGenres.length;
    if (genreCount >= 6) {
      return {
        stat: String(genreCount),
        narrative: `You explore ${genreCount} genres — your taste knows no borders`,
        icon: "palette",
      };
    }

    // Fallback: runtime
    if (s.totalRuntimeHours >= 100) {
      return {
        stat: `${Math.round(s.totalRuntimeHours)}`,
        narrative: `${Math.round(s.totalRuntimeHours)} hours of cinema — that's dedication`,
        icon: "schedule",
      };
    }

    return null;
  });

  return (
    <Show when={insight()}>
      {(ins) => (
        <section class="profile-section profile-insight" aria-label="Cinema insight">
          <div class="profile-insight-card">
            <span class="material-symbols-outlined profile-insight-icon" aria-hidden="true">
              {ins().icon}
            </span>
            <p class="profile-insight-text">
              <span class="profile-insight-stat">{ins().stat}</span>
              {" "}{ins().narrative.replace(ins().stat, "").trim()}
            </p>
          </div>
        </section>
      )}
    </Show>
  );
};

export default CinemaInsight;
