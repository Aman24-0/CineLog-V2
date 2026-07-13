// src/features/profile/ProfilePage.tsx
//
// ProfilePage — CineLog V2 Profile
//
// Five-section architecture:
//
//   1. PROFILE    — Who are you?
//                   Banner, avatar, name, archetype, bio, @username, member-since
//
//   2. COLLECTION — What have you watched?
//                   Vault count (left-aligned), sub-metrics, insight line,
//                   milestone progress, achievements strip
//
//   3. TASTE      — What defines your taste?
//                   Favorites with different visual weight,
//                   genre breakdown bar
//
//   4. ACTIVITY   — What are you watching now?
//                   Currently watching, last completed, last rated
//
//   5. SETTINGS   — Where do I go?
//                   Quick links, settings, sign out, delete
//
// Design principles:
//   • Identity > Collection > Taste > Activity > Utility
//   • Every section earns its place or hides
//   • Green accent at 3 touchpoints: archetype, milestone progress, dominant genre
//   • Left-aligned vault count (editorial, not dashboard)
//   • Typography hierarchy before color hierarchy
//   • Premium, minimal, timeless — no forced concepts
//
// Zero changes to business logic, hooks, state, or Supabase integration.

import { Show, createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
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
import { useProfileData } from "./useProfileData";
import { useUsernameCheck } from "./useUsernameCheck";
import { useStats } from "./useStats";
import { validateUsername, sanitizeUsername } from "~/shared/utils/username";
import { normalizeGenre } from "~/shared/utils/genres";
import ProfileBanner from "./components/ProfileBanner";
import BannerEditor, { type BannerType } from "./components/BannerEditor";
import TasteCard, { type FavoriteSlot } from "./components/TasteCard";
import ProfileAchievements from "./components/ProfileAchievements";
import RecentActivity from "./components/RecentActivity";
import ProfileNavigation from "./components/ProfileNavigation";
import ProfileSkeleton from "./components/ProfileSkeleton";
import FavoritesPicker from "./components/FavoritesPicker";
import type { WatchlistItem } from "~/shared/types";

// ── Archetype computation ─────────────────────────────────────────────

const ARCHETYPE_MAP: Record<string, { name: string; icon: string }> = {
  "sci-fi": { name: "World Builder", icon: "rocket_launch" },
  "horror": { name: "Night Owl", icon: "ghost" },
  "drama": { name: "Story Seeker", icon: "theater_comedy" },
  "comedy": { name: "Joy Finder", icon: "sentiment_very_satisfied" },
  "action": { name: "Thrill Chaser", icon: "bolt" },
  "animation": { name: "Dream Weaver", icon: "animation" },
  "documentary": { name: "Truth Hunter", icon: "fact_check" },
  "romance": { name: "Heart Explorer", icon: "favorite" },
  "thriller": { name: "Shadow Walker", icon: "visibility" },
  "fantasy": { name: "Realm Seeker", icon: "auto_awesome" },
  "mystery": { name: "Puzzle Solver", icon: "extension" },
  "crime": { name: "Case Cracker", icon: "gavel" },
  "adventure": { name: "Trailblazer", icon: "explore" },
  "war": { name: "Chronicle Keeper", icon: "shield" },
  "history": { name: "Time Witness", icon: "history_edu" },
  "music": { name: "Melody Seeker", icon: "music_note" },
  "family": { name: "Heartbeat Keeper", icon: "diversity_3" },
  "western": { name: "Frontier Spirit", icon: "landscape" },
};
const DEFAULT_ARCHETYPE = { name: "Cinema Explorer", icon: "movie" };
const GENRE_MATCHERS: [string, string][] = [
  ["sci", "sci-fi"], ["horror", "horror"], ["drama", "drama"], ["comedy", "comedy"],
  ["action", "action"], ["anim", "animation"], ["document", "documentary"],
  ["romance", "romance"], ["thriller", "thriller"], ["fantasy", "fantasy"],
  ["mystery", "mystery"], ["crime", "crime"], ["adventure", "adventure"],
  ["war", "war"], ["history", "history"], ["music", "music"],
  ["family", "family"], ["western", "western"],
];

// ── Milestone definitions ──────────────────────────────────────────────

const MILESTONES = [
  { target: 100, label: "Cinema Legend" },
  { target: 250, label: "Vault Keeper" },
  { target: 500, label: "Cinematic Sage" },
  { target: 1000, label: "Immortal Watcher" },
  { target: 2000, label: "Cinephile Supreme" },
];

// ── Insight priority logic (merged from CinemaInsight) ───────────────

function computeInsight(stats: {
  total: number;
  topGenres: { name: string; count: number; pct: number }[];
  topDirectors: { name: string; count: number }[];
  favoriteDecade: string | null;
  totalRuntimeHours: number;
  moviePct: number;
  tvPct: number;
  weekdayVsWeekend: { weekday: number; weekend: number };
}, list: WatchlistItem[]): string | null {
  if (!stats || list.length < 5) return null;

  // Priority 1: Dominant genre >50%
  if (stats.topGenres.length > 0) {
    const top = stats.topGenres[0];
    if (top.pct >= 50) return `${top.pct}% of your vault is ${top.name}`;
  }

  // Priority 2: Recurring director 3+
  if (stats.topDirectors.length > 0 && stats.topDirectors[0].count >= 3) {
    const dir = stats.topDirectors[0];
    return `${dir.name} appears ${dir.count} times in your vault`;
  }

  // Priority 3: Runtime milestone
  if (stats.totalRuntimeHours >= 72) {
    const days = Math.round(stats.totalRuntimeHours / 24);
    return `That's ${days} days of cinema`;
  }

  // Priority 4: Decade affinity
  if (stats.favoriteDecade && stats.total >= 10) {
    return `The ${stats.favoriteDecade} is your era`;
  }

  // Priority 5: Movie/TV split
  if (stats.moviePct >= 75) return `You're ${stats.moviePct}% film`;
  if (stats.tvPct >= 75) return `You're ${stats.tvPct}% series`;

  // Priority 6: Genre diversity
  if (stats.topGenres.length >= 6) {
    return `${stats.topGenres.length} genres explored`;
  }

  // Priority 7: Weekend watcher
  if (stats.weekdayVsWeekend) {
    const total = stats.weekdayVsWeekend.weekday + stats.weekdayVsWeekend.weekend;
    if (total >= 5) {
      const weekendPct = Math.round((stats.weekdayVsWeekend.weekend / total) * 100);
      if (weekendPct >= 60) return `${weekendPct}% of your watching is on weekends`;
    }
  }

  // Priority 8: Runtime fallback
  if (stats.totalRuntimeHours >= 24) {
    return `${Math.round(stats.totalRuntimeHours)} hours of cinema`;
  }

  return null;
}

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
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSlot, setPickerSlot] = createSignal<FavoriteSlot | null>(null);
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

  const openPicker = (slot: FavoriteSlot) => {
    setPickerSlot(slot);
    setPickerOpen(true);
  };

  const handleSaveBanner = async (type: BannerType, url: string | null): Promise<boolean> => {
    const ok = await saveProfile({ bannerType: type, bannerUrl: url });
    if (ok) { showToast("Banner updated.", "success"); }
    else { showToast("Failed to update banner.", "error"); }
    return ok;
  };

  const handlePickFavorite = async (slot: FavoriteSlot, id: string, _label: string) => {
    setPickerOpen(false);
    const ok = await saveProfile({
      favoriteMovieId: slot === "movie" ? id : undefined,
      favoriteSeriesId: slot === "series" ? id : undefined,
      favoriteDirectorId: slot === "director" ? id : undefined,
      favoriteGenre: slot === "genre" ? id : undefined,
    });
    if (ok) { showToast("Favorite updated.", "success"); }
    else { showToast("Failed to update favorite.", "error"); }
  };

  // ── Derived data ────────────────────────────────────────────────────

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

  // Archetype from genre distribution
  const genreCounts = createMemo(() => {
    const list = watchlist();
    const map = new Map<string, number>();
    list.forEach((m) => {
      if (!m.genresList || !Array.isArray(m.genresList)) return;
      m.genresList.forEach((g: unknown) => {
        const name = normalizeGenre(g);
        if (!name) return;
        for (const [substr, key] of GENRE_MATCHERS) {
          if (name.toLowerCase().includes(substr)) {
            map.set(key, (map.get(key) ?? 0) + 1);
            return;
          }
        }
      });
    });
    return map;
  });

  const archetype = createMemo(() => {
    const counts = genreCounts();
    if (counts.size === 0) return DEFAULT_ARCHETYPE;
    let best = DEFAULT_ARCHETYPE;
    let max = 0;
    for (const [genre, count] of counts) {
      if (count > max) {
        max = count;
        best = ARCHETYPE_MAP[genre] ?? DEFAULT_ARCHETYPE;
      }
    }
    return best;
  });

  // Vault stats
  const vaultStats = createMemo(() => {
    const list = watchlist();
    const completed = list.filter((m) => m.status === "Completed").length;
    const watching = list.filter((m) => m.status === "Watching").length;
    const planned = list.filter((m) => m.status === "Planned" || m.status === "Plan to Watch").length;
    return { total: list.length, completed, watching, planned };
  });

  // Next milestone
  const nextMilestone = createMemo(() => {
    const total = vaultStats().total;
    for (const m of MILESTONES) {
      if (total < m.target) {
        const remaining = m.target - total;
        return { target: m.target, label: m.label, remaining, pct: Math.round((total / m.target) * 100) };
      }
    }
    return null;
  });

  // Collection insight (merged from CinemaInsight)
  const collectionInsight = createMemo(() => {
    const s = stats();
    const list = watchlist();
    if (!s) return null;
    return computeInsight(s, list);
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
                SECTION 1: PROFILE — Who are you?
                Banner, avatar, name, archetype, bio.
                @username + member-since live here, not in settings.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section class="profile-hero" aria-label="Profile identity">
              <ProfileBanner
                data={data()}
                isEditing={isEditing()}
                onChooseBanner={() => setBannerEditorOpen(true)}
              />
              <div class="profile-hero-overlay">
                <div class="profile-hero-identity">
                  <div class="profile-avatar-wrap">
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
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = async () => {
                            const file = input.files?.[0];
                            if (!file) return;
                            showToast("Avatar upload coming soon.", "info");
                          };
                          input.click();
                        }}
                        aria-label="Change avatar"
                      >
                        <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">photo_camera</span>
                      </button>
                    </Show>
                  </div>

                  <div class="profile-hero-text">
                    <Show when={!isEditing()} fallback={
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
                    }>
                      {/* Display mode */}
                      <h1 class="profile-hero-name">
                        {data()?.profile?.display_name ?? user()?.displayName ?? "Cinephile"}
                      </h1>
                      <p class="profile-hero-archetype">
                        <span class="material-symbols-outlined profile-hero-archetype-icon" aria-hidden="true">
                          {archetype().icon}
                        </span>
                        {archetype().name}
                      </p>
                      <Show when={data()?.profile?.bio?.trim()}>
                        <p class="profile-hero-bio">{data()?.profile?.bio}</p>
                      </Show>
                      {/* @username + member-since — belongs in identity, not settings */}
                      <Show when={currentUsername() || memberSince()}>
                        <p class="profile-hero-meta">
                          <Show when={currentUsername()}>
                            <span>@{currentUsername()}</span>
                          </Show>
                          <Show when={currentUsername() && memberSince()}>
                            <span class="profile-hero-meta-sep" aria-hidden="true"> · </span>
                          </Show>
                          <Show when={memberSince()}>
                            <span>Since {memberSince()}</span>
                          </Show>
                        </p>
                      </Show>
                    </Show>
                  </div>

                  <Show when={!isEditing()}>
                    <div class="profile-hero-actions">
                      <PremiumIconButton
                        icon="edit"
                        variant="ghost"
                        size="compact"
                        label="Edit profile"
                        onClick={enterEdit}
                        aria-label="Edit profile"
                      />
                    </div>
                  </Show>
                </div>
              </div>
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 2: COLLECTION — What have you watched?
                Left-aligned vault count, sub-metrics, insight line,
                milestone progress, achievements strip.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section class="profile-section profile-collection" aria-label="Your collection">
              {/* Vault count — left-aligned, editorial */}
              <p class="profile-vault-number">
                {vaultStats().total}
              </p>
              <p class="profile-vault-label">titles in your vault</p>

              {/* Sub-metrics — one flowing line */}
              <p class="profile-vault-metrics">
                <span class="profile-vault-metric-value">{vaultStats().completed}</span> watched
                <span class="profile-vault-metric-sep" aria-hidden="true"> · </span>
                <span class="profile-vault-metric-value">{vaultStats().watching}</span> watching
                <span class="profile-vault-metric-sep" aria-hidden="true"> · </span>
                <span class="profile-vault-metric-value">{vaultStats().planned}</span> planned
              </p>

              {/* Insight line — merged from CinemaInsight */}
              <Show when={collectionInsight()}>
                <p class="profile-collection-insight">{collectionInsight()}</p>
              </Show>

              {/* Milestone progress — thin bar, only when close */}
              <Show when={nextMilestone() && nextMilestone()!.pct >= 60}>
                <div class="profile-milestone">
                  <div class="profile-milestone-bar" aria-hidden="true">
                    <div
                      class="profile-milestone-bar-fill"
                      style={{ width: `${nextMilestone()!.pct}%` }}
                    />
                  </div>
                  <p class="profile-milestone-text">
                    {nextMilestone()!.remaining} titles until {nextMilestone()!.label}
                  </p>
                </div>
              </Show>

              {/* Achievements strip — folded in, not standalone */}
              <ProfileAchievements watchlist={watchlist} />
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 3: TASTE — What defines your taste?
                Favorites with different visual weight.
                Genre breakdown bar.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section class="profile-section" aria-label="Your taste">
              <TasteCard
                data={data() ?? null}
                isEditing={isEditing()}
                onPick={openPicker}
                stats={stats}
              />
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 4: ACTIVITY — What are you watching now?
                Currently watching, last completed, last rated.
                Hides entirely if no recent items.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <RecentActivity watchlist={watchlist} />

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 5: SETTINGS — Where do I go?
                Quick links row, single settings link,
                sign out, delete account.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <ProfileNavigation onSignOut={handleSignOut} />

          </div>
        </Show>
      </div>

      {/* Sheet modals */}
      <Show when={pickerOpen() && pickerSlot()}>
        {(slot) => (
          <FavoritesPicker
            open={pickerOpen()}
            slot={slot()}
            onClose={() => setPickerOpen(false)}
            onSelect={handlePickFavorite}
          />
        )}
      </Show>
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
