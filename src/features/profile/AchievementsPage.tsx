// src/features/profile/AchievementsPage.tsx
//
// AchievementsPage — "What kind of cinephile am I?"
//
// NOT gamification. No childish badges. No XP. No levels.
// Achievements are elegant museum cards — premium, minimal, aspirational.
//
// Each card has:
//   • An icon (Material Symbol)
//   • A title (Bebas Neue)
//   • A description (Outfit)
//   • A progress bar (if in progress)
//   • Unlocked state (glow) vs locked state (dimmed)

import { Show, For, createMemo, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { hasGenre, collectGenres } from "~/shared/utils/genres";
import PageContainer from "~/shared/ui/PageContainer";

interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  /** Compute progress from watchlist. Returns { current, target } or { unlocked: true }. */
  progress: (list: import("~/shared/types").WatchlistItem[]) => {
    unlocked: boolean;
    current: number;
    target: number;
  };
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-watch",
    title: "First Steps",
    desc: "Add your first title to your watchlist.",
    icon: "play_circle",
    progress: (list) => ({
      unlocked: list.length >= 1,
      current: Math.min(list.length, 1),
      target: 1
    })
  },
  {
    id: "ten-titles",
    title: "Getting Started",
    desc: "Build a watchlist of 10 titles.",
    icon: "video_library",
    progress: (list) => ({
      unlocked: list.length >= 10,
      current: Math.min(list.length, 10),
      target: 10
    })
  },
  {
    id: "fifty-titles",
    title: "Cinephile",
    desc: "Reach 50 titles in your watchlist.",
    icon: "movie_filter",
    progress: (list) => ({
      unlocked: list.length >= 50,
      current: Math.min(list.length, 50),
      target: 50
    })
  },
  {
    id: "hundred-titles",
    title: "Cinema Lover",
    desc: "Reach 100 titles in your watchlist.",
    icon: "auto_awesome",
    progress: (list) => ({
      unlocked: list.length >= 100,
      current: Math.min(list.length, 100),
      target: 100
    })
  },
  {
    id: "first-complete",
    title: "Completed",
    desc: "Finish your first title.",
    icon: "task_alt",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 1, current: Math.min(c, 1), target: 1 };
    }
  },
  {
    id: "ten-completed",
    title: "Finisher",
    desc: "Complete 10 titles.",
    icon: "check_circle",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "fifty-completed",
    title: "Completionist",
    desc: "Complete 50 titles.",
    icon: "emoji_events",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 50, current: Math.min(c, 50), target: 50 };
    }
  },
  {
    id: "sci-fi-explorer",
    title: "Sci-Fi Explorer",
    desc: "Watch 10 Sci-Fi titles.",
    icon: "rocket_launch",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "sci")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "horror-fan",
    title: "Horror Aficionado",
    desc: "Watch 10 Horror titles.",
    icon: "ghost",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "horror")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "drama-lover",
    title: "Drama Lover",
    desc: "Watch 15 Drama titles.",
    icon: "theater_comedy",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "drama")).length;
      return { unlocked: c >= 15, current: Math.min(c, 15), target: 15 };
    }
  },
  {
    id: "animation-fan",
    title: "Animation Fan",
    desc: "Watch 10 Animation titles.",
    icon: "animation",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "anim")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "tv-binger",
    title: "Series Binger",
    desc: "Add 20 TV series to your watchlist.",
    icon: "tv",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "tv").length;
      return { unlocked: c >= 20, current: Math.min(c, 20), target: 20 };
    }
  },
  {
    id: "movie-purist",
    title: "Film Purist",
    desc: "Add 30 movies to your watchlist.",
    icon: "movie",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "movie").length;
      return { unlocked: c >= 30, current: Math.min(c, 30), target: 30 };
    }
  },
  {
    id: "critic",
    title: "Critic",
    desc: "Rate 25 titles.",
    icon: "star",
    progress: (list) => {
      const c = list.filter((m) => m.rating && m.rating > 0).length;
      return { unlocked: c >= 25, current: Math.min(c, 25), target: 25 };
    }
  },
  {
    id: "decade-explorer",
    title: "Time Traveler",
    desc: "Watch titles from 4 different decades.",
    icon: "history",
    progress: (list) => {
      const decades = new Set<string>();
      list.forEach((m) => {
        const d = m.release_date || m.first_air_date;
        if (d) {
          const y = parseInt(d.split("-")[0], 10);
          if (!isNaN(y)) decades.add(Math.floor(y / 10) * 10 + "s");
        }
      });
      return {
        unlocked: decades.size >= 4,
        current: Math.min(decades.size, 4),
        target: 4
      };
    }
  },
  {
    id: "genre-explorer",
    title: "Eclectic Taste",
    desc: "Watch titles from 8 different genres.",
    icon: "palette",
    progress: (list) => {
      const genres = new Set<string>();
      collectGenres(list).forEach((g) => genres.add(g));
      return {
        unlocked: genres.size >= 8,
        current: Math.min(genres.size, 8),
        target: 8
      };
    }
  }
];

