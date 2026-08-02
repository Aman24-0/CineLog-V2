// src/shared/ui/social/FeedItem.tsx
//
// FeedItem — a single row in the social activity feed.
//
// Renders:
//   • Avatar (clickable → /u/<username>)
//   • Actor display name (clickable → /u/<username>)
//   • Action verb ("watched", "rated", "added to watchlist", …)
//   • Title with poster thumbnail (clickable → /movie/<id> or /tv/<id>)
//   • Relative timestamp ("3h ago")
//
// The component is purely presentational — all data comes from the
// `activity` prop (typed FeedActivity from /api/feed). The parent
// FeedPage wires up:
//   • onProfileClick(userId, username) — usually navigate(`/u/${username}`)
//   • onTitleClick(mediaType, tmdbId) — usually navigate(`/${mediaType}/${tmdbId}`)
//
// DESIGN
//   The layout matches the existing profile ActivityFeed item shape
//   (40×60 poster + 2-line text block) so the social feed feels native
//   to the rest of the app. The avatar adds the social context — the
//   profile's own ActivityFeed doesn't need an avatar because every
//   row is "you did X".

import { Show, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

import { GlassAvatar } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRelativeTime } from "~/shared/utils/date";
import type { FeedActivity } from "~/routes/api/feed";

export interface FeedItemProps {
  activity: FeedActivity;
}

/**
 * Map an activity_log action enum to a human-readable verb phrase.
 * Returns null for actions we don't surface (the API already filters
 * these out, but the helper is defensive).
 *
 * @example actionToVerb("vault_created")      → "added to watchlist"
 * @example actionToVerb("vault_rated")        → "rated"
 * @example actionToVerb("vault_favorited")    → "favorited"
 * @example actionToVerb("episode_progress_updated") → "watched an episode of"
 */
function actionToVerb(action: string): string | null {
  switch (action) {
    case "vault_created":
      return "added to watchlist";
    case "vault_updated":
      return "updated";
    case "vault_restored":
      return "restored to watchlist";
    case "vault_status_changed":
      return "updated status of";
    case "vault_rated":
      return "rated";
    case "vault_favorited":
      return "favorited";
    case "vault_unfavorited":
      return "unfavorited";
    case "collection_created":
      return "created a collection";
    case "collection_updated":
      return "updated a collection";
    case "episode_progress_updated":
      return "watched an episode of";
    default:
      return null;
  }
}

/**
 * Should this action render a title chip? Actions like
 * "collection_created" don't have a movie/tv entity attached, so we
 * hide the title block.
 */
function actionHasTitle(activity: FeedActivity): boolean {
  return (
    (activity.entityType === "movie" || activity.entityType === "tv") &&
    activity.title !== null
  );
}

const FeedItem: Component<FeedItemProps> = (props) => {
  const navigate = useNavigate();

  // Resolve the actor's display label — prefer display_name, fall back
  // to @username, fall back to "Someone" if the profile was deleted.
  const actorLabel = () => {
    const a = props.activity;
    if (a.displayName) return a.displayName;
    if (a.username) return `@${a.username}`;
    return "Someone";
  };

  const verb = () => actionToVerb(props.activity.action);

  const handleProfileClick = () => {
    const username = props.activity.username;
    if (username) {
      navigate(`/u/${encodeURIComponent(username)}`);
    }
  };

  const handleTitleClick = () => {
    const title = props.activity.title;
    if (!title) return;
    navigate(`/${title.mediaType}/${title.tmdbId}`);
  };

  // Don't render at all if the action isn't in our feed-worthy set.
  // The API filters these, but a future action type might slip through.
  // We wrap the early-return inside a <Show> instead of using a bare
  // `if (verb() === null) return null;` because SolidJS components run
  // once — a bare return would break reactivity if `activity` ever
  // changed (it doesn't today, but defensive coding is cheap).
  return (
    <Show when={verb() !== null} fallback={null}>
      <article class="feed-item" role="article">
      {/* Avatar — clickable to the actor's public profile. */}
      <button
        type="button"
        class="feed-item-avatar-btn focus-ring"
        onClick={handleProfileClick}
        aria-label={`View ${actorLabel()}'s profile`}
        disabled={!props.activity.username}
      >
        <GlassAvatar
          src={props.activity.avatarUrl ?? undefined}
          name={actorLabel()}
          size="md"
          class="feed-item-avatar"
        />
      </button>

      {/* Body — actor + verb + (optional) title chip + timestamp. */}
      <div class="feed-item-body">
        <div class="feed-item-line">
          <button
            type="button"
            class="feed-item-actor focus-ring"
            onClick={handleProfileClick}
            disabled={!props.activity.username}
          >
            {actorLabel()}
          </button>
          <span class="feed-item-verb">{verb()}</span>
          <Show when={actionHasTitle(props.activity)}>
            <button
              type="button"
              class="feed-item-title-btn focus-ring"
              onClick={handleTitleClick}
              aria-label={`Open ${props.activity.title?.title ?? "title"}`}
            >
              <Show
                when={props.activity.title?.posterPath}
                fallback={
                  <span
                    class="feed-item-title-poster-fallback"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      movie
                    </span>
                  </span>
                }
              >
                <img
                  src={tmdbImage(props.activity.title?.posterPath, "w92") ?? ""}
                  class="feed-item-title-poster"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </Show>
              <span class="feed-item-title-text">
                {props.activity.title?.title ?? "Untitled"}
                <Show when={props.activity.title?.releaseYear}>
                  <span class="feed-item-title-year">
                    {" "}
                    ({props.activity.title?.releaseYear})
                  </span>
                </Show>
              </span>
            </button>
          </Show>
        </div>

        {/* Metadata line — relative timestamp + optional rating. */}
        <div class="feed-item-meta">
          <Show when={props.activity.createdAt}>
            {(ts) => (
              <time
                datetime={new Date(ts()).toISOString()}
                class="feed-item-time"
              >
                {formatRelativeTime(ts()) ?? "just now"}
              </time>
            )}
          </Show>
          {/* Rating chip — surfaced for vault_rated actions where the
              metadata payload carries the rating value. */}
          <Show when={props.activity.action === "vault_rated"}>
            <RatingChip metadata={props.activity.metadata} />
          </Show>
        </div>
      </div>
    </article>
    </Show>
  );
};

/**
 * Small inline rating chip rendered for "rated" actions. Reads the
 * rating value from the activity's metadata payload (the activity_log
 * row stores the new rating in metadata.rating).
 */
const RatingChip: Component<{ metadata: Record<string, unknown> | null }> = (
  props
) => {
  const rating = () => {
    const m = props.metadata;
    if (!m) return null;
    const r = m.rating;
    if (typeof r === "number" && r > 0) return r;
    if (typeof r === "string") {
      const n = parseFloat(r);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  return (
    <Show when={rating() !== null}>
      <span class="feed-item-rating-chip" aria-label={`Rated ${rating()}`}>
        <span class="material-symbols-outlined" aria-hidden="true">
          star
        </span>
        {rating()}
      </span>
    </Show>
  );
};

export default FeedItem;
