// src/shared/ui/social/UserListItem.tsx
//
// UserListItem — a single row in the followers / following list.
//
// Renders: avatar (clickable → /u/<username>), display name + @username
// (clickable → /u/<username>), and a FollowButton on the right (only
// when the viewer is signed in AND this isn't their own row).
//
// The component is purely presentational — the parent (FollowListPage)
// owns the data + pagination. The FollowButton wraps useFollow so the
// follow state is always fresh.

import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

import { GlassAvatar, GlassButton } from "~/shared/ui/glass";
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
  const targetId = createMemo(() => props.user.id);
  // eslint-disable-next-line solid/reactivity
  const { following, pending, follow, unfollow } = useFollow(targetId);

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
        <GlassButton
          variant={following() ? "ghost" : "primary"}
          size="compact"
          icon={following() ? "person_remove" : "person_add"}
          loading={pending()}
          disabled={pending()}
          onClick={handleClick}
          aria-label={
            following()
              ? `Unfollow ${displayName()}`
              : `Follow ${displayName()}`
          }
        >
          {following() ? "Following" : "Follow"}
        </GlassButton>
      </Show>
    </article>
  );
};

export default UserListItem;