const AchievementsPage: Component = () => {
  const library = useUserLibrary();
  const { isSignedIn, authReady } = useAuth();

  const loading = createMemo(
    () => !authReady() || (isSignedIn() && library.loading())
  );

  const computed = createMemo(() => {
    const list = library.watchlist();
    return ACHIEVEMENTS.map((def) => {
      const p = def.progress(list);
      return {
        def,
        ...p,
        pct: p.target > 0 ? Math.round((p.current / p.target) * 100) : 0
      };
    });
  });

  const unlockedCount = createMemo(
    () => computed().filter((a) => a.unlocked).length
  );

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in">
        {/* Header */}
        <div class="sec-header">
          <a
            href="/profile"
            class="sec-back focus-ring"
            aria-label="Back to profile"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px" }}
              aria-hidden="true"
            >
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Achievements</p>
          <h1 class="sec-title">Your cinephile journey</h1>
          <p class="sec-subtitle">
            Milestones that define what kind of cinephile you are. Elegant, not
            gamified.
          </p>
        </div>

        <div class="sec-body">
          <Show
            when={!loading()}
            fallback={
              <div class="achievement-grid">
                <div class="sec-skeleton-block" style={{ height: "160px" }} />
                <div class="sec-skeleton-block" style={{ height: "160px" }} />
                <div class="sec-skeleton-block" style={{ height: "160px" }} />
                <div class="sec-skeleton-block" style={{ height: "160px" }} />
              </div>
            }
          >
            <Show
              when={isSignedIn()}
              fallback={
                <div class="glass-empty-state" role="status">
                  <div class="glass-empty-state-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "32px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      emoji_events
                    </span>
                  </div>
                  <h3 class="glass-empty-state-title">
                    Sign in to track achievements
                  </h3>
                  <p class="glass-empty-state-body">
                    Your cinematic milestones appear here once you sign in.
                  </p>
                </div>
              }
            >
              {/* Progress summary */}
              <div
                class="insight-card"
                style={{ "margin-bottom": "var(--sp-6)" }}
              >
                <div class="insight-card-header">
                  <div class="insight-card-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      military_tech
                    </span>
                  </div>
                  <p class="insight-card-title">
                    {unlockedCount()} of {ACHIEVEMENTS.length} unlocked
                  </p>
                </div>
                <p class="insight-card-body">
                  <span class="accent">{unlockedCount()}</span> achievements
                  earned · {ACHIEVEMENTS.length - unlockedCount()} to discover
                </p>
                <div
                  class="achievement-progress"
                  style={{ "margin-top": "var(--sp-3)" }}
                >
                  <div class="achievement-progress-bar">
                    <div
                      class="achievement-progress-fill"
                      style={{
                        width: `${(unlockedCount() / ACHIEVEMENTS.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Achievement grid */}
              <div class="achievement-grid sec-stagger">
                <For each={computed()}>
                  {(ach) => (
                    <div
                      class={`achievement-card focus-ring ${
                        ach.unlocked
                          ? "achievement-card-unlocked"
                          : "achievement-card-locked"
                      }`}
                      role="status"
                      aria-label={`${ach.def.title} — ${ach.unlocked ? "unlocked" : `${ach.current} of ${ach.target}`}`}
                    >
                      <div class="achievement-icon-wrap" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "24px" }}
                          aria-hidden="true"
                        >
                          {ach.def.icon}
                        </span>
                      </div>
                      <h3 class="achievement-title">{ach.def.title}</h3>
                      <p class="achievement-desc">{ach.def.desc}</p>
                      <Show when={!ach.unlocked}>
                        <div class="achievement-progress">
                          <div class="achievement-progress-bar">
                            <div
                              class="achievement-progress-fill"
                              style={{ width: `${ach.pct}%` }}
                            />
                          </div>
                          <div class="achievement-progress-text">
                            <span>
                              {ach.current} / {ach.target}
                            </span>
                            <span>{ach.pct}%</span>
                          </div>
                        </div>
                      </Show>
                      <Show when={ach.unlocked}>
                        <div
                          class="achievement-progress-text"
                          style={{ "margin-top": "var(--sp-3)" }}
                        >
                          <span style={{ color: "var(--p)" }}>✓ Unlocked</span>
                          <span>
                            {ach.target} / {ach.target}
                          </span>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </PageContainer>
  );
};

export default AchievementsPage;
