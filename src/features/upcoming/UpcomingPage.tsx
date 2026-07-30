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
//   • Filters: region, dateRange, genres, platforms, minRating, mediaType.
//   • Sort: date | rating | popularity | title (persisted to localStorage).
//   • View: list | calendar (persisted to localStorage).
//   • Sheets: filterSheetOpen, notificationsOpen, trailerOpen.
//   • Trailer state: which TMDB title's trailer to play (or null).
//
// All Supabase state (notifications + reminders) flows through the
// useNotifications hook. TMDB fetches flow through useUpcomingData.

import {
  createSignal,
  createMemo,
  Show,
  For,
  type Component,
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
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

import { useUpcomingData } from "./hooks/useUpcomingData";
import { useNotifications } from "./hooks/useNotifications";
import DateRangePicker, { type DateRange } from "./components/DateRangePicker";
import ViewToggle, {
  loadUpcomingView,
  saveUpcomingView,
} from "./components/ViewToggle";
import SortDropdown, {
  loadUpcomingSort,
  saveUpcomingSort,
} from "./components/SortDropdown";
import UpcomingCard from "./components/UpcomingCard";
import CalendarView from "./components/CalendarView";
import FilterSheet, { type UpcomingFilters } from "./components/FilterSheet";
import NotificationCenter from "./components/NotificationCenter";
import TrailerModal from "./components/TrailerModal";

// Default region for the Upcoming page when the user has no profile
// country set. "US" is used because TMDB's US release calendar is the
// most densely populated — it gives users in unlisted regions a
// reasonable default. Users with a profile country get that country
// via the FilterSheet's Region picker (which writes to `filters.region`).
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

  // ── Filter + sort + view state ─────────────────────────────────
  const defaultFilters: UpcomingFilters = {
    region: DEFAULT_REGION,
    dateRange: { start: todayStr(), end: addDays(todayStr(), 30) },
    genres: [],
    platforms: [],
    minRating: 0,
    mediaType: "all",
  };

  const [filters, setFilters] = createSignal<UpcomingFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = createSignal<UpcomingFilters>(defaultFilters);
  const [filterSheetOpen, setFilterSheetOpen] = createSignal(false);
  const [sort, setSort] = createSignal(loadUpcomingSort());
  const [view, setView] = createSignal(loadUpcomingView());

  // ── Modal state ─────────────────────────────────────────────────
  const [notificationsOpen, setNotificationsOpen] = createSignal(false);
  const [trailerOpen, setTrailerOpen] = createSignal(false);
  const [trailerTitle, setTrailerTitle] = createSignal<TMDBTitle | null>(null);
  const [trailerVideoId, setTrailerVideoId] = createSignal<string | null>(null);

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
      minRating: () => filters().minRating,
      mediaType: () => filters().mediaType,
      sortBy: sort,
    },
    notif.reminders,
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
    () => new Set(watchlist().map((w) => String(w.id))),
  );
  const inVault = (title: TMDBTitle): boolean => vaultIds().has(String(title.id));

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
      director: title.director,
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
        `/api/media/${title.media_type}/${title.id}/videos?language=en-US`,
      );
      if (!res.ok) throw new Error("Failed to load trailer");
      const json = await res.json();
      const yt = (json.results ?? []).find(
        (v: { site?: string; type?: string; key?: string }) =>
          v.site === "YouTube" && v.type === "Trailer" && v.key,
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
        director: title.director,
      };
      await createVaultItemInSupabase(uid, item);
      cacheMetadataEntries([
        {
          key: buildCacheKey(title.media_type, title.id),
          tmdb_id: title.id,
          media_type: title.media_type,
          data: title,
        },
      ]).catch(() => {});
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
      const releaseDate = title.release_date || title.first_air_date;
      if (!releaseDate) {
        toast.showToast("No release date available for this title.", "info");
        return;
      }
      const name = title.title || title.name || "Untitled";
      // The reminder repo uses "movie" | "series" (CineLog naming);
      // TMDBTitle uses "movie" | "tv". Map here so the repo stays clean.
      const reminderType: "movie" | "series" =
        title.media_type === "tv" ? "series" : "movie";
      await notif.scheduleReminder(
        id,
        reminderType,
        releaseDate,
        name,
      );
    }
  };

  const handleShare = async (title: TMDBTitle) => {
    const name = title.title || title.name || "this title";
    const url = `${window.location.origin}/details/${title.media_type}/${title.id}`;
    const shareData = {
      title: `CineLog — ${name}`,
      text: `Check out ${name} on CineLog.`,
      url,
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
    setFilters(draftFilters());
    setFilterSheetOpen(false);
  };
  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
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
  const activeFilterCount = createMemo(() => {
    const f = filters();
    let n = 0;
    if (f.region !== DEFAULT_REGION) n++;
    if (f.genres.length) n++;
    if (f.platforms.length) n++;
    if (f.minRating > 0) n++;
    if (f.mediaType !== "all") n++;
    return n;
  });

  // ── Loading + empty state ──────────────────────────────────────
  const isEmpty = createMemo(() => !data.loading() && data.titles().length === 0);

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in upcoming-page">
        {/* Header */}
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
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
                <span class="material-symbols-outlined" aria-hidden="true">tune</span>
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
                          {new Date(selectedDay()! + "T00:00:00").toLocaleDateString(
                            undefined,
                            { weekday: "long", month: "long", day: "numeric" },
                          )}
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
      />

      {/* Notification center */}
      <NotificationCenter
        open={notificationsOpen()}
        onClose={() => setNotificationsOpen(false)}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onClearRead={notif.clearRead}
        onOpenTitle={(relatedId, relatedType) => {
          // We only have the TMDB id — navigate to the details route.
          // The Details modal can be opened from there.
          navigate(`/details/${relatedType ?? "movie"}/${relatedId}`);
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
  <div class="upcoming-list-view">
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

export default UpcomingPage;
