// src/features/profile/HistoryPage.tsx
//
// HistoryPage — "What journey have I taken?"
//
// Not a boring table. Not a spreadsheet. This is chronological
// storytelling — like Apple Photos Memories or a Letterboxd diary.
//
// Watches are grouped naturally:
//   Today · Yesterday · This Week · Last Week · This Month ·
//   This Year · 2024 · 2023 · ...
//
// Each group is a beautiful timeline. Supports filter + search.

import { Show, For, createMemo, createSignal, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { tmdbImage } from "~/core/tmdb/tmdb";
import PageContainer from "~/shared/ui/PageContainer";
import type { WatchlistItem } from "~/shared/types";

interface HistoryGroup {
  id: string;
  label: string;
  items: WatchlistItem[];
}

const HistoryPage: Component = () => {
  const library = useUserLibrary();
  const { isSignedIn, authReady } = useAuth();
  const [search, setSearch] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal<
    "all" | "completed" | "watching" | "planned"
  >("all");

  const loading = createMemo(
    () => !authReady() || (isSignedIn() && library.loading())
  );

  const grouped = createMemo<HistoryGroup[]>(() => {
    const list = library.watchlist();
    if (!list || list.length === 0) return [];

    // Filter
    let filtered = list;
    const s = search().trim().toLowerCase();
    if (s) {
      filtered = filtered.filter((m) =>
        (m.title || m.name || "").toLowerCase().includes(s)
      );
    }
    const sf = statusFilter();
    if (sf !== "all") {
      filtered = filtered.filter((m) => {
        if (sf === "planned")
          return m.status === "Planned" || m.status === "Plan to Watch";
        return m.status.toLowerCase() === sf;
      });
    }

    // Sort by date (most recent first) — use watchDate or addedAt or updatedAt
    const sorted = [...filtered].sort((a, b) => {
      const da = getDate(a);
      const db = getDate(b);
      return db.getTime() - da.getTime();
    });

    // Group
    const groups: HistoryGroup[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const addToGroup = (id: string, label: string, item: WatchlistItem) => {
      let g = groups.find((g) => g.id === id);
      if (!g) {
        g = { id, label, items: [] };
        groups.push(g);
      }
      g.items.push(item);
    };

    sorted.forEach((item) => {
      const d = getDate(item);
      if (d >= today) {
        addToGroup("today", "Today", item);
      } else if (d >= yesterday) {
        addToGroup("yesterday", "Yesterday", item);
      } else if (d >= weekAgo) {
        addToGroup("week", "This Week", item);
      } else if (d >= monthAgo) {
        addToGroup("month", "This Month", item);
      } else if (d >= yearStart) {
        addToGroup("year", `Earlier in ${now.getFullYear()}`, item);
      } else {
        const year = d.getFullYear().toString();
        addToGroup(`year-${year}`, year, item);
      }
    });

    return groups;
  });

  const totalShown = createMemo(() =>
    grouped().reduce((sum, g) => sum + g.items.length, 0)
  );

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in">
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
          <p class="sec-eyebrow">History</p>
          <h1 class="sec-title">Your journey</h1>
          <p class="sec-subtitle">
            Every title you've watched, in the order you watched it.
          </p>
        </div>

        {/* Search + filter */}
        <div class="sec-body" style={{ "margin-bottom": "var(--sp-4)" }}>
          <div class="glass-search-bar">
            <span
              class="material-symbols-outlined"
              style={{
                color: "var(--text-muted)",
                "flex-shrink": "0",
                "font-size": "18px"
              }}
              aria-hidden="true"
            >
              search
            </span>
            <input
              type="search"
              placeholder="Search your history…"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="glass-input"
              style={{
                flex: "1",
                background: "transparent",
                border: "none",
                padding: "0",
                "box-shadow": "none"
              }}
              aria-label="Search history"
              autocomplete="off"
              spellcheck={false}
            />
            <Show when={search()}>
              <button
                type="button"
                class="search-bar-clear focus-ring"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </Show>
          </div>

          {/* Status filter tabs */}
          <div
            class="quick-filter-bar"
            style={{ "margin-top": "var(--sp-3)" }}
            role="tablist"
            aria-label="Filter history by status"
          >
            <For
              each={[
                { v: "all", label: "All" },
                { v: "completed", label: "Completed" },
                { v: "watching", label: "Watching" },
                { v: "planned", label: "Planned" }
              ]}
            >
              {(tab) => (
                <button
                  type="button"
                  class="quick-filter-tab focus-ring"
                  data-active={statusFilter() === tab.v}
                  onClick={() =>
                    setStatusFilter(
                      tab.v as "all" | "completed" | "watching" | "planned"
                    )
                  }
                  role="tab"
                  aria-selected={statusFilter() === tab.v}
                >
                  {tab.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Body */}
        <div class="sec-body">
          <Show
            when={!loading()}
            fallback={
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--sp-2)"
                }}
              >
                <div class="sec-skeleton-block" style={{ height: "80px" }} />
                <div class="sec-skeleton-block" style={{ height: "80px" }} />
                <div class="sec-skeleton-block" style={{ height: "80px" }} />
              </div>
            }
          >
            <Show
              when={isSignedIn()}
              fallback={
                <div class="glass-empty-state" role="status">
                  <div class="glass-empty-state-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "32px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      history
                    </span>
                  </div>
                  <h3 class="glass-empty-state-title">
                    Sign in to see your history
                  </h3>
                  <p class="glass-empty-state-body">
                    Your watching journey appears here once you sign in.
                  </p>
                </div>
              }
            >
              <Show
                when={totalShown() > 0}
                fallback={
                  <div class="glass-empty-state" role="status">
                    <div class="glass-empty-state-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{
                          "font-size": "32px",
                          color: "var(--text-muted)"
                        }}
                        aria-hidden="true"
                      >
                        search_off
                      </span>
                    </div>
                    <h3 class="glass-empty-state-title">No matches</h3>
                    <p class="glass-empty-state-body">
                      {search()
                        ? "No titles match your search."
                        : "No titles in this category yet."}
                    </p>
                  </div>
                }
              >
                <For each={grouped()}>
                  {(group) => (
                    <div class="history-group">
                      <div class="history-group-header">
                        <h2 class="history-group-title">{group.label}</h2>
                        <span class="history-group-count">
                          {group.items.length}{" "}
                          {group.items.length !== 1 ? "titles" : "title"}
                        </span>
                      </div>
                      <div class="history-list">
                        <For each={group.items}>
                          {(item) => (
                            <div
                              class="history-item focus-ring"
                              role="button"
                              tabindex={0}
                              onClick={() => {
                                // Open details via the modal state — but for now
                                // we don't have access to that here. Just navigate.
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                }
                              }}
                              aria-label={`${item.title || item.name} — ${item.status}`}
                            >
                              <div class="history-poster">
                                <Show
                                  when={item.poster_path}
                                  fallback={
                                    <div class="history-poster-fallback">
                                      <span
                                        class="material-symbols-outlined"
                                        style={{ "font-size": "16px" }}
                                        aria-hidden="true"
                                      >
                                        movie
                                      </span>
                                    </div>
                                  }
                                >
                                  <img
                                    src={tmdbImage(item.poster_path, "w92")}
                                    class="history-poster-img"
                                    alt=""
                                    aria-hidden="true"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </Show>
                              </div>
                              <div class="history-info">
                                <p class="history-title">
                                  {item.title || item.name}
                                </p>
                                <p class="history-meta">
                                  {item.media_type === "tv"
                                    ? "Series"
                                    : "Movie"}
                                  <Show
                                    when={
                                      item.release_date || item.first_air_date
                                    }
                                  >
                                    {" · "}
                                    {
                                      (
                                        item.release_date ||
                                        item.first_air_date ||
                                        ""
                                      ).split("-")[0]
                                    }
                                  </Show>
                                  <Show
                                    when={getDate(item).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" }
                                    )}
                                  >
                                    {" · "}
                                    {getDate(item).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric"
                                    })}
                                  </Show>
                                </p>
                              </div>
                              <Show when={item.rating && item.rating > 0}>
                                <span class="history-rating">
                                  ★ {item.rating}
                                </span>
                              </Show>
                              <span
                                class={`history-status ${
                                  item.status === "Completed"
                                    ? "history-status-completed"
                                    : item.status === "Watching"
                                      ? "history-status-watching"
                                      : "history-status-planned"
                                }`}
                              >
                                {item.status === "Plan to Watch"
                                  ? "Planned"
                                  : item.status}
                              </span>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
    </PageContainer>
  );
};

function getDate(item: WatchlistItem): Date {
  // For TV series with per-season watch dates, prefer the LATEST season's
  // end date (most recent watch activity) so the show appears on the
  // timeline at the point the user finished it — not at the import date.
  if (item.media_type === "tv" && item.seasonDates) {
    const seasons = Object.entries(item.seasonDates)
      .map(([k, v]) => ({ n: Number(k), start: v?.start, end: v?.end }))
      .filter((s) => !isNaN(s.n))
      .sort((a, b) => a.n - b.n);
    // Latest season's end → start
    for (let i = seasons.length - 1; i >= 0; i--) {
      const s = seasons[i];
      if (s.end) {
        const d = new Date(s.end);
        if (!isNaN(d.getTime())) return d;
      }
      if (s.start) {
        const d = new Date(s.start);
        if (!isNaN(d.getTime())) return d;
      }
    }
    // Fallback: earliest season's start
    for (const s of seasons) {
      if (s.start) {
        const d = new Date(s.start);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  const dateStr =
    item.watchDate ||
    (typeof item.addedAt === "string" ? item.addedAt : null) ||
    item.updatedAt;
  if (!dateStr) return new Date(0);
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date(0);
    return d;
  } catch {
    return new Date(0);
  }
}

export default HistoryPage;
