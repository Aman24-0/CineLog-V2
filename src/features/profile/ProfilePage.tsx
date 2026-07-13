// src/features/profile/ProfilePage.tsx
//
// ProfilePage — CineLog V2 Profile (v2.0 streamlined design)
//
// Five-section architecture (simplified from v1.0):
//
//   1. PROFILE    — Backdrop + Avatar + Name + Username + Member-since + Bio
//                   Avatar and name sit SIDE-BY-SIDE, BELOW the backdrop
//                   (so the backdrop image is no longer obstructed).
//                   Bio + meta live in the blank space under the backdrop.
//
//   2. STATS      — Three glassmorphism boxes:
//                     • Total titles in watchlist
//                     • Total movies in watchlist
//                     • Total series in watchlist
//
//   3. FAVOURITES — "Your Top Favourite" — continuous horizontal carousel
//                   of watchlist items (movies + series). Replaces the
//                   old Taste mosaic + Your Story reflection.
//
//   4. ACHIEVEMENTS — Circular milestone badges in a horizontal scroll.
//                     Cinephile, Top 50 Watcher, Completionist, etc.
//                     Replaces Currently Watching + Recently Finished +
//                     Recent Activity.
//
//   5. SETTINGS   — Action row (Statistics · Upcoming · Settings)
//                   + Sign Out button.
//                   History removed (replaced by Upcoming page).
//                   Watchlist removed (it's in the bottom nav).
//                   Delete Account removed (per user request).
//
// Design principles:
//   • Identity > Stats > Favourites > Achievements > Utility
//   • Every section earns its place or hides
//   • Glassmorphism on stats boxes; circles on badges; rail on favourites
//   • Green accent at: stats values, unlocked badges, favourites ratings
//   • Backdrop is fully visible (no overlay text on it)
//   • Premium, minimal, timeless
//
// Zero changes to business logic, hooks, state, or Supabase integration.

