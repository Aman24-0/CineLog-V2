// src/features/profile/components/AchievementsPreview.tsx
//
// AchievementsPreview — a 3-column grid of achievement badges with
// progress bars and lock/unlock indicators.
//
// The badge definitions + progress logic are shared with the full
// Achievements page via the existing AchievementBadges component's
// BADGES array. To avoid duplicating that array (and risking drift
// between the preview and the full page), we re-export the same
// definitions here and render them in a grid layout (vs. the
// horizontal rail used by AchievementBadges).
//
// Clicking a badge opens the full achievements page at
// /profile/achievements.

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { hasGenre, collectGenres } from "~/shared/utils/genres";
import type { WatchlistItem } from "~/shared/types";

// Re-declare the badge definitions here (mirroring AchievementBadges.tsx).
// A future refactor could extract these into a shared module, but for
// now we duplicate to keep the AchievementsPreview self-contained per
// the spec's "hardcoded list with user progress" requirement.
interface BadgeDef {
  id: string;
  title: string;
  icon: string;
  progress: (list: WatchlistItem[]) => { unlocked: boolean; current: number; target: number };
}

const BADGES: BadgeDef[] = [
  { id: "first-watch", title: "First Steps", icon: "play_circle",
    progress: (l) => ({ unlocked: l.length >= 1, current: Math.min(l.length, 1), target: 1 }) },
  { id: "ten-titles", title: "Getting Started", icon: "video_library",
    progress: (l) => ({ unlocked: l.length >= 10, current: Math.min(l.length, 10), target: 10 }) },
  { id: "fifty-titles", title: "Cinephile", icon: "movie_filter",
    progress: (l) => ({ unlocked: l.length >= 50, current: Math.min(l.length, 50), target: 50 }) },
  { id: "hundred-titles", title: "Top 50 Watcher", icon: "auto_awesome",
    progress: (l) => ({ unlocked: l.length >= 100, current: Math.min(l.length, 100), target: 100 }) },
  { id: "first-complete", title: "Completed", icon: "task_alt",
    progress: (l) => {
      const c = l.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 1, current: Math.min(c, 1), target: 1 };
    } },
  { id: "ten-completed", title: "Finisher", icon: "check_circle",
    progress: (l) => {
      const c = l.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    } },
  { id: "fifty-completed", title: "Completionist", icon: "emoji_events",
    progress: (l) => {
      const c = l.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 50, current: Math.min(c, 50), target: 50 };
    } },
  { id: "tv-binger", title: "Series Binger", icon: "tv",
    progress: (l) => {
      const c = l.filter((m) => m.media_type === "tv").length;
      return { unlocked: c >= 20, current: Math.min(c, 20), target: 20 };
    } },
  { id: "movie-purist", title: "Film Purist", icon: "movie",
    progress: (l) => {
      const c = l.filter((m) => m.media_type === "movie").length;
      return { unlocked: c >= 30, current: Math.min(c, 30), target: 30 };
    } },
  { id: "critic", title: "Critic", icon: "star",
    progress: (l) => {
      const c = l.filter((m) => m.rating && m.rating > 0).length;
      return { unlocked: c >= 25, current: Math.min(c, 25), target: 25 };
    } },
  { id: "decade-explorer", title: "Time Traveler", icon: "history",
    progress: (l) => {
      const decades = new Set<string>();
      l.forEach((m) => {
        const d = m.release_date || m.first_air_date;
        if (d) {
          const y = parseInt(d.split("-")[0], 10);
          if (!isNaN(y)) decades.add(Math.floor(y / 10) * 10 + "s");
        }
      });
      return { unlocked: decades.size >= 4, current: Math.min(decades.size, 4), target: 4 };
    } },
  { id: "genre-explorer", title: "Eclectic Taste", icon: "palette",
    progress: (l) => {
      const genres = new Set<string>();
      collectGenres(l).forEach((g) => genres.add(g));
      return { unlocked: genres.size >= 8, current: Math.min(genres.size, 8), target: 8 };
    } },
  { id: "sci-fi-explorer", title: "Sci-Fi Explorer", icon: "rocket_launch",
    progress: (l) => {
      const c = l.filter((m) => hasGenre(m, "sci")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    } },
  { id: "horror-fan", title: "Horror Aficionado", icon: "ghost",
    progress: (l) => {
      const c = l.filter((m) => hasGenre(m, "horror")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    } },
  { id: "drama-lover", title: "Drama Lover", icon: "theater_comedy",
    progress: (l) => {
      const c = l.filter((m) => hasGenre(m, "drama")).length;
      return { unlocked: c >= 15, current: Math.min(c, 15), target: 15 };
    } },
];

export interface AchievementsPreviewProps {
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
}

const AchievementsPreview: Component<AchievementsPreviewProps> = (props) => {
  const navigate = useNavigate();

  const computed = createMemo(() => {
    const list = props.watchlist() ?? [];
    return BADGES.map((def) => {
      const p = def.progress(list);
      return { def, ...p };
    });
  });

  const unlockedCount = createMemo(() => computed().filter((b) => b.unlocked).length);
  const goFullPage = () => navigate("/profile/achievements");

  return (
    <div class="profile-achievements-preview-v3" aria-label="Achievements">
      <div class="profile-achievements-preview-v3-header">
        <p class="profile-achievements-preview-v3-summary">
          {unlockedCount()} of {BADGES.length} unlocked
        </p>
        <button
          type="button"
          class="profile-achievements-preview-v3-view-all focus-ring"
          onClick={goFullPage}
        >
          View all
        </button>
      </div>

      <div class="profile-achievements-preview-v3-grid" role="list">
        <For each={computed()}>
          {(badge) => {
            const pct = badge.target > 0 ? Math.round((badge.current / badge.target) * 100) : 0;
            return (
              <button
                type="button"
                role="listitem"
                class={`profile-achievements-preview-v3-badge focus-ring ${badge.unlocked ? "is-unlocked" : "is-locked"}`}
                onClick={goFullPage}
                aria-label={`${badge.def.title} — ${badge.unlocked ? "unlocked" : `${badge.current} of ${badge.target}`}`}
                title={`${badge.def.title} ${badge.unlocked ? "✓" : `(${badge.current}/${badge.target})`}`}
              >
                <div class="profile-achievements-preview-v3-badge-icon-wrap" aria-hidden="true">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {badge.unlocked ? badge.def.icon : "lock"}
                  </span>
                </div>
                <p class="profile-achievements-preview-v3-badge-title">{badge.def.title}</p>
                <Show when={!badge.unlocked}>
                  <p class="profile-achievements-preview-v3-badge-progress-text">
                    {badge.current}/{badge.target}
                  </p>
                </Show>
                <div
                  class="profile-achievements-preview-v3-badge-progress-bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${badge.def.title} progress`}
                >
                  <div
                    class="profile-achievements-preview-v3-badge-progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default AchievementsPreview;
