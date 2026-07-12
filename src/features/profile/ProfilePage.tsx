// src/features/profile/ProfilePage.tsx
//
// ProfilePage — "A portrait of a cinephile."
//
// Sprint 2C — Premium Profile Redesign.
// Complete UX/UI overhaul with new section architecture:
//   1. Premium Hero (35vh cinematic backdrop + floating avatar + identity)
//   2. Statistics (1 featured + 3 supporting stat cards)
//   3. Taste Identity (asymmetric layout: hero movie + series + director + genre)
//   4. Cinema DNA (viewer archetype insight card)
//   5. Achievements (horizontal chip rail)
//   6. Quick Actions (Statistics, History, Watchlist)
//   7. Settings (Appearance, Notifications, Privacy, Account)
//   8. Danger Zone (isolated, red-tinted)
//
// Zero changes to business logic, hooks, state, or Supabase integration.
// All presentation uses Premium UI Library components.

import { Show, createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import {
  PremiumPageContainer,
  PremiumSectionHeader,
  PremiumStatCard,
  PremiumButton,
  PremiumIconButton,
  PremiumEmptyState,
  PremiumLabel,
  PremiumBadge,
  PremiumAvatar,
} from "~/shared/ui/premium";
import { useProfileData } from "./useProfileData";
import { useUsernameCheck } from "./useUsernameCheck";
import { validateUsername, sanitizeUsername } from "~/shared/utils/username";
import ProfileBanner from "./components/ProfileBanner";
import BannerEditor, { type BannerType } from "./components/BannerEditor";
import TasteCard, { type FavoriteSlot } from "./components/TasteCard";
import CinemaDna from "./components/CinemaDna";
import ProfileAchievements from "./components/ProfileAchievements";
import QuickLinks from "./components/QuickLinks";
import SettingsLinks from "./components/SettingsLinks";
import DangerZone from "./components/DangerZone";
import ProfileSkeleton from "./components/ProfileSkeleton";
import FavoritesPicker from "./components/FavoritesPicker";

const ProfilePage: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();
  const { data, loading, error, saving, saveProfile, refetch, watchlist } = useProfileData();

  // Edit mode — inline editing, no modal.
  const [isEditing, setIsEditing] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editUsername, setEditUsername] = createSignal("");
  const [editBio, setEditBio] = createSignal("");
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSlot, setPickerSlot] = createSignal<FavoriteSlot | null>(null);
  const [bannerEditorOpen, setBannerEditorOpen] = createSignal(false);

  // Live username availability checker (debounced, 400ms).
  const currentUsername = createMemo(() => data()?.profile?.username ?? "");
  // eslint-disable-next-line solid/reactivity -- used in handleSave via currentUsername() read inside event handler
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

  // Save name + username + bio changes.
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

  const handleCancel = () => {
    setIsEditing(false);
  };

  // Open the favorites picker for a specific slot.
  const openPicker = (slot: FavoriteSlot) => {
    setPickerSlot(slot);
    setPickerOpen(true);
  };

  // Save banner customization.
  const handleSaveBanner = async (type: BannerType, url: string | null): Promise<boolean> => {
    const ok = await saveProfile({
      bannerType: type,
      bannerUrl: url,
    });
    if (ok) {
      showToast("Banner updated.", "success");
    } else {
      showToast("Failed to update banner.", "error");
    }
    return ok;
  };

  // Handle a favorite selection from the picker.
  const handlePickFavorite = async (slot: FavoriteSlot, id: string, _label: string) => {
    setPickerOpen(false);
    const ok = await saveProfile({
      favoriteMovieId: slot === "movie" ? id : undefined,
      favoriteSeriesId: slot === "series" ? id : undefined,
      favoriteDirectorId: slot === "director" ? id : undefined,
      favoriteGenre: slot === "genre" ? id : undefined,
    });
    if (ok) {
      showToast("Favorite updated.", "success");
    } else {
      showToast("Failed to update favorite.", "error");
    }
  };

  // Profile completion
  const isComplete = createMemo(() => {
    const p = data()?.profile;
    if (!p) return false;
    return !!(
      p.bio?.trim() &&
      p.favorite_movie_id &&
      p.favorite_series_id &&
      p.favorite_director_id &&
      p.favorite_genre
    );
  });

  // Member since — formatted from created_at.
  const memberSince = createMemo(() => {
    const created = data()?.profile?.created_at;
    if (!created) return "";
    try {
      const date = new Date(created);
      return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
      return "";
    }
  });

  // Avatar display — priority: custom > OAuth > null
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

  // Watchlist stats for the stat row
  const watchlistStats = createMemo(() => {
    const list = watchlist();
    const watching = list.filter((m) => m.status === "Watching").length;
    const completed = list.filter((m) => m.status === "Completed").length;
    const planned = list.filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    ).length;
    return { total: list.length, watching, completed, planned };
  });

  // Completion ring SVG computation
  const completionPct = createMemo(() => {
    const p = data()?.profile;
    if (!p) return 0;
    let done = 0;
    const total = 5;
    if (p.bio?.trim()) done++;
    if (p.favorite_movie_id) done++;
    if (p.favorite_series_id) done++;
    if (p.favorite_director_id) done++;
    if (p.favorite_genre) done++;
    return Math.round((done / total) * 100);
  });

  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = createMemo(() => ringCircumference - (completionPct() / 100) * ringCircumference);

  // Watchlist story text for Quick Actions
  const watchlistStory = createMemo((): string => {
    const total = watchlistStats().total;
    if (total === 0) return "Start your cinematic journey";
    if (total <= 5) return "Your collection has begun";
    if (total <= 20) return "You're building something special";
    if (total <= 50) return "A dedicated cinephile";
    if (total <= 100) return "Cinema is clearly your passion";
    return "A true cinema explorer";
  });

  // ESC to exit edit mode.
  onMount(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditing()) {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => window.removeEventListener("keydown", handleEsc));
  });

  return (
    <PremiumPageContainer size="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="profile-page profile-fade-in">
        {/* Loading state */}
        <Show when={loading()}>
          <ProfileSkeleton />
        </Show>

        {/* Guest state */}
        <Show when={!loading() && !isSignedIn()}>
          <div style={{ "padding-top": "var(--space-12)" }}>
            <PremiumEmptyState
              icon="account_circle"
              iconFill
              title="Sign in to view your profile"
              message="Your profile is your portrait as a cinephile. Sign in to make it yours."
              actionLabel="Sign In"
              onAction={() => openAuthModal()}
            />
          </div>
        </Show>

        {/* Error state */}
        <Show when={!loading() && isSignedIn() && error() && !data()}>
          <div style={{ "padding-top": "var(--space-12)" }}>
            <PremiumEmptyState
              icon="error"
              iconFill
              title="Couldn't load profile"
              message="Something went wrong loading your profile. Your data is safe — try again."
              actionLabel="Retry"
              onAction={() => refetch()}
            />
          </div>
        </Show>

        {/* ═══════════════════════════════════════════════
            LOADED STATE — NEW PREMIUM LAYOUT (Sprint 2C)
            ═══════════════════════════════════════════════ */}
        <Show when={!loading() && isSignedIn() && !error() && data()}>
          <div class="profile-content">

            {/* ═══ 1. PREMIUM HERO ═══ */}
            <section class="profile-hero" aria-label="Profile identity">
              <ProfileBanner
                data={data() ?? null}
                isEditing={isEditing()}
                onChooseBanner={() => setBannerEditorOpen(true)}
              />
              <div class="profile-hero-overlay">
                <div class="profile-hero-identity">
                  {/* Avatar with completion ring */}
                  <div class="profile-hero-avatar-wrap">
                    <Show when={!isComplete()}>
                      <svg
                        class="profile-avatar-ring"
                        width="96"
                        height="96"
                        viewBox="0 0 96 96"
                        aria-hidden="true"
                      >
                        <circle
                          cx="48" cy="48" r={ringRadius}
                          fill="none"
                          stroke="var(--tier-2)"
                          stroke-width="3"
                        />
                        <circle
                          cx="48" cy="48" r={ringRadius}
                          fill="none"
                          stroke="var(--p)"
                          stroke-width="3"
                          stroke-linecap="round"
                          stroke-dasharray={String(ringCircumference)}
                          stroke-dashoffset={String(ringDashOffset())}
                          style={{
                            transition: "stroke-dashoffset 600ms var(--ease-smooth, ease)",
                            filter: "drop-shadow(0 0 4px var(--p-glow, rgba(0,255,100,0.3)))",
                          }}
                          transform="rotate(-90 48 48)"
                        />
                      </svg>
                    </Show>
                    <PremiumAvatar
                      src={avatarUrl() ?? undefined}
                      fallback={initial()}
                      size="xl"
                      border="accent"
                    />
                  </div>

                  {/* Hero text */}
                  <div class="profile-hero-text">
                    {/* Display name */}
                    <Show
                      when={!isEditing()}
                      fallback={
                        <input
                          type="text"
                          class="profile-hero-name-input focus-ring"
                          value={editName()}
                          onInput={(e) => setEditName(e.currentTarget.value)}
                          maxlength={50}
                          aria-label="Display name"
                          placeholder="Your name"
                        />
                      }
                    >
                      <h1 class="profile-hero-name">
                        {data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile"}
                      </h1>
                    </Show>

                    {/* @username */}
                    <Show
                      when={!isEditing()}
                      fallback={
                        <div class="profile-username-edit-wrap">
                          <div class="profile-username-input-row">
                            <span class="profile-username-at">@</span>
                            <input
                              type="text"
                              class="profile-username-input focus-ring"
                              value={editUsername()}
                              onInput={(e) => setEditUsername(e.currentTarget.value)}
                              maxlength={24}
                              aria-label="Username"
                              placeholder="username"
                              autocomplete="off"
                              spellcheck={false}
                            />
                          </div>
                          <Show when={editUsername().trim().length > 0}>
                            <p
                              class="profile-username-validation"
                              data-state={usernameCheck.state()}
                              role="status"
                              aria-live="polite"
                            >
                              <Show when={usernameCheck.state() === "checking"}>
                                <span class="material-symbols-outlined profile-username-validation-icon" style={{ "font-size": "12px" }} aria-hidden="true">
                                  progress_activity
                                </span>
                              </Show>
                              <Show when={usernameCheck.state() === "available"}>
                                <span class="material-symbols-outlined profile-username-validation-icon" style={{ "font-size": "12px" }} aria-hidden="true">
                                  check_circle
                                </span>
                              </Show>
                              <Show when={usernameCheck.state() === "taken" || usernameCheck.state() === "reserved" || usernameCheck.state() === "invalid"}>
                                <span class="material-symbols-outlined profile-username-validation-icon" style={{ "font-size": "12px" }} aria-hidden="true">
                                  cancel
                                </span>
                              </Show>
                              {usernameCheck.message()}
                            </p>
                          </Show>
                        </div>
                      }
                    >
                      <p class="profile-hero-username">@{data()?.profile?.username ?? "cinephile"}</p>
                    </Show>

                    {/* Premium Badge */}
                    <div class="profile-hero-badge-row">
                      <PremiumBadge variant="glow" icon="verified" size="compact">CINEPHILE</PremiumBadge>
                    </div>

                    {/* Bio */}
                    <Show
                      when={!isEditing()}
                      fallback={
                        <textarea
                          class="profile-hero-bio-input focus-ring"
                          value={editBio()}
                          onInput={(e) => setEditBio(e.currentTarget.value)}
                          maxlength={160}
                          rows={2}
                          aria-label="Bio"
                          placeholder="Add a tagline — your taste in one line."
                        />
                      }
                    >
                      <Show
                        when={data()?.profile?.bio}
                        fallback={
                          <Show when={!isComplete()}>
                            <p class="profile-hero-bio profile-hero-bio-placeholder">
                              Tap edit to add your tagline.
                            </p>
                          </Show>
                        }
                      >
                        <p class="profile-hero-bio">{data()?.profile?.bio}</p>
                      </Show>
                    </Show>

                    {/* Member since */}
                    <Show when={memberSince()}>
                      <PremiumLabel variant="overline" size="small">
                        Member since {memberSince()}
                      </PremiumLabel>
                    </Show>
                  </div>

                  {/* Hero actions */}
                  <div class="profile-hero-actions">
                    <Show
                      when={!isEditing()}
                      fallback={
                        <>
                          <PremiumButton
                            variant="primary"
                            size="compact"
                            icon={saving() ? "progress_activity" : "check"}
                            onClick={handleSave}
                            disabled={saving()}
                            aria-label="Save profile changes"
                          >
                            {saving() ? "Saving…" : "Save"}
                          </PremiumButton>
                          <PremiumButton
                            variant="ghost"
                            size="compact"
                            onClick={handleCancel}
                            disabled={saving()}
                            aria-label="Cancel editing"
                          >
                            Cancel
                          </PremiumButton>
                        </>
                      }
                    >
                      <PremiumIconButton
                        icon="share"
                        label="Share profile"
                        variant="ghost"
                        size="compact"
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({ url: window.location.href }).catch(() => {});
                          }
                        }}
                      />
                      <PremiumIconButton
                        icon="edit"
                        label="Edit profile"
                        variant="ghost"
                        size="compact"
                        onClick={enterEdit}
                      />
                    </Show>
                  </div>
                </div>
              </div>
            </section>

            {/* ═══ 2. STATISTICS ═══ */}
            <section
              class="profile-section profile-stats-section"
              style={{ "margin-top": "var(--space-12)" }}
              aria-label="Your statistics"
            >
              <PremiumSectionHeader
                eyebrow="Library"
                title="Statistics"
                accent="bar"
                variant="compact"
              />
              <div class="profile-stats-featured">
                <PremiumStatCard
                  value={watchlistStats().total}
                  label="Titles"
                  icon="video_library"
                  variant="accent"
                  size="large"
                  class="profile-stat-featured"
                />
                <div class="profile-stats-supporting">
                  <PremiumStatCard
                    value={watchlistStats().watching}
                    label="Watching"
                    icon="play_circle"
                    size="compact"
                  />
                  <PremiumStatCard
                    value={watchlistStats().completed}
                    label="Completed"
                    icon="check_circle"
                    iconFill
                    size="compact"
                  />
                  <PremiumStatCard
                    value={watchlistStats().planned}
                    label="Planned"
                    icon="schedule"
                    size="compact"
                  />
                </div>
              </div>
            </section>

            {/* ═══ 3. TASTE IDENTITY ═══ */}
            <section
              class="profile-section"
              style={{ "margin-top": "var(--space-12)" }}
              aria-label="Your favorites"
            >
              <PremiumSectionHeader
                eyebrow="Identity"
                title="Your Taste"
                accent="bar"
                variant="compact"
                description="The films and stories that define you"
              />
              <TasteCard
                data={data() ?? null}
                isEditing={isEditing()}
                onPick={(slot) => openPicker(slot)}
              />
            </section>

            {/* ═══ 4. CINEMA DNA ═══ */}
            <CinemaDna watchlist={watchlist} />

            {/* ═══ 5. ACHIEVEMENTS ═══ */}
            <ProfileAchievements watchlist={watchlist} />

            {/* ═══ 6. QUICK ACTIONS ═══ */}
            <section
              class="profile-section"
              style={{ "margin-top": "var(--space-12)" }}
              aria-label="Quick actions"
            >
              <PremiumSectionHeader
                eyebrow="Explore"
                title="Quick Actions"
                accent="dot"
                variant="compact"
              />
              <QuickLinks watchlistStory={watchlistStory()} />
            </section>

            {/* ═══ 7. SETTINGS ═══ */}
            <section
              class="profile-section"
              style={{ "margin-top": "var(--space-12)" }}
              aria-label="Settings"
            >
              <PremiumSectionHeader
                eyebrow="Manage"
                title="Settings"
                accent="dot"
                variant="compact"
              />
              <SettingsLinks />
            </section>

            {/* ═══ 8. DANGER ZONE ═══ */}
            <DangerZone onSignOut={async () => {
              const { signOut: authSignOut } = await import("~/shared/hooks/useAuthActions");
              await authSignOut();
            }} />

          </div>
        </Show>
      </div>

      {/* Favorites picker modal — preserved exactly */}
      <FavoritesPicker
        open={pickerOpen()}
        slot={pickerSlot()}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickFavorite}
      />

      {/* Banner editor modal — preserved exactly */}
      <BannerEditor
        open={bannerEditorOpen()}
        currentBannerType={(data()?.profile?.banner_type as BannerType) ?? "favorite_movie"}
        currentBannerUrl={data()?.profile?.banner_url ?? null}
        data={data() ?? null}
        userId={user()?.uid ?? ""}
        onClose={() => setBannerEditorOpen(false)}
        onSave={handleSaveBanner}
      />
    </PremiumPageContainer>
  );
};

export default ProfilePage;
