import { Show, createMemo, type Accessor, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { titleDetailPath } from "~/shared/utils/titleRoutes";
import type { WatchlistItem } from "~/shared/types";
import HorizontalRail from "./HorizontalRail";
import {
  activityActionText,
  getRecentActivities,
  type ActivityItem
} from "../utils/activity";

export interface RecentActivitySectionProps {
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
}

const RecentActivitySection: Component<RecentActivitySectionProps> = (
  props
) => {
  const navigate = useNavigate();
  const activities = createMemo(() =>
    getRecentActivities(props.watchlist(), 10)
  );

  const activityCard = (activity: ActivityItem) => (
    <button
      type="button"
      class="profile-activity-rail-card focus-ring"
      role="listitem"
      onClick={() => navigate(titleDetailPath(activity.source))}
      aria-label={`${activity.title} — ${activityActionText(activity)}, ${activity.timeAgo}`}
    >
      <Show
        when={activity.posterPath}
        fallback={
          <div class="profile-activity-rail-poster-fallback" aria-hidden="true">
            <span class="material-symbols-outlined" aria-hidden="true">
              movie
            </span>
          </div>
        }
      >
        <img
          src={tmdbImage(activity.posterPath!, "w92")}
          class="profile-activity-rail-poster"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </Show>
      <span class="profile-activity-rail-content">
        <span class="profile-activity-rail-title">{activity.title}</span>
        <span class="profile-activity-rail-action">
          <span class="material-symbols-outlined" aria-hidden="true">
            {activity.action === "rated"
              ? "star"
              : activity.action === "added"
                ? "add_circle"
                : "play_arrow"}
          </span>
          {activityActionText(activity)}
        </span>
        <span class="profile-activity-rail-time">{activity.timeAgo}</span>
      </span>
    </button>
  );

  return (
    <div class="profile-recent-activity-section">
      <HorizontalRail
        title="Recent Activity"
        items={activities}
        viewAllLink="/profile/recent-activity"
        ariaLabel="Recent Activity"
        showNavigation={false}
        renderItem={activityCard}
        class="profile-recent-activity-rail"
        emptyIcon="history_toggle_off"
        emptyMessage="No recent activity yet. Start watching to see your activity here!"
        emptyAction="Start Watching"
        emptyActionLink="/discover"
      />
    </div>
  );
};

export default RecentActivitySection;
