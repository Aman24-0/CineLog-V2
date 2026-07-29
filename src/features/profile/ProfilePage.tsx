// src/features/profile/ProfilePage.tsx
//
// ProfilePage V3 — modern social dashboard layout.
//
// Structure (per spec):
//   +-- Banner          (existing ProfileBanner component)
//   +-- Header          (ProfileHeader — avatar, name, bio, social stats, actions)
//   +-- Stats Row       (ProfileStatsRow — 5 GlassCards: titles, movies, series, hours, avg rating)
//   +-- Tabs            (ProfileTabs — Activity / Favorites / Lists / Achievements)
//   |   +-- Tab Content (ActivityFeed / FavoritesGrid / UserListsPreview / AchievementsPreview)
//   +-- Quick Action Row (QuickActionRow — Stats / Upcoming / Settings / Trash)
//
// State management:
//   • activeTab — owned by useProfileTabs hook (persisted in localStorage)
//   • editModalOpen — local signal
//   • profile data — from useProfileData (existing hook)
//   • stats — from useStats (existing hook, derived from watchlist)
//   • social stats — from useSocialStats (new hook, fetches follows table)
//
// Existing sub-pages (Achievements, Upcoming, Stats, Settings, Trash) are
// NOT touched — they're navigated to via QuickActionRow and the
// AchievementsPreview "View all" button.

import {
  Component,
  createSignal,
  createEffect,
  createMemo,
  Show,
  onMount,
} from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useToast } from "~/shared/hooks/useToast";
import { getClient } from "~/lib/supabase/client";

