// src/features/profile/components/AchievementsPreview.tsx
//
// AchievementsPreview keeps the shared achievement definitions and progress
// logic, but presents the badges as a compact horizontal rail.

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { WatchlistItem } from "~/shared/types";
import {
  ACHIEVEMENTS,
  type AchievementDef
} from "~/features/profile/achievements.constants";
import HorizontalRail from "./HorizontalRail";

export interface AchievementsPreviewProps {
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
}

type AchievementPreviewItem = {
  def: AchievementDef;
  unlocked: boolean;
  current: number;
  target: number;
};

const AchievementsPreview: Component<AchievementsPreviewProps> = (props) => {
  const navigate = useNavigate();

  const computed = createMemo(() => {
    const list = props.watchlist() ?? [];
    return ACHIEVEMENTS.map((def) => {
      const progress = def.progress(list);
      return { def, ...progress };
    });
  });

  const unlockedBadges = createMemo(() =>
    computed().filter((badge) => badge.unlocked)
  );
  const unlockedCount = createMemo(() => unlockedBadges().length);
  const goFullPage = () => navigate("/profile/achievements");

  const badgeCard = (badge: AchievementPreviewItem) => {
    const pct =
      badge.target > 0 ? Math.round((badge.current / badge.target) * 100) : 0;
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
  };

  return (
    <div class="profile-achievements-preview-v3" aria-label="Achievements">
      <p class="profile-achievements-preview-v3-summary">
        {unlockedCount()} of {ACHIEVEMENTS.length} unlocked
      </p>
      <HorizontalRail
        title="Achievements"
        items={unlockedBadges}
        viewAllLink="/profile/achievements"
        ariaLabel="Achievements"
        renderItem={badgeCard}
        emptyIcon="emoji_events"
        emptyMessage="No achievements yet. Keep watching to unlock!"
        emptyAction="Keep Watching"
        emptyActionLink="/discover"
      />
    </div>
  );
};

export default AchievementsPreview;
