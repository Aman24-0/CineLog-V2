// src/features/profile/components/ProfileHeader.tsx
//
// ProfileHeader — the identity block that sits BELOW the banner.
//
// Renders:
//   • Avatar (80px circle) — Google OAuth avatar OR profile.avatar_url
//     OR initials fallback. Editable via the edit modal.
//   • Display name (bold) + @username + "Member since [Month Year]"
//   • Name row also holds inline icon buttons (compact, icon-only):
//       - Edit pencil  → only on the viewer's own profile
//       - Share icon    → always (own + public profile visitors)
//     Both sit immediately to the right of the display name so the
//     header stays compact (V3.2 cleanup — moved out of the action
//     row that used to live below the bio).
//   • Bio (truncated to 2 lines, expandable)
//   • Action row (other users only, when follow handlers are wired):
//       Follow / Unfollow
//   • Social stats: followers / following (clickable in future)
//
// The component is purely presentational — all data + handlers come
// from props. The parent (ProfilePage) wires up the edit modal,
// share-link copy, and follow actions.

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { GlassAvatar, GlassButton, GlassIconButton } from "~/shared/ui/glass";
import type { ProfileRow } from "~/lib/supabase/repositories";
import type { User } from "~/shared/types";

export interface ProfileHeaderProps {
  /** The user's profile row (display_name, username, bio, avatar_url, created_at, is_public). */
  profile: Accessor<ProfileRow | null>;
  /** The auth user (for OAuth avatar fallback + initial). */
  user: Accessor<User | null>;
  /** Whether this is the viewer's own profile (controls Edit vs Follow button). */
  isOwnProfile: Accessor<boolean>;
  /** Social stats — followers / following counts. */
  followers: Accessor<number>;
  following: Accessor<number>;
  /** Open the Edit Profile modal. */
  onEdit: () => void;
  /** Copy the profile share link to clipboard. */
  onShare: () => void;
  /** Follow this user (only used when !isOwnProfile). */
  onFollow?: () => void;
  /** Unfollow this user (only used when !isOwnProfile). */
  onUnfollow?: () => void;
  /** Whether the current viewer is following this user. */
  isFollowing?: Accessor<boolean>;
  /** True while a follow/unfollow request is in flight (disables the button + shows spinner). */
  followPending?: Accessor<boolean>;
  /** Navigate to the followers list (clickable count). Optional. */
  onShowFollowers?: () => void;
  /** Navigate to the following list (clickable count). Optional. */
  onShowFollowing?: () => void;
}

