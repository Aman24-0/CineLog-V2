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
//       - Share icon    → always (own profile)
//     Both sit immediately to the right of the display name so the
//     header stays compact.
//   • Bio (truncated to 2 lines, expandable)
//   • Developer badge (if applicable)
//
// The component is purely presentational — all data + handlers come
// from props. The parent (ProfilePage) wires up the edit modal and
// share-link copy.

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { GlassAvatar, GlassIconButton } from "~/shared/ui/glass";
import type { ProfileRow } from "~/lib/supabase/repositories";
import type { User } from "~/shared/types";

export interface ProfileHeaderProps {
  /** The user's profile row (display_name, username, bio, avatar_url, created_at). */
  profile: Accessor<ProfileRow | null>;
  /** The auth user (for OAuth avatar fallback + initial). */
  user: Accessor<User | null>;
  /** Whether this is the viewer's own profile (controls Edit button). */
  isOwnProfile: Accessor<boolean>;
  /** Open the Edit Profile modal. */
  onEdit: () => void;
  /** Copy the profile share link to clipboard. */
  onShare: () => void;
}

const ProfileHeader: Component<ProfileHeaderProps> = (props) => {
  const displayName = createMemo(
    () =>
      props.profile()?.display_name ?? props.user()?.displayName ?? "Cinephile"
  );
  const username = createMemo(() => props.profile()?.username ?? "");
  // Avatar priority: profile.avatar_url → OAuth (Google) photoURL → initials.
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
        {/* Avatar — 80px circle */}
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
            {/* Edit pencil — only on the viewer's own profile. */}
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
            {/* Share — share profile link. */}
            <GlassIconButton
              icon="share"
              variant="ghost"
              size="compact"
              label="Share profile"
              onClick={() => props.onShare()}
              aria-label="Share profile"
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
    </div>
  );
};

export default ProfileHeader;
