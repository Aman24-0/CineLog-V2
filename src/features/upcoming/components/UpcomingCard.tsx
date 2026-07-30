// src/features/upcoming/components/UpcomingCard.tsx
//
// UpcomingCard — the rich title card for the Upcoming page list view.
//
// Layout (horizontal):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ ┌──────┐                                                     │
//   │ │      │  Title (bold)                              [TODAY]  │
//   │ │ POST │  2026 · Movie · ★ 7.8                                │
//   │ │  ER  │  Releases Fri, Jul 31                                │
//   │ │      │  [Netflix] [Prime]                                   │
//   │ └──────┘                                                     │
//   │  ▶  Trailer   ＋ Watchlist   🔔 Remind   📤 Share            │
//   └─────────────────────────────────────────────────────────────┘
//
// Quick actions:
//   • Trailer    → opens YouTube trailer modal (parent passes onTrailer)
//   • Watchlist  → adds to vault with status "Planned"
//   • Remind     → schedules a release-day push notification
//   • Share      → Web Share API (mobile) or clipboard copy (desktop)
//
// Click on the card body (poster/title) opens the Details modal via
// onOpen.

import { type Component, Show, createMemo } from "solid-js";
import type { TMDBTitle } from "~/shared/types";
import { tmdbImage } from "~/core/tmdb/tmdb";
import CountdownBadge from "./CountdownBadge";

interface UpcomingCardProps {
  title: TMDBTitle;
  /** Whether the user has a reminder set for this title. */
  isReminderSet: boolean;
  /** Whether the title is already in the user's vault. */
  inVault: boolean;
  /** Open the Details modal for this title. */
  onOpen: (title: TMDBTitle) => void;
  /** Open the trailer modal for this title. */
  onTrailer: (title: TMDBTitle) => void;
  /** Add to watchlist with status "Planned". */
  onAddToWatchlist: (title: TMDBTitle) => void;
  /** Toggle the release-day reminder. */
  onToggleReminder: (title: TMDBTitle) => void;
  /** Share the title. */
  onShare: (title: TMDBTitle) => void;
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < 0) return "Out now";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const UpcomingCard: Component<UpcomingCardProps> = (props) => {
  const title = () => props.title.title || props.title.name || "Untitled";
  const year = createMemo(() =>
    (props.title.release_date || props.title.first_air_date || "").slice(0, 4),
  );
  const releaseDate = createMemo(
    () => props.title.release_date || props.title.first_air_date || "",
  );
  const mediaLabel = createMemo(() =>
    props.title.media_type === "tv" ? "Series" : "Movie",
  );
  const rating = createMemo(() =>
    props.title.vote_average ? props.title.vote_average.toFixed(1) : null,
  );

  return (
    <article class="upcoming-card">
      {/* Poster — clickable */}
      <button
        type="button"
        class="upcoming-card-poster-btn focus-ring"
        onClick={() => props.onOpen(props.title)}
        aria-label={`Open details for ${title()}`}
      >
        <Show
          when={props.title.poster_path}
          fallback={
            <div class="upcoming-card-poster-fallback">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "28px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                movie
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.title.poster_path, "w185")}
            class="upcoming-card-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>
        <Show when={releaseDate()}>
          <div class="upcoming-card-countdown">
            <CountdownBadge date={releaseDate()} />
          </div>
        </Show>
      </button>

      {/* Body — clickable */}
      <button
        type="button"
        class="upcoming-card-body focus-ring"
        onClick={() => props.onOpen(props.title)}
        aria-label={`Open details for ${title()}`}
      >
        <h3 class="upcoming-card-title">{title()}</h3>
        <p class="upcoming-card-meta">
          <Show when={year()}>
            <span>{year()}</span>
            <span class="upcoming-card-dot">·</span>
          </Show>
          <span>{mediaLabel()}</span>
          <Show when={rating()}>
            <span class="upcoming-card-dot">·</span>
            <span class="upcoming-card-rating">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px", "font-variation-settings": "'FILL' 1" }}
                aria-hidden="true"
              >
                star
              </span>
              {rating()}
            </span>
          </Show>
        </p>
        <p class="upcoming-card-release">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "14px" }}
            aria-hidden="true"
          >
            event
          </span>
          <Show when={releaseDate()} fallback="Date TBD">
            {relativeDate(releaseDate())}
          </Show>
        </p>
        <Show when={props.inVault}>
          <span class="upcoming-card-vault-badge">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px" }}
              aria-hidden="true"
            >
              check_circle
            </span>
            In your vault
          </span>
        </Show>
      </button>

      {/* Quick actions */}
      <div class="upcoming-card-actions" role="toolbar" aria-label="Quick actions">
        <button
          type="button"
          class="upcoming-card-action focus-ring"
          onClick={() => props.onTrailer(props.title)}
          aria-label="Watch trailer"
          title="Trailer"
        >
          <span class="material-symbols-outlined" aria-hidden="true">play_circle</span>
        </button>
        <button
          type="button"
          class="upcoming-card-action focus-ring"
          onClick={() => props.onAddToWatchlist(props.title)}
          aria-label="Add to watchlist"
          title="Add to watchlist"
          disabled={props.inVault}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {props.inVault ? "check" : "add"}
          </span>
        </button>
        <button
          type="button"
          class={`upcoming-card-action focus-ring ${props.isReminderSet ? "is-active" : ""}`}
          onClick={() => props.onToggleReminder(props.title)}
          aria-label={props.isReminderSet ? "Cancel reminder" : "Set reminder"}
          aria-pressed={props.isReminderSet}
          title={props.isReminderSet ? "Reminder set" : "Remind me"}
        >
          <span
            class="material-symbols-outlined"
            aria-hidden="true"
            style={props.isReminderSet ? { "font-variation-settings": "'FILL' 1" } : undefined}
          >
            notifications
          </span>
        </button>
        <button
          type="button"
          class="upcoming-card-action focus-ring"
          onClick={() => props.onShare(props.title)}
          aria-label="Share"
          title="Share"
        >
          <span class="material-symbols-outlined" aria-hidden="true">share</span>
        </button>
      </div>
    </article>
  );
};

export default UpcomingCard;