const ProfileHeader: Component<ProfileHeaderProps> = (props) => {
  const displayName = createMemo(
    () =>
      props.profile()?.display_name ?? props.user()?.displayName ?? "Cinephile"
  );
  const username = createMemo(() => props.profile()?.username ?? "");
  // Avatar priority: profile.avatar_url → OAuth (Google) photoURL → initials.
  // The Google picture is sourced from `user.user_metadata.avatar_url` by
  // useAuth (mapped to `photoURL`). This ensures Google-OAuth users see
  // their profile picture even before they've manually set avatar_url.
  const avatarUrl = createMemo(
    () => props.profile()?.avatar_url ?? props.user()?.photoURL ?? null
  );
  const bio = createMemo(() => props.profile()?.bio ?? "");

  const memberSince = createMemo(() => {
    const joined = props.profile()?.created_at;
    if (!joined) return null;
    try {
      return new Date(joined).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
      });
    } catch {
      return null;
    }
  });

  return (
    <div class="profile-header-v3">
      <div class="profile-header-v3-row">
        {/* Avatar — 80px circle (xl size in GlassAvatar = 96px; we override
            via inline style + class to land at 80px to match the spec). */}
        <div class="profile-header-v3-avatar-wrap">
          <GlassAvatar
            src={avatarUrl() ?? undefined}
            name={displayName()}
            size="xl"
            class="profile-header-v3-avatar"
          />
        </div>

        {/* Identity text */}
        <div class="profile-header-v3-text">
          <div class="profile-header-v3-name-row">
            <h1 class="profile-header-v3-name">{displayName()}</h1>
            {/* Edit pencil — only on the viewer's own profile. Opens
                the EditProfileModal (avatar / banner / bio / social
                links / privacy). Icon-only to keep the name row
                compact; the aria-label carries the affordance. */}
            <Show when={props.isOwnProfile()}>
              <GlassIconButton
                icon="edit"
                variant="ghost"
                size="compact"
                label="Edit profile"
                onClick={() => props.onEdit()}
                aria-label="Edit profile"
              />
            </Show>
            {/* Share — rendered for BOTH own and public profiles so
                visitors can re-share. Sits immediately next to the
                edit pencil (when present) so the two profile actions
                are grouped visually. Icon-only; aria-label differs
                for own vs other to give screen-reader users context. */}
            <GlassIconButton
              icon="share"
              variant="ghost"
              size="compact"
              label="Share profile"
              onClick={() => props.onShare()}
              aria-label={
                props.isOwnProfile()
                  ? "Share profile"
                  : `Share ${displayName()}'s profile`
              }
            />
          </div>
          <Show when={username()}>
            <p class="profile-header-v3-username">@{username()}</p>
          </Show>
          <Show when={memberSince()}>
            <p class="profile-header-v3-member-since">
              Member since {memberSince()}
            </p>
          </Show>
          <Show when={bio()}>
            <p class="profile-header-v3-bio">{bio()}</p>
          </Show>
        </div>
      </div>

      {/* Action row — only rendered for OTHER users' profiles AND only
          when follow handlers are wired (otherwise the buttons would be
          no-ops). The viewer's own profile renders NO action row —
          both Edit and Share live as icon buttons in the name row
          above (V3.2 cleanup — keeps the header compact). */}
      <Show
        when={!props.isOwnProfile() && (props.onFollow || props.onUnfollow)}
      >
        <div class="profile-header-v3-actions">
          <Show
            when={props.isFollowing?.() ?? false}
            fallback={
              <GlassButton
                variant="primary"
                size="compact"
                icon="person_add"
                onClick={() => props.onFollow?.()}
                loading={props.followPending?.() ?? false}
                disabled={props.followPending?.() ?? false}
                aria-label={`Follow ${displayName()}`}
              >
                Follow
              </GlassButton>
            }
          >
            <GlassButton
              variant="ghost"
              size="compact"
              icon="person_remove"
              onClick={() => props.onUnfollow?.()}
              loading={props.followPending?.() ?? false}
              disabled={props.followPending?.() ?? false}
              aria-label={`Unfollow ${displayName()}`}
            >
              Following
            </GlassButton>
          </Show>
        </div>
      </Show>

      {/* Social stats — each count is a button that opens the
          corresponding list (followers / following). The buttons are
          disabled when the handler isn't wired (e.g. on the viewer's
          own profile where we don't yet navigate to a list — though
          we still do, since the viewer can browse their own social
          graph too). */}
      <div class="profile-header-v3-social">
        <button
          type="button"
          class="profile-header-v3-social-stat focus-ring"
          aria-label={`${props.following()} following`}
          onClick={() => props.onShowFollowing?.()}
          disabled={!props.onShowFollowing}
        >
          <span class="profile-header-v3-social-num">{props.following()}</span>
          <span class="profile-header-v3-social-label">Following</span>
        </button>
        <span class="profile-header-v3-social-divider" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          class="profile-header-v3-social-stat focus-ring"
          aria-label={`${props.followers()} followers`}
          onClick={() => props.onShowFollowers?.()}
          disabled={!props.onShowFollowers}
        >
          <span class="profile-header-v3-social-num">{props.followers()}</span>
          <span class="profile-header-v3-social-label">Followers</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileHeader;
