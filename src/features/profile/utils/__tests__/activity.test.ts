import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "~/shared/types";
import {
  activityActionText,
  formatDateKey,
  formatTimeAgo,
  getRecentActivities,
  groupActivitiesByDate
} from "../activity";

const now = new Date("2026-08-25T12:00:00.000Z");

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "title-1",
    title: "Dark",
    media_type: "movie",
    status: "Completed",
    poster_path: "/dark.jpg",
    watchDate: "2026-08-25T10:00:00.000Z",
    ...overrides
  };
}

describe("Recent Activity utilities", () => {
  it("formats relative timestamps for minutes, hours, and days", () => {
    expect(formatTimeAgo(new Date("2026-08-25T11:45:00.000Z"), now)).toBe(
      "15 minutes ago"
    );
    expect(formatTimeAgo(new Date("2026-08-25T10:00:00.000Z"), now)).toBe(
      "2 hours ago"
    );
    expect(formatTimeAgo(new Date("2026-08-22T12:00:00.000Z"), now)).toBe(
      "3 days ago"
    );
  });

  it("derives action details and sorts activities newest first", () => {
    const activities = getRecentActivities(
      [
        item({ id: "older", watchDate: "2026-08-20T12:00:00.000Z" }),
        item({
          id: "episode",
          media_type: "tv",
          title: "Attack on Titan",
          status: "Watching",
          watchDate: undefined,
          watchProgress: {
            currentTime: 10,
            duration: 20,
            updatedAt: "2026-08-25T11:00:00.000Z",
            season: 1,
            episode: 5
          }
        }),
        item({
          id: "rated",
          title: "Breaking Bad",
          status: "Watching",
          rating: 9,
          watchDate: "2026-08-25T09:00:00.000Z"
        })
      ],
      10,
      now
    );

    expect(activities.map((activity) => activity.id)).toEqual([
      "tv:episode:1787655600000",
      "movie:rated:1787648400000",
      "movie:older:1787227200000"
    ]);
    expect(activityActionText(activities[0])).toBe("Watched S01E05");
    expect(activityActionText(activities[1])).toBe("Rated 9/10");
    expect(activityActionText(activities[2])).toBe("Completed");
  });

  it("groups activities as Today, Yesterday, relative days, or calendar dates", () => {
    expect(formatDateKey(new Date("2026-08-25T08:00:00.000Z"), now)).toBe(
      "Today"
    );
    expect(formatDateKey(new Date("2026-08-24T08:00:00.000Z"), now)).toBe(
      "Yesterday"
    );
    expect(formatDateKey(new Date("2026-08-20T08:00:00.000Z"), now)).toBe(
      "5 Days Ago"
    );
    expect(formatDateKey(new Date("2026-07-29T08:00:00.000Z"), now)).toBe(
      "Jul 29, 2026"
    );

    const activities = getRecentActivities([item()], 10, now);
    expect(Object.keys(groupActivitiesByDate(activities, now))).toEqual([
      "Today"
    ]);
  });
});
