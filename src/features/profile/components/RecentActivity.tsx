// src/features/profile/components/RecentActivity.tsx
//
// Activity section — currently watching + recent.
// Hides entirely if no recent items.
//
// Content (max 4 items):
//   • Currently Watching (up to 2) — slight visual emphasis
//   • Last Completed (1)
//   • Last Rated (1, only if recent)
//
// Design:
//   • Simple status + time — no forced narrative
//   • "Currently Watching" gets left accent bar
//   • No section title — or a subtle "Recently" eyebrow

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { normalizeGenres } from "~/shared/utils/genres";
import type { WatchlistItem } from "~/shared/types";
import { generateActivityReaction } from "../utils/storyGenerator";

interface RecentActivityProps {
  watchlist: Accessor<WatchlistItem[]>;
}

function getDate(item: WatchlistItem): Date {
  const dateStr = item.watchDate || (typeof item.addedAt === "string" ? item.addedAt : null) || item.updatedAt;
  if (!dateStr) return new Date(0);
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date(0);
    return d;
  } catch {
    return new Date(0);
  }
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "last week";
  if (diffDays < 30) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const RecentActivity: Component<RecentActivityProps> = (props) => {
  const recentItems = createMemo(() => {
    const list = props.watchlist();
    if (list.length === 0) return [];

    const items: { item: WatchlistItem; category: "watching" | "completed" | "rated" | "added"; sortDate: Date; reaction: string | null }[] = [];

    // Currently watching (up to 2)
    const watching = list
      .filter((m) => m.status === "Watching")
      .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
      .slice(0, 2);
    watching.forEach((m) => {
      const reaction = generateActivityReaction("watching", {
        mediaType: m.media_type,
        genres: normalizeGenres(m.genresList ?? []),
      });
      items.push({ item: m, category: "watching", sortDate: getDate(m), reaction: reaction?.text ?? null });
    });

    // Last completed (1)
    const completed = list
      .filter((m) => m.status === "Completed")
      .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
      .slice(0, 1);
    completed.forEach((m) => {
      const reaction = generateActivityReaction("completed", {
        mediaType: m.media_type,
        genres: normalizeGenres(m.genresList ?? []),
      });
      items.push({ item: m, category: "completed", sortDate: getDate(m), reaction: reaction?.text ?? null });
    });

    // Last rated (1, with rating > 0)
    const rated = list
      .filter((m) => m.rating && m.rating > 0)
      .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
      .slice(0, 1);
    rated.forEach((m) => {
      const reaction = generateActivityReaction("rated", {
        rating: m.rating,
        genres: normalizeGenres(m.genresList ?? []),
      });
      items.push({ item: m, category: "rated", sortDate: getDate(m), reaction: reaction?.text ?? null });
    });

    // Last added (1, with no rating, not watching, not completed — purely planned)
    const added = list
      .filter((m) => (m.status === "Planned" || m.status === "Plan to Watch") && !m.rating)
      .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
      .slice(0, 1);
    added.forEach((m) => {
      const reaction = generateActivityReaction("added", {
        mediaType: m.media_type,
      });
      items.push({ item: m, category: "added", sortDate: getDate(m), reaction: reaction?.text ?? null });
    });

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = items.filter((entry) => {
      if (seen.has(entry.item.id)) return false;
      seen.add(entry.item.id);
      return true;
    });

    // Sort by date and take top 5
    deduped.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    return deduped.slice(0, 5);
  });

  return (
    <Show when={recentItems().length > 0}>
      <section class="profile-section recent-activity" aria-label="Recent activity">
        <p class="recent-activity-eyebrow">Recently</p>
        <div class="recent-activity-list" role="list">
          <For each={recentItems()}>
            {(entry) => (
              <div
                class={`recent-activity-item ${entry.category === "watching" ? "recent-activity-item-active" : ""}`}
                role="listitem"
              >
                {entry.category === "watching" && <div class="recent-activity-accent-bar" aria-hidden="true" />}
                <div class="recent-activity-poster">
                  <Show
                    when={entry.item.poster_path}
                    fallback={
                      <div class="recent-activity-poster-fallback">
                        <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
                          {entry.item.media_type === "tv" ? "tv" : "movie"}
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(entry.item.poster_path, "w92")}
                      class="recent-activity-poster-img"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                    />
                  </Show>
                </div>
                <div class="recent-activity-info">
                  <p class="recent-activity-title">{entry.item.title || entry.item.name}</p>
                  <p class="recent-activity-meta">
                    <Show when={entry.category === "watching"}>
                      <span class="recent-activity-status-watching">Watching</span>
                    </Show>
                    <Show when={entry.category === "completed"}>
                      <span class="recent-activity-status-completed">Finished</span>
                    </Show>
                    <Show when={entry.category === "rated"}>
                      <span class="recent-activity-status-rated">Rated {entry.item.rating}/10</span>
                    </Show>
                    <Show when={entry.category === "added"}>
                      <span class="recent-activity-status-added">Added to Watchlist</span>
                    </Show>
                    <Show when={entry.sortDate.getTime() > 0}>
                      <span class="recent-activity-time"> · {timeAgo(entry.sortDate)}</span>
                    </Show>
                  </p>
                  <Show when={entry.reaction}>
                    <p class="recent-activity-reaction">"{entry.reaction}"</p>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
};

export default RecentActivity;
