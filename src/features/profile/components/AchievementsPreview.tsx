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
import type { WatchlistItem } from "~/shared/types";
import { ACHIEVEMENTS } from "~/features/profile/achievements.constants";

// Bug #10 (Phase 13 Chunk 3): Previously this component redeclared
// its own `BADGES` array which had drifted from the page's `ACHIEVEMENTS`
// (15 vs 16 badges, missing `animation-fan`, and `hundred-titles` was
// "Top 50 Watcher" here vs "Cinema Lover" on the page despite the same
// 100-title threshold). Both surfaces now consume the shared
// `ACHIEVEMENTS` array from `achievements.constants.ts`. The preview
// simply ignores the `desc` field that the full page renders.

export interface AchievementsPreviewProps {
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
}

const AchievementsPreview: Component<AchievementsPreviewProps> = (props) => {
  const navigate = useNavigate();

  const computed = createMemo(() => {
    const list = props.watchlist() ?? [];
    return ACHIEVEMENTS.map((def) => {
      const p = def.progress(list);
      return { def, ...p };
    });
  });

  const unlockedCount = createMemo(
    () => computed().filter((b) => b.unlocked).length
  );
  const goFullPage = () => navigate("/profile/achievements");

  return (
    <div class="profile-achievements-preview-v3" aria-label="Achievements">
      <div class="profile-achievements-preview-v3-header">
        <p class="profile-achievements-preview-v3-summary">
          {unlockedCount()} of {ACHIEVEMENTS.length} unlocked
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
            const pct =
              badge.target > 0
                ? Math.round((badge.current / badge.target) * 100)
                : 0;
            return (
              <button
                type="button"
                role="listitem"
                class={`profile-achievements-preview-v3-badge focus-ring ${badge.unlocked ? "is-unlocked" : "is-locked"}`}
                onClick={goFullPage}
                aria-label={`${badge.def.title} — ${badge.unlocked ? "unlocked" : `${badge.current} of ${badge.target}`}`}
                title={`${badge.def.title} ${badge.unlocked ? "✓" : `(${badge.current}/${badge.target})`}`}
              >
                <div
                  class="profile-achievements-preview-v3-badge-icon-wrap"
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {badge.unlocked ? badge.def.icon : "lock"}
                  </span>
                </div>
                <p class="profile-achievements-preview-v3-badge-title">
                  {badge.def.title}
                </p>
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
