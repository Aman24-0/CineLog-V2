// src/features/profile/ProfilePage.tsx
//
// Refactored in Phase 2 to use Glass Component System.
// Layout and logic remains identical.
import {
  Component,
  createSignal,
  createEffect,
  Show,
  onMount,
  createMemo,
} from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import { getClient } from "~/lib/supabase/client";

// Glass components
import {
  PageContainer,
} from "~/shared/ui/layout";
import { GlassButton, GlassIconButton, GlassEmptyState } from "~/shared/ui/glass";
import { GlassAvatar } from "~/shared/ui/glass";
import { setDiscoverRegion } from "~/core/config/discoverRegion";
import { useProfileData } from "./useProfileData";
import { useUsernameCheck } from "./useUsernameCheck";

// Sub-components
import ProfileBanner from "./components/ProfileBanner";
import StatsGrid from "./components/StatsGrid";
import FavoritesCarousel from "./components/FavoritesCarousel";
import AchievementBadges from "./components/AchievementBadges";
import ProfileNavigation from "./components/ProfileNavigation";
import BannerEditor from "./components/BannerEditor";

import type { WatchlistItem, BannerType } from "~/shared/types";

const ProfilePage: Component = () => {
  const { user, isSignedIn } = useAuth();
  const isGuest = () => !isSignedIn();
  const initial = () => user()?.displayName?.charAt(0) ?? "U";
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();

  const uid = () => user()?.id;

  const { data, loading, error, refetch, saveProfile } = useProfileData();
  const usernameCheck = useUsernameCheck();

  const [isEditing, setIsEditing] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editUsername, setEditUsername] = createSignal("");
  const [editBio, setEditBio] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const [bannerEditorOpen, setBannerEditorOpen] = createSignal(false);

  const currentUsername = createMemo(() => data()?.profile?.username ?? "");
  const avatarUrl = createMemo(() => data()?.profile?.avatar_url ?? null);
  const stats = createMemo(() => data()?.stats);
  const watchlist = createMemo(() => data()?.watchlist ?? []);
  const memberSince = createMemo(() => {
    const joined = data()?.profile?.created_at;
    if (!joined) return null;
    return new Date(joined).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  });

  onMount(() => {
    if (isSignedIn() && uid()) refetch();
  });

  // Keep refetching in sync if user changes
  createEffect(() => {
    if (uid()) refetch();
  });

  const enterEdit = () => {
    if (!data()?.profile) return;
    setEditName(data()!.profile!.display_name ?? user()?.displayName ?? "");
    setEditUsername(data()!.profile!.username ?? "");
    setEditBio(data()!.profile!.bio ?? "");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    usernameCheck.reset();
  };

  createEffect(() => {
    if (isEditing()) usernameCheck.check(editUsername());
  });

  const handleSave = async () => {
    if (!uid()) return;
    const isChangingUsername = editUsername() !== currentUsername();
    if (isChangingUsername && usernameCheck.state() === "taken") {
      showToast("Username is already taken.", "error");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await getClient()
        .from("profiles")
        .update({
          display_name: editName().trim() || null,
          username: editUsername().trim() || null,
          bio: editBio().trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid()!);

      if (updateError) throw updateError;
      showToast("Profile saved successfully.", "success");
      setIsEditing(false);
      refetch();
    } catch (err: any) {
      console.error("Save profile error:", err);
      showToast(err.message || "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBanner = (type: BannerType, url: string | null) => {
    refetch();
    setBannerEditorOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await getClient().auth.signOut();
      showToast("Signed out successfully", "success");
    } catch (err: any) {
      console.error("Sign out error:", err);
      showToast(err.message || "Failed to sign out", "error");
    }
  };

  return (
    <PageContainer>
      <div class="profile-layout profile-layout-v2">

        {/* Guest state */}
        <Show when={isGuest()}>
          <div class="profile-guest">
            <GlassEmptyState
              icon="account_circle"
              title="Your Cinematic Identity"
              message="Sign in to save movies, customize your profile, and showcase your taste — all waiting."
            >
              <GlassButton
                variant="primary"
                size="default"
                onClick={() => openAuthModal()}
                aria-label="Sign in"
              >
                Sign In
              </GlassButton>
            </GlassEmptyState>
          </div>
        </Show>

        {/* Error state — also shown when signed in but data is null with no explicit error
            (e.g. Supabase timeout, empty profile response). Covers the blank-page gap case
            where none of the other Show conditions would match. */}
        <Show when={!loading() && isSignedIn() && (!!error() || !data())}>
          <div class="profile-error" role="alert">
            <GlassEmptyState
              icon="cloud_off"
              title="Something went wrong"
              message="We couldn't load your profile. Tap to retry."
            >
              <GlassButton variant="ghost" size="default" onClick={() => refetch()} aria-label="Retry">
                Retry
              </GlassButton>
            </GlassEmptyState>
          </div>
        </Show>

        {/* ── SIGNED IN — FULL PROFILE ── */}
        <Show when={!loading() && isSignedIn() && data()}>
          <div class="profile-content">

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 1: PROFILE — Backdrop + Avatar + Name + Meta + Bio
                NEW LAYOUT:
                  • Backdrop is at the top, fully visible (no text overlay)
                  • Avatar sits BELOW the backdrop (overlapping slightly)
                  • Name is BESIDE the avatar (right of it)
                  • Below name: @username · member since
                  • Below that (under the avatar/name row): bio
                  • Edit button is on the backdrop (top-right) and also
                    available as a small pencil icon next to the name
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section class="profile-hero profile-hero-v2" aria-label="Profile identity">
              {/* Backdrop — fully visible, no text on it */}
              <ProfileBanner
                data={data()}
                isEditing={isEditing()}
                onChooseBanner={() => setBannerEditorOpen(true)}
              />

              {/* Identity block — BELOW the backdrop */}
              <div class="profile-identity-block">
                <div class="profile-identity-row">
                  {/* Avatar — large, sits below backdrop */}
                  <div class="profile-avatar-wrap profile-avatar-wrap-v2">
                    <GlassAvatar
                      src={avatarUrl() ?? undefined}
                      fallback={initial()}
                      size="xl"
                    />
                    <Show when={isEditing()}>
                      <button
                        type="button"
                        class="profile-avatar-edit focus-ring"
                        onClick={() => {
                          showToast("Avatar upload coming soon.", "info");
                        }}
                        aria-label="Change avatar"
                      >
                        <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">photo_camera</span>
                      </button>
                    </Show>
                  </div>

                  {/* Name + meta — BESIDE the avatar */}
                  <div class="profile-identity-text">
                    <Show
                      when={!isEditing()}
                      fallback={
                        <div class="profile-hero-edit-fields">
                          <input
                            type="text"
                            class="profile-edit-name-input focus-ring"
                            value={editName()}
                            onInput={(e) => setEditName(e.currentTarget.value)}
                            placeholder="Display name"
                            aria-label="Display name"
                            maxlength={50}
                          />
                          <input
                            type="text"
                            class="profile-edit-username-input focus-ring"
                            value={editUsername()}
                            onInput={(e) => setEditUsername(e.currentTarget.value)}
                            placeholder="Username"
                            aria-label="Username"
                            maxlength={30}
                          />
                          <Show when={usernameCheck.state() === "taken"}>
                            <p class="profile-username-taken" aria-live="polite">Username taken</p>
                          </Show>
                          <Show when={usernameCheck.state() === "available" && editUsername() !== currentUsername()}>
                            <p class="profile-username-available" aria-live="polite">Available</p>
                          </Show>
                          <textarea
                            class="profile-edit-bio-input focus-ring"
                            value={editBio()}
                            onInput={(e) => setEditBio(e.currentTarget.value)}
                            placeholder="Write something about yourself..."
                            aria-label="Bio"
                            maxlength={160}
                            rows={2}
                          />
                          <div class="profile-edit-actions">
                            <GlassButton variant="ghost" size="compact" onClick={handleCancel} aria-label="Cancel editing">
                              Cancel
                            </GlassButton>
                            <GlassButton
                              variant="primary"
                              size="compact"
                              onClick={handleSave}
                              disabled={saving()}
                              aria-label="Save profile"
                            >
                              {saving() ? "Saving..." : "Save"}
                            </GlassButton>
                          </div>
                        </div>
                      }
                    >
                      <div class="profile-name-row">
                        <h1 class="profile-hero-name">
                          {data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile"}
                        </h1>
                        <GlassIconButton
                          icon="edit"
                          variant="ghost"
                          size="compact"
                          label="Edit profile"
                          onClick={enterEdit}
                          aria-label="Edit profile"
                        />
                      </div>
                      {/* @username */}
                      <Show when={currentUsername()}>
                        <p class="profile-hero-meta">
                          <span class="profile-hero-username">@{currentUsername()}</span>
                        </p>
                      </Show>
                      {/* member since — directly below username */}
                      <Show when={memberSince()}>
                        <p class="profile-hero-member-since">Member since {memberSince()}</p>
                      </Show>
                    </Show>
                  </div>
                </div>

                {/* Bio — BELOW the avatar/name row, in the blank space */}
                <Show when={!isEditing() && data()?.profile?.bio?.trim()}>
                  <p class="profile-hero-bio profile-hero-bio-v2">{data()?.profile?.bio}</p>
                </Show>
              </div>
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 2: STATS — Three glassmorphism boxes
                Total titles · Total movies · Total series in watchlist.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <StatsGrid stats={stats} />

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 3: FAVOURITES — "Your Top Favourite"
                Continuous horizontal carousel of watchlist titles.
                Replaces the old Taste mosaic + Your Story card.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <FavoritesCarousel watchlist={watchlist} />

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 4: ACHIEVEMENTS — Circular badges in horizontal scroll
                Cinephile, Top 50 Watcher, etc. Milestones only — no XP.
                Replaces Currently Watching + Recently Finished + Recent Activity.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <AchievementBadges watchlist={watchlist} />

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 5: SETTINGS — Action row + Sign Out
                Statistics · Upcoming · Settings (3 quick actions)
                Sign Out (full width, quiet)
                No Delete Account.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <ProfileNavigation onSignOut={handleSignOut} />

          </div>
        </Show>
      </div>

      <Show when={bannerEditorOpen()}>
        <BannerEditor
          open={bannerEditorOpen()}
          data={data()}
          currentBannerType={data()?.profile?.banner_type as BannerType ?? "favorite_movie"}
          currentBannerUrl={data()?.profile?.banner_url ?? null}
          userId={uid() ?? ""}
          onClose={() => setBannerEditorOpen(false)}
          onSave={handleSaveBanner}
        />
      </Show>
    </PageContainer>
  );
};

export default ProfilePage;
