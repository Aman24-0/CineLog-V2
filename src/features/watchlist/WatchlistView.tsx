// src/features/watchlist/WatchlistView.tsx
import { createSignal, createEffect, createMemo, For, Show, onMount, onCleanup, lazy, Suspense } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import Icon from "~/shared/ui/Icon";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useToast } from "~/shared/hooks/useToast";
import { login } from "~/core/firebase/auth";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "./useVault";
import { useVaultSections } from "./useVaultSections";
import { isWatchable } from "~/shared/utils/progress";
import { resolveTimelineDate } from "~/shared/utils/date";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
import VaultHeader from "./components/VaultHeader";
import VaultSearch from "./components/VaultSearch";
import VaultShelf from "./components/VaultShelf";
import VaultCard from "./components/VaultCard";
import QuickFilterTabs from "./components/QuickFilterTabs";
import EmptyState from "./components/EmptyState";
import LoadingSkeleton from "./components/LoadingSkeleton";

const VaultFilters = lazy(() => import("./components/VaultFilters"));

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
  const { openTitle } = useModalState();
  const { watchlist, loading, isGuest, error } = useVault();

  const [searchInput, setSearchInput] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [filters, setFilters] = createSignal<VaultFilters>(defaultFilters);
  const [showFilter, setShowFilter] = createSignal(false);
  const [displayLimit, setDisplayLimit] = createSignal(20);
  const [viewMode, setViewMode] = createSignal<"grid" | "timeline">("grid");
  const [activeStatusTab, setActiveStatusTab] = createSignal("all");
  const [expandedShelves, setExpandedShelves] = createSignal<Set<string>>(new Set());

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setSearch(v);
      setDisplayLimit(30);
    }, 120);
  };

  const clearSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    setSearchInput("");
    setSearch("");
  };

  // Read ?status= from URL (set by Dashboard stat cards)
  createEffect(() => {
    const status = searchParams.status;
    if (typeof status === "string" && status) {
      const next = status === "all" ? "all" : status;
      setFilters((prev) => (prev.status === next ? prev : { ...prev, status: next }));
      // Also set the quick-filter tab to match
      if (status === "Watching" || status === "Planned" || status === "Completed") {
        setActiveStatusTab(status);
      }
    }
  });

  // View mode effect — timeline forces Completed + watch_desc
  let prevViewMode = "grid";
  createEffect(() => {
    const mode = viewMode();
    if (mode === "timeline" && prevViewMode !== "timeline") {
      setFilters({ ...defaultFilters, status: "Completed", sort: "watch_desc" });
      setActiveStatusTab("Completed");
    } else if (mode === "grid" && prevViewMode === "timeline") {
      setFilters({ ...defaultFilters, status: "all", sort: "recent" });
      setActiveStatusTab("all");
    }
    prevViewMode = mode;
  });

  // Infinite scroll
  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      setDisplayLimit((prev) => prev + 20);
    }
  };
  onMount(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", handleScroll));
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

  // Filtered items — applies search + advanced filters + quick-filter tab
  const filtered = createMemo(() => {
    let f = watchlist();
    if (search()) {
      const s = search().toLowerCase().trim();
      f = f.filter((m) => {
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

    // Quick-filter tab overrides status filter
    const effectiveStatus = activeStatusTab() !== "all" ? activeStatusTab() : filters().status;

    if (effectiveStatus === "in-progress") {
      f = f.filter(isWatchable);
    } else if (effectiveStatus !== "all") {
      f = f.filter((m) => m.status === effectiveStatus || (effectiveStatus === "Planned" && m.status === "Plan to Watch"));
    }

    if (filters().type !== "all") f = f.filter((m) => m.media_type === filters().type);
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

  // Determine if we're in flat mode (search active, advanced filters, or specific status tab)
  const hasAdvancedFilters = createMemo(() => {
    const f = filters();
    return f.type !== "all" || f.region !== "all" || f.genre !== "all" ||
      f.platform !== "all" || f.tag !== "all" || f.sort !== "recent" ||
      f.imdbMin !== "" || f.imdbMax !== "" || f.rtMin !== "" || f.rtMax !== "" ||
      f.yearMin !== "" || f.yearMax !== "" || f.runtimeMin !== "" || f.runtimeMax !== "";
  });

  const isFlatMode = createMemo(() => {
    return search().length > 0 || hasAdvancedFilters() || activeStatusTab() !== "all";
  });

  // Sections hook — adaptive shelves with deduplication
  const { sections } = useVaultSections({
    watchlist: filtered,
    flatMode: isFlatMode
  });

  const activeFilterCount = createMemo(() => {
    let count = 0;
    const f = filters();
    if (f.type !== "all") count++;
    if (f.region !== "all") count++;
    if (f.genre !== "all") count++;
    if (f.platform !== "all") count++;
    if (f.tag !== "all") count++;
    if (f.sort !== "recent") count++;
    if (f.imdbMin || f.imdbMax) count++;
    if (f.rtMin || f.rtMax) count++;
    if (f.yearMin || f.yearMax) count++;
    if (f.runtimeMin || f.runtimeMax) count++;
    return count;
  });

  const chips = createMemo(() => {
    const f = filters();
    const chips = [];
    if (f.type !== "all") chips.push({ label: f.type === "movie" ? "Movies" : "Series", key: "type" });
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

  // Timeline items (for timeline view mode)
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
    if (item) openTitle(item, watchlist());
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
    setActiveStatusTab("all");
    clearSearch();
  };

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const toggleShelfExpand = (shelfId: string) => {
    setExpandedShelves((prev) => {
      const next = new Set(prev);
      if (next.has(shelfId)) {
        next.delete(shelfId);
      } else {
        next.add(shelfId);
      }
      return next;
    });
  };

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      {/* Sticky header */}
      <div
        class="sticky top-0 z-40 pt-4 pb-3 -mx-5 px-5 mb-4"
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
          hasActiveFilters={() => activeFilterCount() > 0 || activeStatusTab() !== "all"}
          onClearAll={clearFilters}
        />

        {/* Quick-filter tabs (only in grid mode) */}
        <Show when={viewMode() === "grid"}>
          <div style={{ "margin-top": "0.75rem" }}>
            <QuickFilterTabs
              active={activeStatusTab}
              onSelect={(status) => {
                setActiveStatusTab(status);
                if (status === "all") {
                  setFilters((prev) => ({ ...prev, status: "all" }));
                } else if (status === "in-progress") {
                  // Virtual status — don't set filters.status, handled in filtered memo
                  setFilters((prev) => ({ ...prev, status: "all" }));
                } else {
                  setFilters((prev) => ({ ...prev, status }));
                }
              }}
              watchlist={watchlist}
            />
          </div>
        </Show>

        {/* Active filter chips */}
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

      {/* Result count context bar (flat mode only) */}
      <Show when={isFlatMode() && !loading()}>
        <div class="vault-context-bar">
          <span class="vault-context-count">
            <strong>{filtered().length}</strong> title{filtered().length !== 1 ? "s" : ""}
            <Show when={search()}> for "{search()}"</Show>
          </span>
          <Show when={activeStatusTab() !== "all"}>
            <button
              class="vault-shelf-action"
              onClick={() => {
                setActiveStatusTab("all");
                setFilters((prev) => ({ ...prev, status: "all" }));
              }}
            >
              Clear filter
            </button>
          </Show>
        </div>
      </Show>

      {/* Content */}
      <Show when={!loading()} fallback={<LoadingSkeleton />}>
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
          {/* Timeline view */}
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
                <div class="timeline-rail" aria-hidden="true" />
                <For each={groupedTimeline()}>
                  {(group) => (
                    <div class="relative" role="group" aria-label={group.label}>
                      <div class="timeline-month-pill">
                        <Icon name="event" style="font-size: 14px; color: var(--active-text)" aria-hidden="true" />
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

          {/* Grid view — shelves or flat grid */}
          <Show when={viewMode() === "grid"}>
            <Show when={filtered().length > 0} fallback={
              <EmptyState
                isGuest={isGuest()}
                onLogin={handleLogin}
                title={isGuest() ? "Vault is Empty" : "No Matches"}
                message={isGuest() ? "Sign in to start tracking movies and series." : "No titles match your current filters. Try adjusting or clearing them."}
                actionText={isGuest() ? "Sign In to Begin" : "Clear Filters"}
                onAction={isGuest() ? handleLogin : clearFilters}
              />
            }>
              {/* Adaptive shelves (default) or flat grid (search/filter mode) */}
              <For each={sections()}>
                {(section) => (
                  <VaultShelf
                    section={section}
                    search={search}
                    onOpenMovie={openMovie}
                    expanded={expandedShelves().has(section.id)}
                    onToggleExpand={() => toggleShelfExpand(section.id)}
                  />
                )}
              </For>

              {/* Infinite scroll indicator (flat mode only) */}
              <Show when={isFlatMode() && filtered().length > displayLimit()}>
                <div class="flex items-center justify-center gap-2 py-8 type-caption" style="color: var(--p)">
                  <Icon name="progress_activity" class="animate-spin text-sm" aria-hidden="true" />
                  <span>Loading more titles…</span>
                </div>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>

      {/* Filter drawer — rendered via Portal at body level so the fixed
          bottom nav can never cover the Apply / Clear buttons. */}
      <Show when={showFilter()}>
        <Suspense fallback={
          <div class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
            style={{
              background: "rgba(0,0,0,0.75)",
              "backdrop-filter": "blur(8px)",
              "padding-bottom": "var(--nav-total-height)"
            }}
          >
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
    </PageContainer>
  );
}
