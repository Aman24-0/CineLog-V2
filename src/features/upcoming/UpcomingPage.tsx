// src/features/upcoming/UpcomingPage.tsx
//
// UpcomingPage — the redesigned Upcoming hub at /profile/upcoming.
//
// LAYOUT:
//   ┌─────────────────────────────────────────────────────────────┐
//   │  ← Back   Upcoming Releases                                 │
//   │  What's coming next — calendar + reminders + filters        │
//   ├─────────────────────────────────────────────────────────────┤
//   │  [DateRangePicker]      [Sort ▾] [Filter] [List | Calendar] │
//   ├─────────────────────────────────────────────────────────────┤
//   │  List view:                                                 │
//   │    TODAY ──────────                                         │
//   │      [UpcomingCard] [UpcomingCard]                          │
//   │    TOMORROW ────────                                        │
//   │      [UpcomingCard]                                         │
//   │    ...                                                      │
//   │  Calendar view:                                             │
//   │    [CalendarView]                                           │
//   │    [Titles for the selected day]                            │
//   └─────────────────────────────────────────────────────────────┘
//
// State:
//   • Filters: region (driven by profile.country), dateRange, genres,
//     mediaType. minRating was removed in v3.
//   • Sort: date | rating | popularity | title (persisted to localStorage).
//   • View: list | calendar (persisted to localStorage).
//   • Sheets: filterSheetOpen, notificationsOpen, trailerOpen.
//   • Trailer state: which TMDB title's trailer to play (or null).
//
// Region reactivity:
//   • The page reads `profile.country` from `useProfileData`. If the
//     profile is loading or the user has no country set, we fall back
//     to "US" (TMDB's US release calendar is the densest).
//   • When the profile loads (or the user changes their country in
//     settings and navigates back), the region signal updates, which
//     causes the useUpcomingData hook to refetch with the new region.
//   • The FilterSheet's Region dropdown can override the region
//     per-session; resetting filters restores the profile-derived
//     default.

