// src/features/watchlist/WatchlistView.tsx
import { createSignal, createEffect, createMemo, For, Show, onMount, onCleanup, lazy, Suspense } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import Icon from "~/shared/ui/Icon";
import { useToast } from "~/shared/hooks/useToast";
import { login } from "~/core/firebase/auth";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "./useVault";
import { resolveTimelineDate } from "~/shared/utils/date";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
import VaultHeader from "./components/VaultHeader";
import VaultSearch from "./components/VaultSearch";
import VaultGrid from "./components/VaultGrid";
import VaultCard from "./components/VaultCard";
import EmptyState from "./components/EmptyState";
import LoadingSkeleton from "./components/LoadingSkeleton";

const VaultFilters = lazy(() => import("./components/VaultFilters"));

// Convert any of Firestore Timestamp ({seconds, nanoseconds}), Date, or ISO
// string into a numeric epoch-ms value (or 0 if missing/unparseable) for use
// inside sort comparators. Without this, `addedAt` from Firestore silently
// fails the `instanceof Date` check and `new Date({...})` returns Invalid Date.
const toMs = (v: any): number => {
  if (!v) return 0;
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (typeof v === "object" && typeof v.seconds === "number") {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  return 0;
};
const toAddedAtMs = (v: WatchlistItem["addedAt"]) => toMs(v);

const defaultFilters: VaultFilters = {
  type: "all",
  status: "all",
  region: "all",
  genre: "all",
  platform: "all",
  sort: "recent",
  tag: "all",
  imdbMin: "",
  imdbMax: "",
  rtMin: "",
  rtMax: "",
  yearMin: "",
  yearMax: "",
  runtimeMin: "",
  runtimeMax: ""
};

export default function WatchlistView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { setSelectedItem } = useModalState();
  const { watchlist, loading, isGuest, error } = useVault();

  // searchInput: raw input value (updates instantly as user types)
  // search: debounced value used by the filter (updates 200ms after typing
  // stops). Prevents re-filtering the entire vault on every keystroke when
  // the user is typing a long query.
  const [searchInput, setSearchInput] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [filters, setFilters] = createSignal<VaultFilters>(defaultFilters);
  const [showFilter, setShowFilter] = createSignal(false);
  const [displayLimit, setDisplayLimit] = createSignal(20);
  const [viewMode, setViewMode] = createSignal<"grid" | "timeline">("grid");

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer) clearTimeout(searchTimer);
    // 120ms debounce — snappy enough to feel instant, but avoids re-filtering
    // the entire vault on every keystroke for very large vaults.
    searchTimer = setTimeout(() => {
      setSearch(v);
      setDisplayLimit(30);
    }, 120);
  };

  // Clear search input + debounced search together
  const clearSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    setSearchInput("");
    setSearch("");
  };

  // Read `?status=` from the URL (set by Dashboard stat cards) and apply it
  // as the initial status filter. Reactivity: if the param changes while the
  // view is mounted, the filter is updated too. "all" / missing param = no
  // status filter. We also normalize the legacy "Plan to Watch" status to
  // "Planned" so the filter chips match.
  createEffect(() => {
    const status = searchParams.status;
    if (typeof status === "string" && status) {
      const next = status === "all" ? "all" : status;
      setFilters((prev) => (prev.status === next ? prev : { ...prev, status: next }));
    }
  });

  let prevViewMode = "grid";
  createEffect(() => {
    const mode = viewMode();
    if (mode === "timeline" && prevViewMode !== "timeline") {
      setFilters({ ...defaultFilters, status: "Completed", sort: "watch_desc" });
    } else if (mode === "grid" && prevViewMode === "timeline") {
      setFilters({ ...defaultFilters, status: "all", sort: "recent" });
    }
    prevViewMode = mode;
  });

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      setDisplayLimit((prev) => prev + 20);
    }
  };
  // Register both add AND remove inside onMount — onMount only runs on the
  // client, so window is guaranteed to exist. onCleanup at top level would
  // fire during SSR (scope disposal) and crash with "window is not defined".
  onMount(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", handleScroll));
    // Clear any pending search debounce timer when the view unmounts so we
    // don't trigger a state update on a disposed component.
    onCleanup(() => {
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }
    });
  });

  const uniqueGenres = createMemo(() => [...new Set(watchlist().flatMap((m) => m.genresList || []))].filter(Boolean).sort());
  const uniquePlatforms = createMemo(() => [...new Set(watchlist().flatMap((m) => m.platformsList || []))].filter(Boolean).sort());
  const uniqueTags = createMemo(() => [...new Set(watchlist().map((m) => m.tag).filter((t): t is string => !!t))].sort());

  const filtered = createMemo(() => {
    let f = watchlist();
    if (search()) {
      const s = search().toLowerCase().trim();
      f = f.filter((m) => {
        // Comprehensive multi-field search:
        //   title, original_title, name, original_name, tag, notes, director,
        //   castList (actors), genresList, platformsList, release year
        const year = (m.release_date || m.first_air_date || "").substring(0, 4);
        const fields = [
          m.title, m.original_title, m.name, m.original_name,
          m.tag, m.notes, m.director, year,
          ...(m.castList || []),
          ...(m.genresList || []),
          ...(m.platformsList || [])
        ].join(" ").toLowerCase();
        return fields.includes(s);
      });
    }
    if (filters().type !== "all") f = f.filter((m) => m.media_type === filters().type);
    if (filters().status !== "all")
      f = f.filter((m) => m.status === filters().status || (filters().status === "Planned" && m.status === "Plan to Watch"));
    if (filters().region !== "all") f = f.filter((m) => (m.region || "International") === filters().region);
    if (filters().genre !== "all") f = f.filter((m) => m.genresList?.includes(filters().genre));
    if (filters().platform !== "all") f = f.filter((m) => m.platformsList?.includes(filters().platform));
    if (filters().tag !== "all") f = f.filter((m) => m.tag === filters().tag);

    const inRange = (value: string | number | undefined, min: string, max: string) => {
      const n = Number(value);
      if (min !== "" && (isNaN(n) || n < Number(min))) return false;
      if (max !== "" && (isNaN(n) || n > Number(max))) return false;
      return true;
    };
    f = f.filter((m) => {
      const year = parseInt((m.release_date || m.first_air_date || "").substring(0, 4)) || NaN;
      const rt = Number((m.rtRating || "").replace("%", "")) || NaN;
      return (
        inRange(m.imdbRating, filters().imdbMin, filters().imdbMax) &&
        inRange(rt, filters().rtMin, filters().rtMax) &&
        inRange(year, filters().yearMin, filters().yearMax) &&
        inRange(m.runtime, filters().runtimeMin, filters().runtimeMax)
      );
    });

    return f.sort((a, b) => {
      if (filters().sort === "watch_desc" || filters().sort === "watch_asc") {
        const dA = resolveTimelineDate(a), dB = resolveTimelineDate(b);
        const hasA = dA !== null, hasB = dB !== null;
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        if (!hasA && !hasB) return 0;
        return filters().sort === "watch_desc"
          ? (dB!.getTime() - dA!.getTime())
          : (dA!.getTime() - dB!.getTime());
      }
      if (filters().sort === "year_desc") return (parseInt((b.release_date || b.first_air_date || "").substring(0, 4)) || 0) - (parseInt((a.release_date || a.first_air_date || "").substring(0, 4)) || 0);
      if (filters().sort === "rating_desc") return (b.rating || 0) - (a.rating || 0);
      if (filters().sort === "imdb_desc") return (parseFloat(b.imdbRating || "0") || 0) - (parseFloat(a.imdbRating || "0") || 0);
      if (filters().sort === "imdb_asc") return (parseFloat(a.imdbRating || "0") || 0) - (parseFloat(b.imdbRating || "0") || 0);
      if (filters().sort === "runtime_asc") return (a.runtime || 0) - (b.runtime || 0);
      if (filters().sort === "updated") return toAddedAtMs(b.updatedAt) - toAddedAtMs(a.updatedAt);
      if (filters().sort === "title_asc") return (a.title || a.name || "").localeCompare(b.title || b.name || "");
      return toAddedAtMs(b.addedAt) - toAddedAtMs(a.addedAt);
    });
  });

  const activeFilterCount = createMemo(
    () =>
      Object.entries(filters()).filter(([key, value]) => {
        if (key === "sort") return value !== "recent";
        return value !== "all" && value !== "";
      }).length
  );

  const chips = createMemo(() => {
    const f = filters();
    const chips = [];
    if (f.type !== "all") chips.push({ label: f.type === "movie" ? "Movies" : "Series", key: "type" });
    if (f.status !== "all") chips.push({ label: f.status, key: "status" });
    if (f.region !== "all") chips.push({ label: f.region, key: "region" });
    if (f.genre !== "all") chips.push({ label: f.genre, key: "genre" });
    if (f.platform !== "all") chips.push({ label: f.platform, key: "platform" });
    if (f.tag !== "all") chips.push({ label: f.tag, key: "tag" });
    if (f.imdbMin) chips.push({ label: `IMDb > ${f.imdbMin}`, key: "imdbMin" });
    if (f.imdbMax) chips.push({ label: `IMDb < ${f.imdbMax}`, key: "imdbMax" });
    if (f.rtMin) chips.push({ label: `RT > ${f.rtMin}`, key: "rtMin" });
    if (f.rtMax) chips.push({ label: `RT < ${f.rtMax}`, key: "rtMax" });
    if (f.yearMin) chips.push({ label: `Year > ${f.yearMin}`, key: "yearMin" });
    if (f.yearMax) chips.push({ label: `Year < ${f.yearMax}`, key: "yearMax" });
    if (f.runtimeMin) chips.push({ label: `RT > ${f.runtimeMin}m`, key: "runtimeMin" });
    if (f.runtimeMax) chips.push({ label: `RT < ${f.runtimeMax}m`, key: "runtimeMax" });
    return chips;
  });

  const clearFilter = (key: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: key.startsWith("imdb") || key.startsWith("rt") || key.startsWith("year") || key.startsWith("runtime") ? "" : "all"
    }));
  };

  const timelineItems = createMemo(() => filtered().filter((m) => m.status === "Completed" && resolveTimelineDate(m) !== null));

  const groupedTimeline = createMemo(() => {
    const list = timelineItems().slice(0, displayLimit());
    const groups: { label: string; items: WatchlistItem[] }[] = [];
    let currentGroup: { label: string; items: WatchlistItem[] } | null = null;
    list.forEach((m) => {
      const dateObj = resolveTimelineDate(m);
      const monthYear = !dateObj ? "Unknown Date" : dateObj.toLocaleString("en-US", { month: "long", year: "numeric" });
      if (!currentGroup || currentGroup.label !== monthYear) {
        currentGroup = { label: monthYear, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(m);
    });
    return groups;
  });

  const openMovie = (id: string) => {
    const item = watchlist().find((m) => m.id === id);
    if (item) setSelectedItem(item);
  };

  const handleLogin = async () => {
    try {
      await login();
      showToast("Signed in successfully! 🎬", "success");
    } catch {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  const clearFilters = () => {
    setFilters({ ...defaultFilters, status: "all" });
    clearSearch();
  };

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div class="px-5 max-w-2xl lg:max-w-none lg:px-12 mx-auto relative z-10 animate-fade-in" style={{ "padding-bottom": "var(--sp-10)" }}>
      {/* Sticky header — search + view toggle + filter chips */}
      <div
        class="sticky top-0 z-40 pt-4 pb-4 -mx-5 px-5 mb-6"
        style={{
          background: "rgba(5,6,10,0.88)",
          "backdrop-filter": "blur(24px)",
          "-webkit-backdrop-filter": "blur(24px)",
          "border-bottom": "1px solid var(--hairline)"
        }}
      >
        <VaultHeader
          viewMode={viewMode}
          setViewMode={setViewMode}
          activeFilterCount={activeFilterCount}
          onFilterClick={() => setShowFilter(true)}
        />
        <VaultSearch
          value={searchInput}
          onInput={onSearchInput}
          hasActiveFilters={() => activeFilterCount() > 0}
          onClearAll={clearFilters}
        />

        {/* Premium active filter chips */}
        <Show when={chips().length > 0}>
          <div class="flex gap-2 flex-wrap mt-3">
            <For each={chips()}>
              {(chip) => (
                <button
                  onClick={() => clearFilter(chip.key)}
                  class="filter-chip"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <Icon name="close" style="font-size: 12px" aria-hidden="true" />
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {filtered().length > 0 ? `${filtered().length} title${filtered().length !== 1 ? "s" : ""} found` : "No titles found"}
      </div>

      <Show
        when={!loading()}
        fallback={<LoadingSkeleton />}
      >
        <Show 
          when={!error()} 
          fallback={
            <EmptyState
              isGuest={false}
              onLogin={() => {}}
              title="Error Loading Vault"
              message={error() || "An unknown error occurred."}
              actionText="Reload Page"
              onAction={handleReload}
            />
          }
        >
          <Show when={viewMode() === "grid"}>
            <VaultGrid
              items={filtered().slice(0, displayLimit())}
              isGuest={isGuest()}
              search={search()}
              onOpenMovie={openMovie}
              onLogin={handleLogin}
              onClearFilters={clearFilters}
            />
            <Show when={filtered().length > displayLimit()}>
              <div class="flex items-center justify-center gap-2 py-8 type-caption" style="color: var(--p)">
                <Icon name="progress_activity" class="animate-spin text-sm" aria-hidden="true" />
                <span>Loading more titles…</span>
              </div>
            </Show>
          </Show>

          <Show when={viewMode() === "timeline"}>
            <Show
              when={timelineItems().length > 0}
              fallback={
                <EmptyState
                  isGuest={isGuest()}
                  onLogin={handleLogin}
                  title="No Dates Found"
                  message="Timeline shows completed titles with a Watch Date set. Add dates in the edit panel."
                  actionText="Clear Filters"
                  onAction={clearFilters}
                />
              }
            >
              <div class="relative space-y-8 animate-fade-in pb-10" role="feed" aria-label="Watch history timeline">
                {/* Premium timeline rail */}
                <div
                  class="timeline-rail"
                  aria-hidden="true"
                />
                <For each={groupedTimeline()}>
                  {(group) => (
                    <div class="relative" role="group" aria-label={group.label}>
                      {/* Premium sticky month pill */}
                      <div class="timeline-month-pill">
                        <Icon name="event" style="font-size: 14px; color: #05060a" aria-hidden="true" />
                        {group.label}
                      </div>
                      <div class="space-y-3 timeline-stagger">
                        <For each={group.items}>
                          {(m) => (
                            <VaultCard item={m} date={resolveTimelineDate(m)} onOpenMovie={openMovie} />
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      <Show when={showFilter()}>
        <Suspense fallback={
          <div class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in" style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px)">
            <div class="w-full max-w-sm p-10 flex justify-center">
              <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
            </div>
          </div>
        }>
          <VaultFilters
            filters={filters()}
            setFilters={(v) => {
              setFilters(v);
              setDisplayLimit(20);
            }}
            uniqueGenres={uniqueGenres()}
            uniquePlatforms={uniquePlatforms()}
            uniqueTags={uniqueTags()}
            onClose={() => setShowFilter(false)}
            onClear={() => {
              clearFilters();
              setDisplayLimit(20);
            }}
          />
        </Suspense>
      </Show>
    </div>
  );
}
