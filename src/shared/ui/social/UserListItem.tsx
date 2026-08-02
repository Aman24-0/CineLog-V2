// src/shared/ui/social/UserListItem.tsx
//
// UserListItem — a single row in the followers / following list.
//
// Renders: avatar (clickable → /u/<username>), display name + @username
// (clickable → /u/<username>), and a FollowButton on the right (only
// when the viewer is signed in AND this isn't their own row).
//
// OPTIMIZATION: The API endpoints (/api/follow/list, /api/users/search)
// already enrich each user with `isFollowing` so the caller doesn't
// need to fire N separate GET /api/follow/status calls. We pass that
// value as `initialFollowing` to useFollow so the first render is
// correct immediately and the hook only needs to handle mutations
// (follow/unfollow clicks).

import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

import { GlassAvatar } from "~/shared/ui/glass";
import { useAuth } from "~/shared/hooks/useAuth";
import { useFollow } from "~/shared/hooks/social/useFollow";
import type { APIUser } from "~/shared/hooks/social/useFollowList";

export interface UserListItemProps {
  user: APIUser;
}

const UserListItem: Component<UserListItemProps> = (props) => {
  const navigate = useNavigate();
  const { user: viewerUser } = useAuth();

  // The viewer can't follow themselves — hide the FollowButton on
  // their own row.
  const isOwnRow = createMemo(
    () => !!viewerUser() && viewerUser()!.uid === props.user.id
  );

  // useFollow is reactive to the target user id — when this component
  // re-renders for a different user (SolidJS reuses components in <For>
  // lists), the hook re-fetches the follow status.
  // IMPORTANT: We pass `initialFollowing` from the API response so the
  // hook skips the redundant GET /api/follow/status round-trip. The
  // API already tells us whether the viewer follows this user.
  const targetId = createMemo(() => props.user.id);
  const initialFollowing = createMemo(() => props.user.isFollowing);
  // eslint-disable-next-line solid/reactivity
  const { following, pending, follow, unfollow } = useFollow(targetId, {
    initialFollowing
  });

  const displayName = () => props.user.displayName ?? props.user.username ?? "Cinephile";
  const username = () => props.user.username;

  const handleNavigate = () => {
    const uname = username();
    if (uname) {
      navigate(`/u/${encodeURIComponent(uname)}`);
    }
  };

  const handleClick = () => {
    if (following()) {
      void unfollow();
    } else {
      void follow();
    }
  };

  return (
    <article class="user-list-item">
      {/* Avatar — clickable to the user's public profile. */}
      <button
        type="button"
        class="user-list-item-avatar-btn focus-ring"
        onClick={handleNavigate}
        aria-label={`View ${displayName()}'s profile`}
        disabled={!username()}
      >
        <GlassAvatar
          src={props.user.avatarUrl ?? undefined}
          name={displayName()}
          size="md"
          class="user-list-item-avatar"
        />
      </button>

      {/* Name + @username — clickable to the profile. */}
      <button
        type="button"
        class="user-list-item-text focus-ring"
        onClick={handleNavigate}
        disabled={!username()}
      >
        <span class="user-list-item-name">{displayName()}</span>
        <Show when={username()}>
          <span class="user-list-item-username">@{username()}</span>
        </Show>
      </button>

      {/* Follow / Following button — only when the viewer is signed
          in AND this isn't their own row. */}
      <Show when={!isOwnRow()}>
        <button
          type="button"
          class={`user-list-item-follow-btn focus-ring ${
            following() ? "following" : "not-following"
          }`}
          onClick={handleClick}
          disabled={pending()}
          aria-label={
            following()
              ? `Unfollow ${displayName()}`
              : `Follow ${displayName()}`
          }
        >
          <Show when={pending()}>
            <span class="material-symbols-outlined feed-spin" aria-hidden="true" style={{ "font-size": "16px" }}>
              progress_activity
            </span>
          </Show>
          <Show when={!pending()}>
            <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
              {following() ? "person_remove" : "person_add"}
            </span>
          </Show>
          {following() ? "Following" : "Follow"}
        </button>
      </Show>
    </article>
  );
};

export default UserListItem;
