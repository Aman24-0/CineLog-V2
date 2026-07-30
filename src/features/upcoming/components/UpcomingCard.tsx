// src/features/upcoming/components/UpcomingCard.tsx
//
// UpcomingCard — the rich title card for the Upcoming page list view.
//
// Layout (horizontal):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ ┌──────┐                                                     │
//   │ │      │  Title (bold)                                       │
//   │ │ POST │  2026 · Movie · ★ 7.8 · S2 E5                       │
//   │ │  ER  │  Releases Fri, Jul 31                                │
//   │ │      │  [Netflix] [Amazon]                                  │
//   │ └──────┘                                                     │
//   │  [TODAY]              ▶  Trailer   ＋ Watchlist   🔔   📤    │
//   └─────────────────────────────────────────────────────────────┘
//
// v5: the CountdownBadge (TODAY / TOMORROW / N DAYS / OUT NOW) was
// moved from the poster (bottom-left overlay) to the action bar row
// (left side). This fills the empty space on the left of the actions
// row on mobile, and ensures the badge is ALWAYS visible — even for
// series whose `first_air_date` is in the past (the badge shows
// "OUT NOW" instead of being hidden).
//
// Quick actions:
//   • Trailer    → opens YouTube trailer modal (parent passes onTrailer)
//   • Watchlist  → adds to vault with status "Planned"
//   • Remind     → schedules a release-day push notification
//   • Share      → Web Share API (mobile) or clipboard copy (desktop)
//
// Click on the card body (poster/title) opens the Details modal via
// onOpen.
//
// Enrichment (v3):
//   • TV series with a next episode render "S2 E5" in the metadata row.
//   • Titles with watch providers render up to 4 GlassBadge chips
//     below the release date row.
//   • Poster fallback shows the title's first initial when the path
//     is null OR the image fails to load (onError swaps in the
//     fallback element).

import { type Component, Show, createMemo, createSignal, For } from "solid-js";
import type { TMDBTitle } from "~/shared/types";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { GlassBadge } from "~/shared/ui/glass";
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

function relativeDate(dateStr: string, isTvWithMissingEpisode?: boolean): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) {
    // For TV series where we only have first_air_date (premiere date in
    // the past) and we couldn't fetch the next-episode air date, the
    // series was returned by /discover/tv with air_date.gte/lte —
    // meaning it HAS an episode airing in the window. We just don't
    // know the exact date. Show "Series returning" instead of the
    // misleading "Out now".
    if (isTvWithMissingEpisode) return "Series returning";
    return "Out now";
  }
  // For dates >1 day in the future, show the actual calendar date
  // (e.g., "Aug 2") so the user knows exactly when the episode/movie
  // is releasing. Previously this showed "In N days" for 2-6 days,
  // which is less informative for upcoming releases.
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an ISO date string as a compact actual date (e.g., "Aug 2").
 * Used for TV series with next-episode info, where the user wants to
 * see the exact release date alongside the episode number.
 */
function formatActualDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
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
    () => props.title.episodeAirDate || props.title.release_date || props.title.first_air_date || "",
  );
  // True for TV series whose only available date is `first_air_date`
  // (in the past for ongoing series). Used to show "Series returning"
  // instead of the misleading "Out now" in the date row.
  const isTvWithMissingEpisode = createMemo(
    () =>
      props.title.media_type === "tv" &&
      !props.title.episodeAirDate &&
      !!props.title.first_air_date,
  );
  const mediaLabel = createMemo(() =>
    props.title.media_type === "tv" ? "Series" : "Movie",
  );
  const rating = createMemo(() =>
    props.title.vote_average ? props.title.vote_average.toFixed(1) : null,
  );
  // "S2 E5" — only for TV series with a populated next episode.
  const episodeTag = createMemo(() => {
    if (props.title.media_type !== "tv") return null;
    const s = props.title.seasonNumber;
    const e = props.title.episodeNumber;
    if (s == null || e == null) return null;
    return `S${s} E${e}`;
  });
  // Up to 4 provider names (the repository already caps at 4 but we
  // slice again as a safety net).
  const providers = createMemo(() => (props.title.providers ?? []).slice(0, 4));

  // Poster fallback state — when the <img> errors (broken path, 404,
  // network failure), we swap to the fallback element. We also start
  // in fallback mode when there's no poster_path at all.
  const [posterBroken, setPosterBroken] = createSignal(false);
  const showPoster = createMemo(
    () => !!props.title.poster_path && !posterBroken(),
  );
  // First letter for the placeholder (used when no poster).
  const placeholderInitial = createMemo(() => {
    const t = title() || "?";
    return t.charAt(0).toUpperCase();
  });

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
          when={showPoster()}
          fallback={
            <div class="upcoming-card-poster-fallback">
              <Show
                when={placeholderInitial()}
                fallback={
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "28px", color: "var(--text-dim)" }}
                    aria-hidden="true"
                  >
                    movie
                  </span>
                }
              >
                <span class="upcoming-card-poster-initial" aria-hidden="true">
                  {placeholderInitial()}
                </span>
              </Show>
            </div>
          }
        >
          <img
            src={tmdbImage(props.title.poster_path, "w185")}
            class="upcoming-card-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            onError={() => setPosterBroken(true)}
          />
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
        {/* ── Next-episode row (TV series only) ─────────────────────
            Shows "S3 E7 · Aug 2" prominently so the user knows exactly
            which episode is releasing and when. Only rendered when we
            have next-episode data (seasonNumber + episodeNumber). */}
        <Show when={episodeTag() && releaseDate()}>
          <p class="upcoming-card-episode-row">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px" }}
              aria-hidden="true"
            >
              tv
            </span>
            <span class="upcoming-card-episode-tag">{episodeTag()}</span>
            <span class="upcoming-card-dot">·</span>
            <span class="upcoming-card-episode-date">
              {formatActualDate(releaseDate())}
            </span>
          </p>
        </Show>
        <p class="upcoming-card-release">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "14px" }}
            aria-hidden="true"
          >
            event
          </span>
          <Show when={releaseDate()} fallback="Date TBD">
            {relativeDate(releaseDate(), isTvWithMissingEpisode())}
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
        <Show when={providers().length > 0}>
          <div class="upcoming-card-providers" aria-label="Available on">
            <For each={providers()}>
              {(name) => (
                <GlassBadge
                  size="compact"
                  intent="default"
                  label={name}
                  class="upcoming-card-provider-chip"
                />
              )}
            </For>
          </div>
        </Show>
      </button>

      {/* Quick actions row — badge on the left (fills the empty
          space below the body on mobile), action buttons on the right. */}
      <div class="upcoming-card-actions" role="toolbar" aria-label="Quick actions">
        {/* Countdown badge (TODAY / TOMORROW / N DAYS / OUT NOW / RETURNING).
            Moved here from the poster in v5 — fills the empty space
            on the left of the actions row, and is always visible
            regardless of poster size/state. For TV series whose only
            available date is the past `first_air_date`, the badge
            shows "RETURNING" instead of "OUT NOW" (the series has an
            episode in the window per /discover/tv, we just don't know
            the exact date). */}
        <Show when={releaseDate()}>
          <div class="upcoming-card-actions-badge">
            <CountdownBadge
              date={releaseDate()}
              fallbackLabel={isTvWithMissingEpisode() ? "RETURNING" : undefined}
            />
          </div>
        </Show>
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
