// src/routes/u/[username].tsx
//
// Public profile route — /u/{username}
//
// Renders another user's PUBLIC profile. The viewer may be logged in
// OR anonymous (logged-out share-link recipients). Privacy is enforced
// at the database layer via SECURITY DEFINER functions:
//
//   • get_public_profile_by_username(text) — returns the profile row
//     only when is_public = true AND deleted_at IS NULL.
//   • get_public_vault_by_user(uuid) — returns the user's non-deleted
//     vault rows when their profile is public.
//
// Both functions are callable by `anon` AND `authenticated` so the
// route works for both audiences. The hook NEVER reads private data —
// if the function returns no rows, we render the appropriate empty state.
//
// STATES
// ------
//   • loading     → skeleton matching the V3 layout shape
//   • not_found   → "User not found" empty state
//   • private     → "This profile is private" lock screen (banner +
//                   minimal header still render so the viewer sees who
//                   they tried to visit)
//   • ready       → full public profile: banner, header (no edit
//                   controls), stats, tabs (Activity / Favorites /
//                   Lists / Achievements). No QuickActionRow, no
//                   Sign-Out, no EditProfileModal — those are
//                   viewer-only surfaces.

import { Title } from "@solidjs/meta";
import { useParams, useNavigate } from "@solidjs/router";
import { ErrorBoundary, Show, createMemo, For, type Component } from "solid-js";

