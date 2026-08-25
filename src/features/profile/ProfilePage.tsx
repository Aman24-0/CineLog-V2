// src/features/profile/ProfilePage.tsx
//
// ProfilePage V3 — personal dashboard layout.
//
// CineLog is now a premium PERSONAL Movie / TV / Anime tracker.
// All social features (feed, followers, following, public profile,
// activity feed for social purposes) have been removed.
//
// Structure:
//   +-- Banner          (ProfileBanner component)
//   +-- Header          (ProfileHeader — avatar, name, bio, actions)
//   +-- Watching Stats  (clickable header + compact expandable summary)
//   +-- Recent Activity  (latest watchlist activity rail)
//   +-- Favorites        (horizontal poster rail)
//   +-- Lists            (horizontal collection rail)
//   +-- Achievements     (horizontal badge rail)
//   +-- Quick Action Row (QuickActionRow — Upcoming / Settings / Trash)
//
// State management:
//   • editModalOpen — local signal
//   • profile data — from useProfileData (existing hook)

import { Component, createSignal, createEffect, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import { getClient } from "~/lib/supabase/client";

import { PageContainer } from "~/shared/ui";
import { GlassButton, GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState, RefreshingIndicator } from "~/shared/ui/states";

import { useProfileData } from "./useProfileData";

// Sub-components
import ProfileBanner from "./components/ProfileBanner";
import ProfileHeader from "./components/ProfileHeader";
import StatsHeader from "./components/StatsHeader";
import ExpandableStatsCard from "./components/ExpandableStatsCard";
import RecentActivitySection from "./components/RecentActivitySection";
import FavoritesGrid from "./components/FavoritesGrid";
import UserListsPreview from "./components/UserListsPreview";
import AchievementsPreview from "./components/AchievementsPreview";
import QuickActionRow from "./components/QuickActionRow";
import EditProfileModal from "./components/EditProfileModal";

import type { WatchlistItem } from "~/shared/types";

const ProfilePage: Component = () => {
  const { user, isSignedIn } = useAuth();
  const isGuest = () => !isSignedIn();
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const uid = () => user()?.uid;
  const oauthAvatarUrl = () => user()?.photoURL ?? null;

  const { data, loading, refreshing, error, refetch, watchlist } =
    useProfileData();
  const [editModalOpen, setEditModalOpen] = createSignal(false);
  const handleProfileSaved = () => refetch();

  onMount(() => {
    if (isSignedIn() && uid()) refetch();
  });

  createEffect(() => {
    if (uid()) refetch();
  });

  // Share profile link — copy the profile URL to clipboard.
  const handleShare = async () => {
    const username = data()?.profile?.username;
    const name =
      data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile";
    try {
      const origin =
        (typeof import.meta !== "undefined" &&
          typeof (import.meta as { env?: { VITE_APP_URL?: string } }).env !==
            "undefined" &&
          (import.meta as { env?: { VITE_APP_URL?: string } }).env
            ?.VITE_APP_URL) ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const url = username ? `${origin}/profile` : `${origin}/profile`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${name} — CineLog`, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Profile link copied!", "success");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      showToast("Could not share profile link.", "error");
    }
  };

  const handleSignOut = async () => {
    try {
      await getClient().auth.signOut();
      showToast("Signed out successfully", "success");
    } catch (err: unknown) {
      console.error("Sign out error:", err);
      const msg = err instanceof Error ? err.message : "Failed to sign out";
      showToast(msg, "error");
    }
  };

  // Navigate to the title's detail page via client-side routing.
  const handleItemClick = (item: WatchlistItem) => {
    const path =
      item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
    navigate(path);
  };

  return (
    <PageContainer paddingTop="0" class="profile-page-region">
      <div class="profile-layout profile-layout-v3">
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

        {/* Error state */}
        <Show when={!loading() && isSignedIn() && (!!error() || !data())}>
          <div class="profile-error">
            <ErrorState
              icon="cloud_off"
              title="Something went wrong"
              message="We couldn't load your profile. Tap to retry."
              variant="page"
              onRetry={() => refetch()}
            />
          </div>
        </Show>

        {/* Loading state */}
        <Show when={loading() && isSignedIn()}>
          <div
            class="profile-skeleton-v3"
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading profile"
          >
            <GlassSkeleton class="profile-skeleton-v3-banner h-44 w-full rounded-xl" />
            <div class="profile-skeleton-v3-header">
              <GlassSkeleton class="h-20 w-20 rounded-full" />
              <div class="profile-skeleton-v3-header-text">
                <GlassSkeleton class="h-5 w-48 rounded" />
                <GlassSkeleton class="mt-2 h-3 w-32 rounded" />
                <GlassSkeleton class="mt-1 h-3 w-40 rounded" />
              </div>
            </div>
            <div class="profile-skeleton-v3-stats">
              <For5 />
            </div>
          </div>
        </Show>

        {/* ── SIGNED IN — FULL PROFILE (V3 LAYOUT) ── */}
        <Show when={!loading() && isSignedIn() && data()}>
          {/* Refreshing indicator — subtle bar at top while data is being refreshed */}
          <Show when={refreshing()}>
            <RefreshingIndicator placement="top" message="Updating profile…" />
          </Show>
          <div class="profile-content-v3">
            {/* 1. Banner */}
            <section
              class="profile-v3-banner-section"
              aria-label="Profile banner"
            >
              <ProfileBanner
                data={data()}
                isEditing={false}
                onChooseBanner={() => setEditModalOpen(true)}
              >
                {/* Identity and actions live inside the same filled banner as
                    the image, so the profile no longer exposes a detached
                    header gap between the hero and stats. */}
                <ProfileHeader
                  profile={() => data()?.profile ?? null}
                  user={user}
                  isOwnProfile={() => true}
                  onEdit={() => setEditModalOpen(true)}
                  onShare={handleShare}
                />
              </ProfileBanner>
            </section>

            {/* 2. Watching stats — compact, expandable, and linked to details. */}
            <section class="profile-watching-stats" aria-label="Watching stats">
              <StatsHeader />
              <ExpandableStatsCard titles={watchlist} />
            </section>

            {/* 3. Recent Activity — newest watchlist activity first. */}
            <div class="profile-rails-stack">
              <RecentActivitySection watchlist={watchlist} />

              {/* 4. Favorites — horizontal poster rail. */}
              <FavoritesGrid
                watchlist={watchlist}
                onItemClick={handleItemClick}
              />

              {/* 5. Lists — horizontal collection rail. */}
              <UserListsPreview />

              {/* 6. Achievements — horizontal badge rail. */}
              <AchievementsPreview watchlist={watchlist} />
            </div>

            {/* 7. Quick action row — Upcoming / Settings / Trash */}
            <QuickActionRow />

            {/* 8. Sign out */}
            <button
              type="button"
              class="profile-v3-sign-out profile-v3-sign-out-danger focus-ring"
              onClick={handleSignOut}
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
              Sign Out
            </button>
          </div>
        </Show>
      </div>

      {/* Edit Profile modal */}
      <EditProfileModal
        open={editModalOpen()}
        onClose={() => setEditModalOpen(false)}
        profile={data()?.profile ?? null}
        data={data()}
        userId={uid() ?? ""}
        oauthAvatarUrl={oauthAvatarUrl()}
        onSaved={handleProfileSaved}
      />
    </PageContainer>
  );
};

// Tiny inline helper to render 5 skeleton stat cards.
function For5() {
  return (
    <>
      <GlassSkeleton class="h-24 flex-1 rounded-xl" />
      <GlassSkeleton class="h-24 flex-1 rounded-xl" />
      <GlassSkeleton class="h-24 flex-1 rounded-xl" />
      <GlassSkeleton class="h-24 flex-1 rounded-xl" />
      <GlassSkeleton class="h-24 flex-1 rounded-xl" />
    </>
  );
}

export default ProfilePage;
