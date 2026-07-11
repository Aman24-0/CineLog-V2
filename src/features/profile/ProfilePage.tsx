// src/features/profile/ProfilePage.tsx
//
// ProfilePage — "A portrait of a cinephile."
//
// This is NOT a dashboard. It answers one question: "Who is this user?"
//
// Structure (top to bottom):
//   1. Dynamic Cinematic Banner (backdrop + avatar + identity + edit)
//   2. Taste Card (4 tiles: movie, series, director, genre)
//   3. Profile Completion (elegant checklist — hides when complete)
//   4. Watchlist Summary (one sentence, tappable)
//   5. Quick Links (Statistics, History, Achievements, Settings)
//
// Everything else (activity feed, stat grids, achievements grid, settings
// rows, streaks, badges) has been moved to other pages. The Profile is
// calm, premium, and intentional.
//
// Inline edit:
//   Tap "Edit" → the profile becomes the editor. Name → input, tagline →
//   textarea, tiles get "Swap" overlays, banner gets "Change" button.
//   Save/Cancel replace the Edit button. No modal — feels like editing
//   a Notion page.

import { Show, createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import PageContainer from "~/shared/ui/PageContainer";
import { Button } from "~/shared/ui/primitives";
import { useProfileData } from "./useProfileData";
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
  const [editBio, setEditBio] = createSignal("");
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSlot, setPickerSlot] = createSignal<FavoriteSlot | null>(null);
  const [bannerEditorOpen, setBannerEditorOpen] = createSignal(false);

  // Enter edit mode — copy current values to the edit signals.
  const enterEdit = () => {
    const p = data()?.profile;
    setEditName(p?.display_name ?? user()?.displayName ?? "");
    setEditBio(p?.bio ?? "");
    setIsEditing(true);
  };

  // Save name + bio changes.
  const handleSave = async () => {
    const name = editName().trim();
    if (!name) {
      showToast("Display name cannot be empty.", "error");
      return;
    }
    const ok = await saveProfile({
      displayName: name,
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

  // Avatar display.
  const avatarUrl = createMemo(() => user()?.photoURL ?? data()?.profile?.avatar_url ?? null);
  const initial = createMemo(() => {
    const name = data()?.profile?.display_name ?? user()?.displayName ?? user()?.email ?? "";
    return name.charAt(0).toUpperCase() || "?";
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
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="profile-page profile-fade-in">
        {/* Loading state — shows while auth is resolving OR data is fetching.
            This MUST be the first condition so a blank page never appears. */}
        <Show when={loading()}>
          <ProfileSkeleton />
        </Show>

        {/* Guest state — shows when auth is ready AND user is NOT signed in.
            This is a TOP-LEVEL Show (not nested inside data()) so it renders
            even when data() is null (which it always is for guests). */}
        <Show when={!loading() && !isSignedIn()}>
          <div class="profile-section" style={{ "padding-top": "var(--sp-12)" }}>
            <div class="empty-premium" role="status" aria-live="polite">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                  account_circle
                </span>
              </div>
              <h3 class="empty-premium-title">Sign in to view your profile</h3>
              <p class="empty-premium-body">Your profile is your portrait as a cinephile. Sign in to make it yours.</p>
              <Button variant="primary" onClick={() => openAuthModal()} style={{ "margin-top": "var(--sp-2)" }}>
                Sign In
              </Button>
            </div>
          </div>
        </Show>

        {/* Error state — shows when the profile fetch failed AND user IS signed in. */}
        <Show when={!loading() && isSignedIn() && error() && !data()}>
          <div class="profile-section" style={{ "padding-top": "var(--sp-12)" }}>
            <div class="empty-premium" role="alert" aria-live="assertive">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                  error
                </span>
              </div>
              <h3 class="empty-premium-title">Couldn't load profile</h3>
              <p class="empty-premium-body">Something went wrong loading your profile. Your data is safe — try again.</p>
              <Button
                variant="primary"
                onClick={() => refetch()}
                style={{ "margin-top": "var(--sp-2)" }}
                aria-label="Retry loading profile"
              >
                Retry
              </Button>
            </div>
          </div>
        </Show>

        {/* Loaded state — shows when auth is ready, user IS signed in,
            no error, and data is available. */}
        <Show when={!loading() && isSignedIn() && !error() && data()}>
            <div class="profile-content">
              {/* === 1. BANNER + IDENTITY === */}
              <ProfileBanner
                data={data() ?? null}
                isEditing={isEditing()}
                onChooseBanner={() => setBannerEditorOpen(true)}
              />

              <div class="profile-identity">
                {/* Avatar */}
                <div class="profile-avatar-wrap">
                  <Show
                    when={avatarUrl()}
                    fallback={
                      <div class="profile-avatar-fallback" aria-hidden="true">
                        {initial()}
                      </div>
                    }
                  >
                    <img
                      src={avatarUrl()!}
                      class="profile-avatar"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div class="profile-avatar-fallback" style={{ display: "none" }} aria-hidden="true">
                      {initial()}
                    </div>
                  </Show>
                </div>

                {/* Name row + Edit/Save/Cancel */}
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

                  {/* Edit / Save / Cancel buttons */}
                  <div class="profile-edit-actions">
                    <Show
                      when={!isEditing()}
                      fallback={
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={saving() ? "progress_activity" : "check"}
                            onClick={handleSave}
                            disabled={saving()}
                            aria-label="Save profile changes"
                          >
                            {saving() ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            disabled={saving()}
                            aria-label="Cancel editing"
                          >
                            Cancel
                          </Button>
                        </>
                      }
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        onClick={enterEdit}
                        aria-label="Edit profile"
                      >
                        Edit
                      </Button>
                    </Show>
                  </div>
                </div>

                {/* Username */}
                <p class="profile-username">
                  @{data()?.profile?.username ?? "cinephile"}
                </p>

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
                        <p class="profile-tagline" style={{ color: "var(--text-dim)", "font-style": "italic" }}>
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
                  <p class="profile-member-since">Member since {memberSince()}</p>
                </Show>
              </div>

              {/* === 2. TASTE CARD === */}
              <section class="profile-section" aria-label="Your favorites">
                <p class="profile-section-eyebrow">Your Taste</p>
                <TasteCard
                  data={data() ?? null}
                  isEditing={isEditing()}
                  onPick={(slot) => openPicker(slot)}
                />
              </section>

              {/* === 3. PROFILE COMPLETION === */}
              <Show when={!isComplete()}>
                <section class="profile-section" aria-label="Complete your profile">
                  <ProfileCompletion
                    data={data() ?? null}
                    onPick={handleCompletionPick}
                  />
                </section>
              </Show>

              {/* === 4. WATCHLIST SUMMARY === */}
              <section class="profile-section" aria-label="Watchlist summary">
                <WatchlistSummary watchlist={watchlist} />
              </section>

              {/* === 5. QUICK LINKS === */}
              <section class="profile-section" aria-label="Quick links">
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
    </PageContainer>
  );
};

export default ProfilePage;