import { PageContainer } from "~/shared/ui/layout";
import { GlassButton, GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import { useAuth } from "~/shared/hooks/useAuth";
import { tmdbImage } from "~/core/tmdb/tmdb";
import FollowButton from "~/shared/ui/social/FollowButton";

import ProfileBanner from "~/features/profile/components/ProfileBanner";
import ProfileHeader from "~/features/profile/components/ProfileHeader";
import ProfileStatsRow from "~/features/profile/components/ProfileStatsRow";
import ProfileTabs from "~/features/profile/components/ProfileTabs";
import ActivityFeed from "~/features/profile/components/ActivityFeed";
import AchievementsPreview from "~/features/profile/components/AchievementsPreview";
import { useProfileTabs } from "~/features/profile/hooks/useProfileTabs";
import { usePublicProfile } from "~/features/profile/hooks/usePublicProfile";
import { useSocialStats } from "~/features/profile/hooks/useSocialStats";
import { useFollow } from "~/shared/hooks/social/useFollow";
import { shareProfileLink } from "~/features/profile/utils/share";
import type { StatsData } from "~/features/profile/useStats";
import type { ProfileData } from "~/features/profile/useProfileData";
import type { User, WatchlistItem } from "~/shared/types";
import type { ProfileRow } from "~/lib/supabase/repositories";

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

const PublicProfileRoute: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const username = createMemo(() => params.username ?? "");
  const { showToast } = useToast();
  const { user: viewerUser } = useAuth();

  // ESLint: username is an Accessor passed by reference to usePublicProfile,
  // which tracks it inside its own createResource / createEffect. The lint
  // rule can't see through the hook boundary.
  // eslint-disable-next-line solid/reactivity
  const publicProfile = usePublicProfile(username);
  const { activeTab, setActiveTab } = useProfileTabs();

  // Real social stats — fetch follower + following counts for the
  // profile being viewed (NOT the viewer's own counts). The hook is
  // reactive to the profile's user id, so it re-fetches when the
  // route changes to a different /u/<username>.
  const profileUserId = createMemo(() => publicProfile.profile()?.id ?? null);
  // eslint-disable-next-line solid/reactivity
  const socialStats = useSocialStats(profileUserId);

  // Follow relationship — tracks whether the current viewer is
  // following this profile. The hook handles the auth gate (signed-out
  // viewers see "Follow" but clicking opens the auth modal), the
  // optimistic update, and the toast feedback.
  // eslint-disable-next-line solid/reactivity
  const follow = useFollow(profileUserId);

  // For logged-out viewers, useAuth returns a null user. ProfileHeader
  // accepts an Accessor<User | null> — passing a constant-null accessor
  // is fine and the component falls back to the profile's display_name.
  const nullUser = (): User | null => null;
  const noop = () => {};

  // Is the viewer looking at their own profile? When true, we hide
  // the FollowButton (you can't follow yourself). This also handles
  // the case where the viewer is signed out (user() is null → not
  // own profile → FollowButton is shown, but clicking opens auth modal).
  const isOwnProfile = createMemo(
    () =>
      !!viewerUser() &&
      !!publicProfile.profile() &&
      viewerUser()!.uid === publicProfile.profile()!.id
  );

  // Convert the PublicProfile to a ProfileRow-shaped object so the
  // existing ProfileBanner + ProfileHeader components can consume it
  // without modification. The fields they read are all present on
  // PublicProfile; we just need to add a few nullable fields the row
  // type expects but the public function doesn't return.
  const profileRow = createMemo<ProfileRow | null>(() => {
    const p = publicProfile.profile();
    if (!p) return null;
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      bio: p.bio,
      avatar_url: p.avatar_url,
      banner_url: p.banner_url,
      banner_type: p.banner_type,
      favorite_movie_id: p.favorite_movie_id,
      favorite_series_id: p.favorite_series_id,
      favorite_director_id: p.favorite_director_id,
      social_links: p.social_links,
      is_public: p.is_public,
      created_at: p.created_at,
      // The following fields exist on ProfileRow but aren't returned by
      // the public lookup function (intentional — they're not public-
      // facing). We provide safe defaults so the type checks.
      banner_override_path: null,
      country: "",
      deleted_at: null,
      display_name_initialized: true,
      favorite_genre: null,
      language_code: "en",
      scheduled_deletion_at: null,
      timezone: "UTC",
      updated_at: p.created_at
    } as ProfileRow;
  });

  // Build the ProfileData shape that ProfileBanner expects. Favorites
  // enrichment (TMDB fetch for the banner backdrop) is skipped for the
  // public profile to keep the route's network footprint small — the
  // banner falls back to its custom banner_url or the default gradient.
  const profileData = createMemo<ProfileData | null>(() => {
    const p = publicProfile.profile();
    if (!p) return null;
    return {
      profile: profileRow(),
      favoriteMovie: null,
      favoriteSeries: null,
      favoriteDirector: null
    };
  });

  // Build a minimal StatsData from the public vault. We don't need
  // every field — ProfileStatsRow only reads total, completed,
  // movieCount, tvCount, totalRuntimeHours, avgRating.
  const stats = createMemo<StatsData | null>(() => {
    const list = publicProfile.watchlist();
    if (!list || list.length === 0) return null;
    const completed = list.filter((m) => m.status === "Completed").length;
    const movieCount = list.filter((m) => m.media_type === "movie").length;
    const tvCount = list.filter((m) => m.media_type === "tv").length;
    const totalRuntimeMinutes = list.reduce(
      (sum, m) => sum + (m.runtime ?? 0),
      0
    );
    const rated = list.filter((m) => m.rating && m.rating > 0);
    const avgRating =
      rated.length > 0
        ? rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length
        : 0;
    const total = movieCount + tvCount;
    return {
      total: list.length,
      watching: 0,
      completed,
      planned: 0,
      totalRuntimeMinutes,
      totalRuntimeHours: Math.round((totalRuntimeMinutes / 60) * 10) / 10,
      movieCount,
      tvCount,
      moviePct: total > 0 ? Math.round((movieCount / total) * 100) : 0,
      tvPct: total > 0 ? 100 - Math.round((movieCount / total) * 100) : 0,
      topGenres: [],
      decades: [],
      favoriteDecade: null,
      topDirectors: [],
      heatmap: [],
      monthlyCounts: [],
      weekdayVsWeekend: { weekday: 0, weekend: 0 },
      avgRating: Math.round(avgRating * 10) / 10,
      topRated: null,
      mostRewatched: null
    };
  });

  // Favorites come straight from the hook — it filters the public vault
  // rows by is_favorite = true (capped at 10, matching FavoritesGrid).
  const favorites = publicProfile.favorites;

  // Share handler — uses the shared helper which tries navigator.share
  // first, then falls back to clipboard.
  const handleShare = async () => {
    const p = publicProfile.profile();
    if (!p) return;
    await shareProfileLink(
      p.username,
      p.display_name,
      (msg, kind, durationMs) => showToast(msg, kind, durationMs)
    );
  };

  // Click handler for activity/favorites items — navigates to the
  // title's route via client-side routing (no full page reload, so the
  // public profile's loaded data + scroll position survives Back).
  // Previously this used `window.location.href = path` which forced a
  // full reload — losing the publicProfile hook's cached data and the
  // tab the viewer had selected.
  const handleItemClick = (item: WatchlistItem) => {
    const path =
      item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
    navigate(path);
  };

  const titleText = () => {
    const p = publicProfile.profile();
    return p ? `${p.display_name} — CineLog` : "CineLog — Profile";
  };

  return (
    <>
      <Title>{titleText()}</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <PageContainer>
            <div
              class="profile-page"
              style={{ padding: "var(--sp-12) var(--sp-5)" }}
            >
              <GlassEmptyState
                icon="error"
                title="Couldn't load profile"
                message={
                  error.message || "Something went wrong loading this profile."
                }
                action={
                  <GlassButton
                    variant="primary"
                    onClick={() => reset()}
                    aria-label="Retry"
                  >
                    Retry
                  </GlassButton>
                }
              />
            </div>
          </PageContainer>
        )}
      >
        <PageContainer>
          <div class="profile-layout profile-layout-v3">
            {/* ── LOADING ───────────────────────────────────────────── */}
            <Show when={publicProfile.status() === "loading"}>
              <div class="profile-skeleton-v3">
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
                  <For each={Array.from({ length: 5 })}>
                    {() => <GlassSkeleton class="h-24 flex-1 rounded-xl" />}
                  </For>
                </div>
              </div>
            </Show>

            {/* ── NOT FOUND ─────────────────────────────────────────── */}
            <Show when={publicProfile.status() === "not_found"}>
              <div
                class="profile-page"
                style={{ padding: "var(--sp-12) var(--sp-5)" }}
              >
                <GlassEmptyState
                  icon="person_off"
                  title="User not found"
                  message={
                    publicProfile.error()
                      ? `Error: ${publicProfile.error()}`
                      : `We couldn't find a public CineLog profile for "@${username()}".`
                  }
                />
              </div>
            </Show>

            {/* ── PRIVATE ───────────────────────────────────────────── */}
            <Show when={publicProfile.status() === "private"}>
              <div class="profile-content-v3">
                {/* The public lookup function returns no rows for private
                    profiles — we don't have the avatar/name to render a
                    personalized header. Show a clean generic lock screen. */}
                <section
                  class="profile-v3-banner-section"
                  aria-label="Profile banner"
                >
                  <div class="profile-banner">
                    <div class="profile-banner-gradient" aria-hidden="true" />
                    <div class="profile-banner-overlay" aria-hidden="true" />
                  </div>
                </section>

                <div class="profile-header-v3">
                  <div class="profile-header-v3-row">
                    <div class="profile-header-v3-avatar-wrap">
                      <div
                        class="profile-header-v3-avatar profile-private-lock-avatar"
                        aria-hidden="true"
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "32px" }}
                        >
                          lock
                        </span>
                      </div>
                    </div>
                    <div class="profile-header-v3-text">
                      <div class="profile-header-v3-name-row">
                        <h1 class="profile-header-v3-name">@{username()}</h1>
                      </div>
                      <p class="profile-header-v3-member-since">
                        This profile is private
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  class="profile-page"
                  style={{ padding: "var(--sp-8) var(--sp-5)" }}
                >
                  <GlassEmptyState
                    icon="lock"
                    title="This profile is private"
                    message={`@${username()}'s activity, favorites, and stats are only visible to them.`}
                  />
                </div>
              </div>
            </Show>

            {/* ── READY (PUBLIC PROFILE) ────────────────────────────── */}
            <Show
              when={
                publicProfile.status() === "ready" && publicProfile.profile()
              }
            >
              <div class="profile-content-v3">
                {/* 1. Banner — reuses ProfileBanner (no edit overlay). */}
                <section
                  class="profile-v3-banner-section"
                  aria-label="Profile banner"
                >
                  <ProfileBanner data={profileData()} isEditing={false} />
                </section>

                {/* 2. Header — isOwnProfile reflects whether the viewer
                       is looking at their own profile. When false,
                       the FollowButton (rendered below the header)
                       appears so the viewer can follow this user.
                       The share icon button is rendered by ProfileHeader
                       itself (V3.2) for both own and public profiles. */}
                <ProfileHeader
                  profile={profileRow}
                  user={nullUser}
                  isOwnProfile={isOwnProfile}
                  followers={() => socialStats.stats().followers}
                  following={() => socialStats.stats().following}
                  onEdit={noop}
                  onShare={handleShare}
                  onFollow={() => void follow.follow()}
                  onUnfollow={() => void follow.unfollow()}
                  isFollowing={follow.following}
                />

                {/* Follow button — only when viewing someone else's
                    profile. The button sits in its own row below the
                    header so it doesn't crowd the share icon. When
                    the viewer is signed out, clicking opens the auth
                    modal (handled inside useFollow). */}
                <Show when={!isOwnProfile()}>
                  <div class="profile-v3-follow-row">
                    <FollowButton
                      targetUserId={profileUserId}
                      displayName={() => publicProfile.profile()?.display_name ?? null}
                      size="compact"
                    />
                  </div>
                </Show>

                {/* 3. Stats row — computed from the public vault. */}
                <ProfileStatsRow stats={stats} />

                {/* 4. Tabs + content */}
                <ProfileTabs
                  activeTab={activeTab()}
                  onTabChange={setActiveTab}
                />

                <div class="profile-v3-tab-content">
                  <Show when={activeTab() === "activity"}>
                    <ActivityFeed
                      watchlist={publicProfile.watchlist}
                      onItemClick={handleItemClick}
                    />
                  </Show>
                  <Show when={activeTab() === "favorites"}>
                    <PublicFavoritesGrid
                      items={favorites}
                      onItemClick={handleItemClick}
                    />
                  </Show>
                  <Show when={activeTab() === "lists"}>
                    <div
                      class="profile-page"
                      style={{ padding: "var(--sp-8) var(--sp-5)" }}
                    >
                      <GlassEmptyState
                        icon="video_library"
                        title="Lists aren't publicly visible"
                        message="User-created collections are private to the owner."
                        variant="compact"
                      />
                    </div>
                  </Show>
                  <Show when={activeTab() === "achievements"}>
                    <AchievementsPreview watchlist={publicProfile.watchlist} />
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </PageContainer>
      </ErrorBoundary>
    </>
  );
};