import { PageContainer } from "~/shared/ui/layout";
import { GlassButton, GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";

import { useProfileData } from "./useProfileData";
import { useStats } from "./useStats";
import { useSocialStats } from "./hooks/useSocialStats";
import { useProfileTabs } from "./hooks/useProfileTabs";

// Sub-components (new V3 layout)
import ProfileBanner from "./components/ProfileBanner";
import ProfileHeader from "./components/ProfileHeader";
import ProfileStatsRow from "./components/ProfileStatsRow";
import ProfileTabs from "./components/ProfileTabs";
import ActivityFeed from "./components/ActivityFeed";
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

  const uid = () => user()?.uid;
  const oauthAvatarUrl = () => user()?.photoURL ?? null;

  const { data, loading, error, refetch, watchlist } = useProfileData();
  const { stats } = useStats();
  const { activeTab, setActiveTab } = useProfileTabs();
  const socialStats = useSocialStats(uid);

  const [editModalOpen, setEditModalOpen] = createSignal(false);

  onMount(() => {
    if (isSignedIn() && uid()) refetch();
  });

  createEffect(() => {
    if (uid()) refetch();
  });

  // Share profile link — copies {origin}/u/{username} to clipboard.
  // Origin resolution: prefer VITE_APP_URL (set in production Vercel env);
  // otherwise fall back to the current window.location.origin so the link
  // always points at whichever deployment the user is actually viewing
  // (preview branches, localhost, etc.). The previous hard-coded
  // https://cinelog.app/ produced dead links.
  const handleShare = async () => {
    const username = data()?.profile?.username;
    if (!username) {
      showToast("Set a username before sharing your profile.", "info");
      return;
    }
    const baseUrl =
      (import.meta.env.VITE_APP_URL as string | undefined) ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const url = `${baseUrl}/u/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Profile link copied to clipboard.", "success", 1800);
    } catch {
      // Clipboard API can fail in non-secure contexts — fall back to a toast
      // with the URL so the user can copy it manually.
      showToast(`Share link: ${url}`, "info", 4000);
    }
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

  // Open the title detail modal — minimal implementation that delegates
  // to the global openTitle function (used by Discover / Watchlist).
  // For now we just navigate to the title's route as a graceful fallback.
  const handleItemClick = (item: WatchlistItem) => {
    const path = item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
    if (typeof window !== "undefined") {
      window.location.href = path;
    }
  };

  return (
    <PageContainer>
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
          <div class="profile-error" role="alert">
            <GlassEmptyState
              icon="cloud_off"
              title="Something went wrong"
              message="We couldn't load your profile. Tap to retry."
            >
              <GlassButton
                variant="ghost"
                size="default"
                onClick={() => refetch()}
                aria-label="Retry"
              >
                Retry
              </GlassButton>
            </GlassEmptyState>
          </div>
        </Show>

        {/* Loading state */}
        <Show when={loading() && isSignedIn()}>
          <div class="profile-skeleton-v3">
            <GlassSkeleton class="profile-skeleton-v3-banner h-44 w-full rounded-xl" />
            <div class="profile-skeleton-v3-header">
              <GlassSkeleton class="w-20 h-20 rounded-full" />
              <div class="profile-skeleton-v3-header-text">
                <GlassSkeleton class="h-5 w-48 rounded" />
                <GlassSkeleton class="h-3 w-32 rounded mt-2" />
                <GlassSkeleton class="h-3 w-40 rounded mt-1" />
              </div>
            </div>
            <div class="profile-skeleton-v3-stats">
              <For5 />
            </div>
          </div>
        </Show>

        {/* ── SIGNED IN — FULL PROFILE (V3 LAYOUT) ── */}
        <Show when={!loading() && isSignedIn() && data()}>
          <div class="profile-content-v3">
            {/* 1. Banner — reuses the existing ProfileBanner component.
                 The pencil icon at bottom-right opens the EditProfileModal
                 (which embeds BannerEditor as a sub-modal). */}
            <section class="profile-v3-banner-section" aria-label="Profile banner">
              <ProfileBanner
                data={data()}
                isEditing={false}
                onChooseBanner={() => setEditModalOpen(true)}
              />
            </section>

            {/* 2. Header — avatar, name, @username, member since, bio,
                   action row (Edit Profile / Share), social stats. */}
            <ProfileHeader
              profile={() => data()?.profile ?? null}
              user={user}
              isOwnProfile={() => true}
              followers={() => socialStats.stats().followers}
              following={() => socialStats.stats().following}
              onEdit={() => setEditModalOpen(true)}
              onShare={handleShare}
            />

            {/* 3. Stats row — 5 GlassCards: titles, movies, series, hours, avg rating. */}
            <ProfileStatsRow stats={stats} />

            {/* 4. Tabs + content */}
            <ProfileTabs activeTab={activeTab()} onTabChange={setActiveTab} />

            <div class="profile-v3-tab-content">
              <Show when={activeTab() === "activity"}>
                <ActivityFeed watchlist={watchlist} onItemClick={handleItemClick} />
              </Show>
              <Show when={activeTab() === "favorites"}>
                <FavoritesGrid watchlist={watchlist} onItemClick={handleItemClick} />
              </Show>
              <Show when={activeTab() === "lists"}>
                <UserListsPreview />
              </Show>
              <Show when={activeTab() === "achievements"}>
                <AchievementsPreview watchlist={watchlist} />
              </Show>
            </div>

            {/* 5. Quick action row — Stats / Upcoming / Settings / Trash */}
            <QuickActionRow />

            {/* 6. Sign out — quiet, full-width, below the quick actions.
                   Carries a red danger accent so users can spot the
                   destructive action at a glance (V3.1 fix). */}
            <button
              type="button"
              class="profile-v3-sign-out profile-v3-sign-out-danger focus-ring"
              onClick={handleSignOut}
            >
              <span class="material-symbols-outlined" aria-hidden="true">logout</span>
              Sign Out
            </button>
          </div>
        </Show>
      </div>

      {/* Edit Profile modal — embeds the BannerEditor as a sub-modal
          for banner customization. The top-level bannerEditorOpen
          signal is retained for future direct-mount use but currently
          the editor is always reached via the Edit Profile modal. */}
      <EditProfileModal
        open={editModalOpen()}
        onClose={() => setEditModalOpen(false)}
        profile={data()?.profile ?? null}
        userId={uid() ?? ""}
        oauthAvatarUrl={oauthAvatarUrl()}
        onSaved={() => refetch()}
      />
    </PageContainer>
  );
};

// Tiny inline helper to render 5 skeleton stat cards without
// polluting the imports — kept here because it's only used in the
// loading state above.
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
