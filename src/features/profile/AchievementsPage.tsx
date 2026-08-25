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
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { ACHIEVEMENTS } from "~/features/profile/achievements.constants";

// Note: ACHIEVEMENTS is the single source of truth, defined in
// `src/features/profile/achievements.constants.ts`. Do NOT redeclare
// badge definitions inline — that caused Bug #10 (page had 16 badges,
// preview had 15, with mismatched titles/thresholds like
// "hundred-titles" being "Cinema Lover" on the page but
// "Top 50 Watcher" in the preview).

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
      <ScrollToTop />
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