export default PublicProfileRoute;

// ---------------------------------------------------------------------------
// PublicFavoritesGrid — a small inline grid that renders the public
// vault's `is_favorite` items. We don't reuse FavoritesGrid because
// that component reads from useCollections (the VIEWER's own
// collections), which is wrong for a public profile.
// ---------------------------------------------------------------------------

interface PublicFavoritesGridProps {
  items: () => WatchlistItem[];
  onItemClick?: (item: WatchlistItem) => void;
}

const PublicFavoritesGrid: Component<PublicFavoritesGridProps> = (props) => {
  const yearOf = (item: WatchlistItem): string => {
    const d = item.release_date ?? item.first_air_date;
    if (!d) return "";
    return d.slice(0, 4);
  };

  return (
    <div class="profile-favorites-grid-v3" aria-label="Favorite titles">
      <Show when={props.items().length === 0}>
        <GlassEmptyState
          icon="favorite_border"
          title="No favorites yet"
          message="This user hasn't favorited any titles."
          variant="compact"
        />
      </Show>
      <Show when={props.items().length > 0}>
        <For each={props.items()}>
          {(item) => (
            <button
              type="button"
              class="profile-favorites-grid-v3-card focus-ring"
              onClick={() => props.onItemClick?.(item)}
              aria-label={`${item.title ?? item.name ?? "Untitled"} (${yearOf(item)})`}
            >
              <Show
                when={item.poster_path}
                fallback={
                  <div
                    class="profile-favorites-grid-v3-poster-fallback"
                    aria-hidden="true"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">
                      movie
                    </span>
                  </div>
                }
              >
                <img
                  src={tmdbImage(item.poster_path, "w185") ?? ""}
                  class="profile-favorites-grid-v3-poster"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </Show>
              <div class="profile-favorites-grid-v3-meta">
                <p class="profile-favorites-grid-v3-title">
                  {item.title ?? item.name ?? "Untitled"}
                </p>
                <div class="profile-favorites-grid-v3-sub">
                  <Show when={yearOf(item)}>
                    <span class="profile-favorites-grid-v3-year">
                      {yearOf(item)}
                    </span>
                  </Show>
                  <Show when={item.rating && item.rating > 0}>
                    <span class="profile-favorites-grid-v3-rating">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        star
                      </span>
                      {item.rating}
                    </span>
                  </Show>
                </div>
              </div>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
};