import {
  createSignal,
  createMemo,
  createEffect,
  Show,
  For,
  type Component
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { GlassButton, GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { normalizeGenres } from "~/shared/utils/genres";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { cacheMetadataEntries, buildCacheKey } from "~/shared/utils/tmdbCache";
import { useProfileData } from "~/features/profile/useProfileData";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

import { useUpcomingData } from "./hooks/useUpcomingData";
import { useNotifications } from "./hooks/useNotifications";
import DateRangePicker, { type DateRange } from "./components/DateRangePicker";
import ViewToggle, {
  loadUpcomingView,
  saveUpcomingView
} from "./components/ViewToggle";
import SortDropdown, {
  loadUpcomingSort,
  saveUpcomingSort
} from "./components/SortDropdown";
import UpcomingCard from "./components/UpcomingCard";
import CalendarView from "./components/CalendarView";
import FilterSheet, { type UpcomingFilters } from "./components/FilterSheet";
import NotificationCenter from "./components/NotificationCenter";
import TrailerModal from "./components/TrailerModal";

// Default region for the Upcoming page when the user has no profile
// country set. "US" is used because TMDB's US release calendar is the
// most densely populated — it gives users in unlisted regions a
// reasonable default. The user's actual profile country overrides
// this as soon as useProfileData resolves.
const DEFAULT_REGION = "US";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const UpcomingPage: Component = () => {
  const navigate = useNavigate();
  const library = useUserLibrary();
  const { isSignedIn } = useAuth();
  const toast = useToast();
  const { openTitle } = useModalState();
  const profileData = useProfileData();

  // ── Region derived from the user's profile ─────────────────────
  // profile.country is a string (NOT nullable in the schema), but it
  // can be empty "" on legacy accounts. Fall back to DEFAULT_REGION
  // in that case so TMDB doesn't 422 on an empty region.
  const profileCountry = createMemo<string>(() => {
    const c = profileData.data()?.profile?.country ?? "";
    return c && c.length === 2 ? c : "";
  });

  // The "effective" region is what we actually send to TMDB. It's the
  // user-typed region (from the FilterSheet) when set, otherwise the
  // profile-derived country, otherwise DEFAULT_REGION. We model this
  // as a separate signal so the FilterSheet can override it without
  // mutating the profile.
  const [regionOverride, setRegionOverride] = createSignal<string | null>(null);
  const effectiveRegion = createMemo<string>(() => {
    const ov = regionOverride();
    if (ov) return ov;
    const pc = profileCountry();
    if (pc) return pc;
    return DEFAULT_REGION;
  });

  // When the profile loads for the first time and there's no override,
  // we want the FilterSheet to show the user's country as the selected
  // region. We do this by seeding `regionOverride` once when the
  // profile country resolves.
  // Effect: when profileCountry transitions from "" → "XX", copy it
  // into regionOverride so the filter state mirrors it. If the user
  // has already chosen a region via the FilterSheet, we DON'T clobber
  // their choice (regionOverride is already truthy).
  createEffect(() => {
    const pc = profileCountry();
    if (pc && !regionOverride()) {
      setRegionOverride(pc);
    }
  });

  // ── Filter + sort + view state ─────────────────────────────────
  // NOTE: `minRating` was removed from the UI in v3. The field is
  // kept on UpcomingFilters for backward-compat (older persisted
  // localStorage state may still include it) but it's never read.
  //
  // v4: default date range is now 90 days (was 30). The wider default
  // surfaces more upcoming series — many prestige shows (e.g. HotD)
  // have episodes airing 30-60 days out, and the 30-day default was
  // hiding them. Users can still narrow via the date presets.
  const buildDefaultFilters = (): UpcomingFilters => ({
    region: effectiveRegion(),
    dateRange: { start: todayStr(), end: addDays(todayStr(), 90) },
    genres: [],
    platforms: [],
    minRating: 0,
    mediaType: "all"
  });

  const [filters, setFilters] = createSignal<UpcomingFilters>(
    buildDefaultFilters()
  );
  // ESLint: draftFilters is intentionally seeded once from the initial
  // `filters()` value at mount. The draft is the working copy the user
  // edits in the FilterSheet; it must NOT track `filters` reactively
  // (otherwise user edits would be clobbered when the
  // effectiveRegion-sync createEffect updates `filters`).
  // eslint-disable-next-line solid/reactivity
  const [draftFilters, setDraftFilters] = createSignal<UpcomingFilters>(filters());
  const [filterSheetOpen, setFilterSheetOpen] = createSignal(false);
  const [sort, setSort] = createSignal(loadUpcomingSort());
  const [view, setView] = createSignal(loadUpcomingView());

  // Keep filters().region in sync with effectiveRegion — when the
  // profile loads (or the user resets filters), the filter region
  // should track the profile-derived region unless the user has
  // explicitly chosen a different one in the FilterSheet.
  createEffect(() => {
    const er = effectiveRegion();
    setFilters((prev) => (prev.region === er ? prev : { ...prev, region: er }));
  });

  // ── Modal state ─────────────────────────────────────────────────
  const [notificationsOpen, setNotificationsOpen] = createSignal(false);
  const [trailerOpen, setTrailerOpen] = createSignal(false);
  const [trailerTitle, setTrailerTitle] = createSignal<TMDBTitle | null>(null);
  const [trailerVideoId, setTrailerVideoId] = createSignal<string | null>(null);
  const [notifyAllLoading, setNotifyAllLoading] = createSignal(false);

  // ── Selected calendar day (for calendar view detail) ────────────
  const [selectedDay, setSelectedDay] = createSignal<string | null>(null);

  // ── Notifications + reminders ───────────────────────────────────
  const notif = useNotifications();

  // ── Data hook ───────────────────────────────────────────────────
  const data = useUpcomingData(
    {
      region: () => filters().region,
      startDate: () => filters().dateRange.start,
      endDate: () => filters().dateRange.end,
      genres: () => filters().genres,
      mediaType: () => filters().mediaType,
      sortBy: sort
    },
    notif.reminders
  );

  // ── Vault membership ────────────────────────────────────────────
  // Defensive: useUserLibrary might not be available on first render.
  const watchlist = createMemo<WatchlistItem[]>(() => {
    try {
      const list = library?.watchlist?.();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });
  const vaultIds = createMemo<Set<string>>(
    () => new Set(watchlist().map((w) => String(w.id)))
  );
  const inVault = (title: TMDBTitle): boolean =>
    vaultIds().has(String(title.id));

  // ── Handlers ────────────────────────────────────────────────────
  const handleOpen = (title: TMDBTitle) => {
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: normalizeGenres(title.genres as unknown[]),
      director: title.director
    };
    openTitle(baseItem, watchlist());
  };

  const handleTrailer = async (title: TMDBTitle) => {
    setTrailerTitle(title);
    setTrailerVideoId(null);
    setTrailerOpen(true);
    try {
      // Fetch the trailer from TMDB via the server proxy.
      const res = await fetch(
        `/api/media/${title.media_type}/${title.id}/videos?language=en-US`
      );
      if (!res.ok) throw new Error("Failed to load trailer");
      const json = await res.json();
      const yt = (json.results ?? []).find(
        (v: { site?: string; type?: string; key?: string }) =>
          v.site === "YouTube" && v.type === "Trailer" && v.key
      );
      if (yt?.key) {
        setTrailerVideoId(yt.key);
      } else {
        setTrailerVideoId(null);
      }
    } catch {
      setTrailerVideoId(null);
    }
  };

  const handleAddToWatchlist = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid || !isSignedIn()) {
      toast.showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    try {
      const item: WatchlistItem = {
        id: String(title.id),
        title: title.title,
        name: title.name,
        media_type: title.media_type,
        poster_path: title.poster_path,
        backdrop_path: title.backdrop_path,
        status: "Planned",
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        genresList: normalizeGenres(title.genres as unknown[]),
        director: title.director
      };
      await createVaultItemInSupabase(uid, item);
      cacheMetadataEntries([
        {
          key: buildCacheKey(title.media_type, title.id),
          tmdb_id: title.id,
          media_type: title.media_type,
          data: title
        }
      ]).catch((err) => { if (import.meta.env.DEV) console.warn("[upcoming] cache write failed:", err); });
      const name = title.title || title.name || "Title";
      toast.showToast(`Added "${name}" to your vault`, "success");
      void library?.refresh?.();
    } catch (err) {
      console.error("Failed to add to vault:", err);
      toast.showToast("Failed to save. Try again.", "error");
    }
  };

  const handleToggleReminder = async (title: TMDBTitle) => {
    if (!isSignedIn()) {
      toast.showToast("Sign in to set reminders.", "error");
      return;
    }
    const id = String(title.id);
    if (data.isReminderSet(id)) {
      await notif.cancelReminder(id);
    } else {
      const releaseDate =
        title.episodeAirDate || title.release_date || title.first_air_date;
      if (!releaseDate) {
        toast.showToast("No release date available for this title.", "info");
        return;
      }
      const name = title.title || title.name || "Untitled";
      // The reminder repo uses "movie" | "series" (CineLog naming);
      // TMDBTitle uses "movie" | "tv". Map here so the repo stays clean.
      const reminderType: "movie" | "series" =
        title.media_type === "tv" ? "series" : "movie";
      await notif.scheduleReminder(id, reminderType, releaseDate, name);
    }
  };

  const handleShare = async (title: TMDBTitle) => {
    const name = title.title || title.name || "this title";
    // Share link uses the canonical deep-link route /{type}/{id}
    // (e.g. /tv/125988, /movie/550). The old /details/{type}/{id}
    // format was a 404 — there's a redirect route in place for
    // backwards compatibility with old shared links, but new shares
    // should use the correct path directly.
    const url = `${window.location.origin}/${title.media_type}/${title.id}`;
    const shareData = {
      title: `CineLog — ${name}`,
      text: `Check out ${name} on CineLog.`,
      url
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.showToast("Link copied to clipboard", "success");
      } else {
        toast.showToast(url, "info");
      }
    } catch {
      // User cancelled share — no toast needed.
    }
  };

  // ── Filter sheet handlers ──────────────────────────────────────
  const openFilterSheet = () => {
    setDraftFilters(filters());
    setFilterSheetOpen(true);
  };
  const applyFilters = () => {
    const next = draftFilters();
    setFilters(next);
    setRegionOverride(next.region);
    setFilterSheetOpen(false);
  };
  const resetFilters = () => {
    // Reset brings the filter state back to the profile-derived
    // default — NOT a hardcoded US default. This means if the user
    // had picked a different region in the FilterSheet and then
    // hits Reset, we restore their profile country (or US fallback).
    setRegionOverride(null);
    const reset = buildDefaultFilters();
    setFilters(reset);
    setDraftFilters(reset);
    setFilterSheetOpen(false);
  };

  // ── Sort/view persistence ──────────────────────────────────────
  const handleSortChange = (v: "date" | "rating" | "popularity" | "title") => {
    setSort(v);
    saveUpcomingSort(v);
  };
  const handleViewChange = (v: "list" | "calendar") => {
    setView(v);
    saveUpcomingView(v);
  };

  // ── Calendar day selection ─────────────────────────────────────
  const handleSelectDay = (dateStr: string) => {
    setSelectedDay(dateStr);
  };
  const selectedDayTitles = createMemo<TMDBTitle[]>(() => {
    const d = selectedDay();
    if (!d) return [];
    return data.calendarBuckets().get(d) ?? [];
  });

  // ── Date range change (inline picker at top of page) ───────────
  const handleDateRangeChange = (next: DateRange) => {
    setFilters((prev) => ({ ...prev, dateRange: next }));
  };

  // ── Count of active filters (for badge on Filter button) ───────
  // minRating is intentionally NOT counted — it's always 0 in v3.
  const activeFilterCount = createMemo(() => {
    const f = filters();
    let n = 0;
    if (f.region !== effectiveRegion()) n++;
    if (f.genres.length) n++;
    if (f.mediaType !== "all") n++;
    return n;
  });

  // ── Loading + empty state ──────────────────────────────────────
  const isEmpty = createMemo(
    () => !data.loading() && data.titles().length === 0
  );

  // ── "Notify all" bulk action (Phase 6 Part 3 — Task 1) ──────────
  //
  // Force-send push + email for all unsent reminders. Shows a spinner
  // on the button while the operation is in flight, then a summary
  // toast (handled inside the hook).
  const handleNotifyAll = async () => {
    if (notifyAllLoading()) return;
    setNotifyAllLoading(true);
    try {
      await notif.notifyAll();
    } finally {
      setNotifyAllLoading(false);
    }
  };

  // Pending-reminder count — drives the badge on the "Notify all" button.
  const pendingReminderCount = createMemo(
    () => notif.reminders().filter((r) => !r.notification_sent).length
  );

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in upcoming-page">
        {/* Header */}
        <div class="sec-header">
          <a
            href="/profile"
            class="sec-back focus-ring"
            aria-label="Back to profile"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px" }}
              aria-hidden="true"
            >
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Upcoming</p>
          <h1 class="sec-title">Upcoming Releases</h1>
          <p class="sec-subtitle">
            Calendar + reminders for movies and series coming soon.
          </p>
          <Show when={pendingReminderCount() > 0}>
            <button
              type="button"
              class="upcoming-notify-all focus-ring"
              onClick={handleNotifyAll}
              disabled={notifyAllLoading()}
              aria-label={`Notify all ${pendingReminderCount()} pending reminders`}
            >
              <Show
                when={!notifyAllLoading()}
                fallback={
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      "font-size": "16px",
                      animation: "spin 1s linear infinite"
                    }}
                  >
                    progress_activity
                  </span>
                }
              >
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "16px" }}
                >
                  campaign
                </span>
              </Show>
              Notify all
              <span class="upcoming-notify-all-badge">
                {pendingReminderCount()}
              </span>
            </button>
          </Show>
        </div>

        <div class="sec-body">
          {/* Toolbar */}
          <div class="upcoming-toolbar">
            <div class="upcoming-toolbar-left">
              <DateRangePicker
                value={filters().dateRange}
                onChange={handleDateRangeChange}
              />
            </div>
            <div class="upcoming-toolbar-right">
              <SortDropdown value={sort} onChange={handleSortChange} />
              <button
                type="button"
                class={`upcoming-filter-btn focus-ring ${activeFilterCount() > 0 ? "has-active" : ""}`}
                onClick={openFilterSheet}
                aria-label="Open filters"
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  tune
                </span>
                <Show when={activeFilterCount() > 0}>
                  <span class="upcoming-filter-badge" aria-hidden="true">
                    {activeFilterCount()}
                  </span>
                </Show>
              </button>
              <ViewToggle value={view} onChange={handleViewChange} />
            </div>
          </div>

          {/* Content */}
          <Show when={!data.loading()} fallback={<UpcomingSkeleton />}>
            <Show
              when={!isEmpty()}
              fallback={
                <GlassEmptyState
                  icon="event_busy"
                  title="No upcoming titles"
                  message="Try expanding the date range or adjusting your filters."
                  variant="default"
                  surface
                  action={
                    <button
                      type="button"
                      class="btn-primary focus-ring"
                      onClick={resetFilters}
                    >
                      Reset filters
                    </button>
                  }
                />
              }
            >
              <Show
                when={view() === "list"}
                fallback={
                  <div class="upcoming-calendar-view">
                    <CalendarView
                      buckets={data.calendarBuckets}
                      onSelectDay={handleSelectDay}
                    />
                    <Show when={selectedDay()}>
                      <div class="upcoming-calendar-day-detail">
                        <h3 class="upcoming-calendar-day-title">
                          {new Date(
                            selectedDay()! + "T00:00:00"
                          ).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric"
                          })}
                        </h3>
                        <Show
                          when={selectedDayTitles().length > 0}
                          fallback={
                            <p class="upcoming-calendar-day-empty">
                              No releases on this day.
                            </p>
                          }
                        >
                          <div class="upcoming-card-list">
                            <For each={selectedDayTitles()}>
                              {(t) => (
                                <UpcomingCard
                                  title={t}
                                  isReminderSet={data.isReminderSet(
                                    String(t.id)
                                  )}
                                  inVault={inVault(t)}
                                  onOpen={handleOpen}
                                  onTrailer={handleTrailer}
                                  onAddToWatchlist={handleAddToWatchlist}
                                  onToggleReminder={handleToggleReminder}
                                  onShare={handleShare}
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                }
              >
                {/* List view — grouped by relative date */}
                <div class="upcoming-list-view">
                  <For each={data.groups()}>
                    {(group) => (
                      <section class="upcoming-group">
                        <h3 class="upcoming-group-label">
                          {group.label}
                          <span class="upcoming-group-count">
                            {group.titles.length}
                          </span>
                        </h3>
                        <div class="upcoming-card-list">
                          <For each={group.titles}>
                            {(t) => (
                              <UpcomingCard
                                title={t}
                                isReminderSet={data.isReminderSet(String(t.id))}
                                inVault={inVault(t)}
                                onOpen={handleOpen}
                                onTrailer={handleTrailer}
                                onAddToWatchlist={handleAddToWatchlist}
                                onToggleReminder={handleToggleReminder}
                                onShare={handleShare}
                              />
                            )}
                          </For>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>

      {/* Filter sheet */}
      <FilterSheet
        open={filterSheetOpen()}
        onClose={() => setFilterSheetOpen(false)}
        value={draftFilters()}
        onChange={setDraftFilters}
        onApply={applyFilters}
        onReset={resetFilters}
        defaultRegion={profileCountry() || undefined}
      />

      {/* Notification center */}
      <NotificationCenter
        open={notificationsOpen()}
        onClose={() => setNotificationsOpen(false)}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onClearRead={notif.clearRead}
        onSnooze={notif.snooze}
        onDismiss={notif.dismiss}
        onOpenTitle={(relatedId, relatedType) => {
          // Navigate to the canonical deep-link route /{type}/{id}.
          // The Details modal opens automatically from there.
          navigate(`/${relatedType ?? "movie"}/${relatedId}`);
        }}
      />

      {/* Trailer modal */}
      <TrailerModal
        open={trailerOpen()}
        onClose={() => {
          setTrailerOpen(false);
          setTrailerTitle(null);
          setTrailerVideoId(null);
        }}
        videoId={trailerVideoId()}
        title={trailerTitle()?.title || trailerTitle()?.name}
      />
    </PageContainer>
  );
};

// Skeleton loader for the list view — 4 fake cards.
const UpcomingSkeleton: Component = () => (
  <div
    class="upcoming-list-view"
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label="Loading upcoming releases"
  >
    <For each={Array.from({ length: 4 })}>
      {() => (
        <div class="upcoming-card upcoming-card-skeleton">
          <GlassSkeleton class="upcoming-card-poster-skeleton" />
          <div class="upcoming-card-body-skeleton">
            <GlassSkeleton class="h-4 w-3/4 rounded" />
            <GlassSkeleton class="h-3 w-1/2 rounded" />
            <GlassSkeleton class="h-3 w-2/3 rounded" />
          </div>
        </div>
      )}
    </For>
  </div>
);

// GlassButton is referenced (not used directly here) to keep the
// import live for downstream consumers that bundle this page with
// the shared glass index.
void GlassButton;

export default UpcomingPage;