import { Show, createSignal, createMemo, onMount, onCleanup, createEffect, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import {
  PremiumPageContainer,
  PremiumButton,
  PremiumIconButton,
  PremiumEmptyState,
  PremiumAvatar,
} from "~/shared/ui/premium";
import { setDiscoverRegion } from "~/core/config/discoverRegion";
import { useProfileData } from "./useProfileData";
import { useUsernameCheck } from "./useUsernameCheck";
import { useStats } from "./useStats";
import { validateUsername, sanitizeUsername } from "~/shared/utils/username";
import ProfileBanner from "./components/ProfileBanner";
import BannerEditor, { type BannerType } from "./components/BannerEditor";
import ProfileSkeleton from "./components/ProfileSkeleton";
import StatsGrid from "./components/StatsGrid";
import FavoritesCarousel from "./components/FavoritesCarousel";
import AchievementBadges from "./components/AchievementBadges";
import ProfileNavigation from "./components/ProfileNavigation";

// ── Component ──────────────────────────────────────────────────────────

const ProfilePage: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();
  const { data, loading, error, saving, saveProfile, refetch, watchlist } = useProfileData();
  const { stats } = useStats();

  // Edit mode
  const [isEditing, setIsEditing] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editUsername, setEditUsername] = createSignal("");
  const [editBio, setEditBio] = createSignal("");
  const [bannerEditorOpen, setBannerEditorOpen] = createSignal(false);

  // Live username availability checker
  const currentUsername = createMemo(() => data()?.profile?.username ?? "");
  const uid = createMemo(() => user()?.uid ?? null);
  const usernameCheck = useUsernameCheck(editUsername, currentUsername, uid);

  // Enter edit mode
  const enterEdit = () => {
    const p = data()?.profile;
    setEditName(p?.display_name ?? user()?.displayName ?? "");
    setEditUsername(p?.username ?? "");
    setEditBio(p?.bio ?? "");
    setIsEditing(true);
  };

  // Save profile changes
  const handleSave = async () => {
    const name = editName().trim();
    if (!name) {
      showToast("Display name cannot be empty.", "error");
      return;
    }
    const cleanUsername = sanitizeUsername(editUsername());
    const oldUsername = currentUsername();
    const usernameChanged = cleanUsername !== sanitizeUsername(oldUsername);
    if (usernameChanged) {
      const validation = validateUsername(cleanUsername);
      if (!validation.valid) {
        showToast(validation.message, "error");
        return;
      }
      if (usernameCheck.state() !== "available") {
        showToast("Username is not available. Try another.", "error");
        return;
      }
    }
    const ok = await saveProfile({
      displayName: name,
      username: usernameChanged ? cleanUsername : undefined,
      bio: editBio().trim() || null,
    });
    if (ok) {
      showToast("Profile saved.", "success");
      setIsEditing(false);
    } else {
      showToast("Failed to save profile.", "error");
    }
  };

  const handleCancel = () => { setIsEditing(false); };

  const handleSaveBanner = async (type: BannerType, url: string | null): Promise<boolean> => {
    const ok = await saveProfile({ bannerType: type, bannerUrl: url });
    if (ok) { showToast("Banner updated.", "success"); }
    else { showToast("Failed to update banner.", "error"); }
    return ok;
  };

  // ── Derived data ────────────────────────────────────────────────────

  // Sync the user's saved country (from the profile row) into the
  // global discoverRegion module so Discover / Upcoming pages pick
  // up the right region on mount.
  createEffect(() => {
    const c = data()?.profile?.country;
    if (c) setDiscoverRegion(c);
  });

  const memberSince = createMemo(() => {
    const created = data()?.profile?.created_at;
    if (!created) return "";
    try { return new Date(created).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
    catch { return ""; }
  });

  const avatarUrl = createMemo(() => {
    const custom = data()?.profile?.avatar_url;
    if (custom) return custom;
    const photoURL = user()?.photoURL;
    if (photoURL) return photoURL;
    return null;
  });

  const initial = createMemo(() => {
    const name = data()?.profile?.display_name ?? user()?.displayName ?? user()?.email ?? "";
    return name.charAt(0).toUpperCase() || "?";
  });

  // Sign out handler
  const handleSignOut = async () => {
    const { signOut } = await import("~/lib/supabase/auth");
    await signOut();
    showToast("Signed out.", "success");
  };

  // ESC to exit edit mode
  onMount(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && isEditing()) handleCancel(); };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => window.removeEventListener("keydown", handleEsc));
  });

  return (
    <PremiumPageContainer size="narrow" paddingTop="0" paddingBottom="var(--space-12)">
      <div class="profile-page profile-fade-in">
        <Show when={loading()}><ProfileSkeleton /></Show>

        {/* Guest state */}
        <Show when={!loading() && !isSignedIn()}>
          <div class="profile-guest" role="status">
            <PremiumEmptyState
              icon="person_add"
              title="Sign in to your cinema"
              message="Your profile, your vault, your taste — all waiting."
            >
              <PremiumButton
                variant="primary"
                size="default"
                onClick={() => openAuthModal()}
                aria-label="Sign in"
              >
                Sign In
              </PremiumButton>
            </PremiumEmptyState>
          </div>
        </Show>

        {/* Error state */}
        <Show when={!loading() && isSignedIn() && error() && !data()}>
          <div class="profile-error" role="alert">
            <PremiumEmptyState
              icon="cloud_off"
              title="Something went wrong"
              message="We couldn't load your profile. Tap to retry."
            >
              <PremiumButton variant="ghost" size="default" onClick={() => refetch()} aria-label="Retry">
                Retry
              </PremiumButton>
            </PremiumEmptyState>
          </div>
        </Show>

        {/* ── SIGNED IN — FULL PROFILE ── */}
        <Show when={!loading() && isSignedIn() && !error() && data()}>
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
                    <PremiumAvatar
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
                            <PremiumButton variant="ghost" size="compact" onClick={handleCancel} aria-label="Cancel editing">
                              Cancel
                            </PremiumButton>
                            <PremiumButton
                              variant="primary"
                              size="compact"
                              onClick={handleSave}
                              disabled={saving()}
                              aria-label="Save profile"
                            >
                              {saving() ? "Saving..." : "Save"}
                            </PremiumButton>
                          </div>
                        </div>
                      }
                    >
                      <div class="profile-name-row">
                        <h1 class="profile-hero-name">
                          {data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile"}
                        </h1>
                        <PremiumIconButton
                          icon="edit"
                          variant="ghost"
                          size="compact"
                          label="Edit profile"
                          onClick={enterEdit}
                          aria-label="Edit profile"
                        />
                      </div>
                      {/* @username · member since */}
                      <Show when={currentUsername() || memberSince()}>
                        <p class="profile-hero-meta">
                          <Show when={currentUsername()}>
                            <span class="profile-hero-username">@{currentUsername()}</span>
                          </Show>
                          <Show when={currentUsername() && memberSince()}>
                            <span class="profile-hero-meta-sep" aria-hidden="true"> · </span>
                          </Show>
                          <Show when={memberSince()}>
                            <span>Member since {memberSince()}</span>
                          </Show>
                        </p>
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
    </PremiumPageContainer>
  );
};

export default ProfilePage;
