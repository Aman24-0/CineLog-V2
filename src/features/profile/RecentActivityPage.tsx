import { Show, For, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { tmdbImage } from "~/core/tmdb/tmdb";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import type { ActivityItem } from "./utils/activity";
import {
  activityActionText,
  groupActivitiesByDate,
  getRecentActivities
} from "./utils/activity";
import { titleDetailPath } from "~/shared/utils/titleRoutes";

const RecentActivityPage: Component = () => {
  const { isSignedIn, authReady } = useAuth();
  const library = useUserLibrary();
  const navigate = useNavigate();

  const loading = createMemo(
    () => !authReady() || (isSignedIn() && library.loading())
  );
  const activities = createMemo(() =>
    getRecentActivities(library.watchlist(), 100)
  );
  const groupedActivities = createMemo(() =>
    groupActivitiesByDate(activities())
  );

  const activityIcon = (activity: ActivityItem) =>
    activity.action === "rated"
      ? "star"
      : activity.action === "added"
        ? "add_circle"
        : activity.action === "completed"
          ? "check_circle"
          : "play_arrow";

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="profile-recent-activity-page sec-page sec-fade-in">
        <div class="sec-header">
          <a
            href="/profile"
            class="sec-back focus-ring"
            aria-label="Back to profile"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Recent Activity</p>
          <h1 class="sec-title">My Journal</h1>
          <p class="sec-subtitle">
            Your latest watches, ratings, and library moments in chronological
            order.
          </p>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="profile-recent-activity-page-list" aria-busy="true">
              <For each={Array.from({ length: 6 })}>
                {() => (
                  <div class="sec-skeleton-block profile-activity-detail-skeleton" />
                )}
              </For>
            </div>
          }
        >
          <Show
            when={isSignedIn()}
            fallback={
              <div class="glass-empty-state" role="status">
                <div class="glass-empty-state-icon" aria-hidden="true">
                  <span class="material-symbols-outlined">history</span>
                </div>
                <h3 class="glass-empty-state-title">
                  Sign in to see your activity
                </h3>
                <p class="glass-empty-state-body">
                  Your watching journal appears here once you sign in.
                </p>
              </div>
            }
          >
            <Show
              when={activities().length > 0}
              fallback={
                <div class="glass-empty-state" role="status">
                  <div class="glass-empty-state-icon" aria-hidden="true">
                    <span class="material-symbols-outlined">
                      history_toggle_off
                    </span>
                  </div>
                  <h3 class="glass-empty-state-title">
                    No recent activity yet
                  </h3>
                  <p class="glass-empty-state-body">
                    Add or watch a title and your journal will start here.
                  </p>
                  <a
                    href="/discover"
                    class="empty-action-link focus-ring"
                    style={{ "margin-top": "var(--sp-2)" }}
                  >
                    Discover Content
                  </a>
                </div>
              }
            >
              <div class="profile-recent-activity-page-list">
                <For each={Object.entries(groupedActivities())}>
                  {([dateKey, dateActivities]) => (
                    <section
                      class="profile-activity-date-group"
                      aria-labelledby={`activity-${dateKey}`}
                    >
                      <div class="profile-activity-date-header">
                        <h2
                          id={`activity-${dateKey}`}
                          class="profile-activity-date-title"
                        >
                          {dateKey}
                        </h2>
                        <span class="profile-activity-date-count">
                          {dateActivities.length}{" "}
                          {dateActivities.length === 1 ? "moment" : "moments"}
                        </span>
                      </div>
                      <div class="profile-activity-detail-list">
                        <For each={dateActivities}>
                          {(activity) => (
                            <button
                              type="button"
                              class="profile-activity-detail-card focus-ring"
                              onClick={() =>
                                navigate(titleDetailPath(activity.source))
                              }
                              aria-label={`${activity.title} — ${activityActionText(activity)}, ${activity.timeAgo}`}
                            >
                              <Show
                                when={activity.posterPath}
                                fallback={
                                  <div
                                    class="profile-activity-detail-poster-fallback"
                                    aria-hidden="true"
                                  >
                                    <span class="material-symbols-outlined">
                                      movie
                                    </span>
                                  </div>
                                }
                              >
                                <img
                                  src={tmdbImage(activity.posterPath!, "w92")}
                                  class="profile-activity-detail-poster"
                                  loading="lazy"
                                  decoding="async"
                                  alt=""
                                  aria-hidden="true"
                                />
                              </Show>
                              <span class="profile-activity-detail-content">
                                <span class="profile-activity-detail-heading">
                                  <strong>{activity.title}</strong>
                                  <time
                                    dateTime={activity.timestamp.toISOString()}
                                  >
                                    {activity.timestamp.toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit"
                                    })}
                                  </time>
                                </span>
                                <span class="profile-activity-detail-type">
                                  {activity.type === "anime"
                                    ? "Anime"
                                    : activity.type === "series"
                                      ? "Series"
                                      : "Movie"}
                                </span>
                                <span class="profile-activity-detail-action">
                                  <span
                                    class="material-symbols-outlined"
                                    aria-hidden="true"
                                  >
                                    {activityIcon(activity)}
                                  </span>
                                  {activityActionText(activity)}
                                </span>
                                <span class="profile-activity-detail-relative">
                                  {activity.timeAgo}
                                </span>
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </PageContainer>
  );
};

export default RecentActivityPage;
