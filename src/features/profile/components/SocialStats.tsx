// src/features/profile/components/SocialStats.tsx
//
// SocialStats — small inline display of followers / following counts.
//
// This is a thin presentational wrapper around the useSocialStats
// hook. It's used by the ProfileHeader for inline display; the
// parent passes the already-fetched stats to avoid double-fetching.
//
// Spec: "Social stats: Followers / Following counts (fetch via
// useSocialStats)." The hook lives at ../hooks/useSocialStats and is
// invoked by the parent (ProfilePage) so the counts are shared
// between the header and any other consumer.

import { Show, type Component, type Accessor } from "solid-js";
import type { SocialStats } from "../hooks/useSocialStats";

export interface SocialStatsProps {
  stats: Accessor<SocialStats>;
  loading: Accessor<boolean>;
}

const SocialStats: Component<SocialStatsProps> = (props) => {
  return (
    <div class="profile-social-stats-v3" aria-label="Social stats">
      <div class="profile-social-stats-v3-stat">
        <span class="profile-social-stats-v3-num">
          <Show when={!props.loading()} fallback="—">
            {props.stats().following}
          </Show>
        </span>
        <span class="profile-social-stats-v3-label">Following</span>
      </div>
      <span class="profile-social-stats-v3-divider" aria-hidden="true">·</span>
      <div class="profile-social-stats-v3-stat">
        <span class="profile-social-stats-v3-num">
          <Show when={!props.loading()} fallback="—">
            {props.stats().followers}
          </Show>
        </span>
        <span class="profile-social-stats-v3-label">Followers</span>
      </div>
    </div>
  );
};

export default SocialStats;
