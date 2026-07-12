// src/features/profile/ProfilePage.tsx
//
// ProfilePage — "A portrait of a cinephile."
//
// This is NOT a dashboard. It answers one question: "Who is this user?"
//
// Sprint 2B — Migrated to Premium UI Library.
// All presentation now uses Premium components from src/shared/ui/premium/.
// Zero changes to business logic, hooks, state, or Supabase integration.
//
// Structure (top to bottom):
//   1. Premium Hero Area (backdrop + avatar + identity + edit)
//   2. Statistics Row (PremiumStatCard)
//   3. Taste Card (4 tiles: movie, series, director, genre)
//   4. Profile Completion (elegant checklist — hides when complete)
//   5. Watchlist Summary (one sentence, tappable)
//   6. Quick Links (Navigation rows via PremiumListItem)
//
// Visual rhythm: Hero → Stats → Surface → Cards → Compact rows → Danger
// Alternating density creates breathing room between sections.

import { Show, createSignal, createMemo, createEffect, onMount, onCleanup, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import {
  PremiumPageContainer,
  PremiumSectionHeader,
  PremiumStatCard,
  PremiumButton,
  PremiumEmptyState,
  PremiumLabel,
} from "~/shared/ui/premium";
import { useProfileData } from "./useProfileData";
import { useUsernameCheck } from "./useUsernameCheck";
import { validateUsername, sanitizeUsername } from "~/shared/utils/username";
import ProfileBanner from "./components/ProfileBanner";
import BannerEditor, { type BannerType } from "./components/BannerEditor";
import TasteCard, { type FavoriteSlot } from "./components/TasteCard";
import ProfileCompletion from "./components/ProfileCompletion";
import WatchlistSummary from "./components/WatchlistSummary";
import QuickLinks from "./components/QuickLinks";
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

  // Avatar load state — the .profile-avatar CSS starts at opacity:0 and
  // only becomes visible when the .img-loaded class is added. Without
  // this signal + onLoad handler, the avatar image stays invisible
  // forever (the bug that caused "avatar not showing").
  const [avatarLoaded, setAvatarLoaded] = createSignal(false);

  // Live username availability checker (debounced, 400ms).
  const currentUsername = createMemo(() => data()?.profile?.username ?? "");
  const uid = createMemo(() => user()?.uid ?? null);
  const usernameCheck = useUsernameCheck(editUsername, currentUsername, uid);

  // Enter edit mode — copy current values to the edit signals.
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

  // Profile completion — hide when all items are done.
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

  // Handle the completion checklist tapping.
  const handleCompletionPick = (slot: FavoriteSlot | "bio") => {
    if (slot === "bio") {
      enterEdit();
    } else {
      openPicker(slot);
    }
  };

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

  // Avatar display — priority order per spec:
  //   1. Custom avatar (Firestore profile.avatar_url) — user-uploaded
  //   2. Firebase Auth photoURL (Google OAuth avatar) — from useAuth().user
  //   3. Generated initials avatar (fallback)
  const avatarUrl = createMemo(() => {
    const custom = data()?.profile?.avatar_url;
    if (custom) return custom;
    const photoURL = user()?.photoURL;
    if (photoURL) return photoURL;
    return null;
  });

  // Reset the avatar load state whenever the URL changes
  createEffect(() => {
    void avatarUrl();
    setAvatarLoaded(false);
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
        {/* Loading state — Premium skeleton */}
        <Show when={loading()}>
          <ProfileSkeleton />
        </Show>

        {/* Guest state — Premium empty */}
        <Show when={!loading() && !isSignedIn()}>
          <div style={{ "padding-top": "var(--sp-12)" }}>
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

        {/* Error state — Premium empty with alert */}
        <Show when={!loading() && isSignedIn() && error() && !data()}>
          <div style={{ "padding-top": "var(--sp-12)" }}>
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

        {/* Loaded state — Premium UI */}
        <Show when={!loading() && isSignedIn() && !error() && data()}>
          <div class="profile-content">

            {/* ═══ 1. HERO + IDENTITY ═══ */}
            <ProfileBanner
              data={data() ?? null}
              isEditing={isEditing()}
              onChooseBanner={() => setBannerEditorOpen(true)}
            />

            {/* Identity block — overlaid on banner bottom */}
            <div class="profile-identity">
              {/* Avatar row: PremiumAvatar + name/edit */}
              <div class="profile-avatar-row">
                <div class="profile-avatar-wrap-premium">
                  <Show
                    when={avatarUrl()}
                    fallback={
                      <div
                        class="profile-avatar-initials"
                        aria-hidden="true"
                      >
                        {initial()}
                      </div>
                    }
                  >
                    <img
                      src={avatarUrl()!}
                      class={`profile-avatar-img${avatarLoaded() ? " img-loaded" : ""}`}
                      alt=""
                      aria-hidden="true"
                      loading="eager"
                      decoding="async"
                      onLoad={() => setAvatarLoaded(true)}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div class="profile-avatar-initials" style={{ display: "none" }} aria-hidden="true">
                      {initial()}
                    </div>
                  </Show>
                </div>
              </div>

              {/* Name + edit controls */}
              <div class="profile-name-row">
                <div style={{ flex: "1", "min-width": "0" }}>
                  <Show
                    when={!isEditing()}
                    fallback={
                      <input
                        type="text"
                        class="profile-display-name-input focus-ring"
                        value={editName()}
                        onInput={(e) => setEditName(e.currentTarget.value)}
                        maxlength={50}
                        aria-label="Display name"
                        placeholder="Your name"
                      />
                    }
                  >
                    <h1 class="profile-display-name">
                      {data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile"}
                    </h1>
                  </Show>
                </div>

                {/* Edit / Save / Cancel */}
                <div class="profile-edit-actions">
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
                    <PremiumButton
                      variant="ghost"
                      size="compact"
                      icon="edit"
                      onClick={enterEdit}
                      aria-label="Edit profile"
                    >
                      Edit
                    </PremiumButton>
                  </Show>
                </div>
              </div>

              {/* Username — editable with live validation */}
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
                <p class="profile-username">
                  @{data()?.profile?.username ?? "cinephile"}
                </p>
              </Show>

              {/* Tagline / Bio */}
              <Show
                when={!isEditing()}
                fallback={
                  <textarea
                    class="profile-tagline-input focus-ring"
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
                      <p class="profile-tagline profile-tagline-placeholder">
                        Tap edit to add your tagline.
                      </p>
                    </Show>
                  }
                >
                  <p class="profile-tagline">{data()?.profile?.bio}</p>
                </Show>
              </Show>

              {/* Member since */}
              <Show when={memberSince()}>
                <PremiumLabel variant="overline" size="small">
                  Member since {memberSince()}
                </PremiumLabel>
              </Show>
            </div>

            {/* ═══ 2. STATISTICS ROW ═══ */}
            <section class="profile-section" aria-label="Your statistics">
              <PremiumSectionHeader
                eyebrow="Library"
                title="Statistics"
                accent="bar"
                variant="compact"
              />
              <div class="profile-stats-row">
                <PremiumStatCard
                  value={watchlistStats().total}
                  label="Total"
                  icon="video_library"
                  variant="accent"
                  size="compact"
                />
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
            </section>

            {/* ═══ 3. TASTE CARD ═══ */}
            <section class="profile-section" aria-label="Your favorites">
              <PremiumSectionHeader
                eyebrow="Identity"
                title="Your Taste"
                accent="bar"
                variant="compact"
              />
              <TasteCard
                data={data() ?? null}
                isEditing={isEditing()}
                onPick={(slot) => openPicker(slot)}
              />
            </section>

            {/* ═══ 4. PROFILE COMPLETION ═══ */}
            <Show when={!isComplete()}>
              <section class="profile-section" aria-label="Complete your profile">
                <ProfileCompletion
                  data={data() ?? null}
                  onPick={handleCompletionPick}
                />
              </section>
            </Show>

            {/* ═══ 5. WATCHLIST SUMMARY ═══ */}
            <section class="profile-section" aria-label="Watchlist summary">
              <WatchlistSummary watchlist={watchlist} />
            </section>

            {/* ═══ 6. QUICK LINKS ═══ */}
            <section class="profile-section" aria-label="Quick links">
              <PremiumSectionHeader
                eyebrow="Explore"
                title="Quick Links"
                accent="dot"
                variant="compact"
              />
              <QuickLinks />
            </section>
          </div>
        </Show>
      </div>

      {/* Favorites picker modal */}
      <FavoritesPicker
        open={pickerOpen()}
        slot={pickerSlot()}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickFavorite}
      />

      {/* Banner editor modal */}
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
