// src/features/profile/StatsPage.tsx
//
// StatsPage — "How do I watch?"
//
// NOT "How much have I watched?" — that's a dashboard. This page turns
// numbers into stories. Every section answers a question about the
// user's cinematic personality.
//
// Sections:
//   1. Hero stat — total titles (the single most important number)
//   2. Quick stats grid — watching, completed, planned, runtime
//   3. Movie vs TV ratio — who are you as a viewer?
//   4. Top genres — your taste profile
//   5. Release decades — what era of cinema do you love?
//   6. Favorite directors — whose work do you follow?
//   7. Completion heatmap — your watching rhythm (last 365 days)
//   8. Monthly trends — last 12 months
//   9. Weekend vs weekday — when do you watch?
//  10. Personal records — top rated, avg rating

import { Show, For, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useStats } from "./useStats";
import { useAuth } from "~/shared/hooks/useAuth";
import PageContainer from "~/shared/ui/PageContainer";
import { tmdbImage } from "~/core/tmdb/tmdb";

const StatsPage: Component = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { stats, watchlist } = useStats();

  const loading = createMemo(() => watchlist().length === 0 && isSignedIn());

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in">
        {/* Header */}
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Statistics</p>
          <h1 class="sec-title">How you watch</h1>
          <p class="sec-subtitle">
            Your cinematic personality, told in stories — not spreadsheets.
          </p>
        </div>

        <div class="sec-body">
          <Show when={!loading()} fallback={
            <div class="sec-skeleton-block" style={{ height: "200px", "margin-top": "var(--sp-6)" }} />
          }>
            <Show when={stats()} fallback={
              /* Empty state */
              <div class="empty-premium" style={{ "margin-top": "var(--sp-8)" }} role="status">
                <div class="empty-premium-icon" aria-hidden="true">
                  <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                    insights
                  </span>
                </div>
                <h3 class="empty-premium-title">No statistics yet</h3>
                <p class="empty-premium-body">
                  Add titles to your watchlist and your cinematic story will appear here.
                </p>
                <a href="/search" class="btn-primary focus-ring" style={{ "margin-top": "var(--sp-2)" }}>
                  Find titles to watch
                </a>
              </div>
            }>
              {/* === 1. HERO STAT === */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <div class="stat-hero">
                  <p class="stat-hero-label">Total Titles</p>
                  <p class="stat-hero-value">{stats()!.total}</p>
                  <p class="stat-hero-sub">
                    {stats()!.completed} completed · {stats()!.watching} watching · {stats()!.planned} planned
                  </p>
                </div>
              </section>

              {/* === 2. QUICK STATS GRID === */}
              <section class="sec-section">
                <p class="sec-section-label">At a glance</p>
                <div class="stat-grid">
                  <div class="stat-cell">
                    <p class="stat-cell-value stat-cell-value-accent">{stats()!.totalRuntimeHours}</p>
                    <p class="stat-cell-label">Hours Watched</p>
                    <p class="stat-cell-sub">{stats()!.totalRuntimeMinutes.toLocaleString()} minutes</p>
                  </div>
                  <div class="stat-cell">
                    <p class="stat-cell-value">{stats()!.completed}</p>
                    <p class="stat-cell-label">Completed</p>
                    <p class="stat-cell-sub">
                      {stats()!.total > 0 ? Math.round((stats()!.completed / stats()!.total) * 100) : 0}% of library
                    </p>
                  </div>
                  <div class="stat-cell">
                    <p class="stat-cell-value">{stats()!.avgRating || "—"}</p>
                    <p class="stat-cell-label">Avg Rating</p>
                    <p class="stat-cell-sub">out of 10</p>
                  </div>
                  <div class="stat-cell">
                    <p class="stat-cell-value">{stats()!.topGenres.length}</p>
                    <p class="stat-cell-label">Genres</p>
                    <p class="stat-cell-sub">in your taste</p>
                  </div>
                </div>
              </section>

              {/* === 3. MOVIE VS TV RATIO === */}
              <section class="sec-section">
                <p class="sec-section-label">Movie vs Series</p>
                <div class="insight-card">
                  <div class="insight-card-header">
                    <div class="insight-card-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        pie_chart
                      </span>
                    </div>
                    <p class="insight-card-title">Your content split</p>
                  </div>
                  <p class="insight-card-body">
                    You watch <strong>{stats()!.moviePct}%</strong> movies and{" "}
                    <strong>{stats()!.tvPct}%</strong> series.{" "}
                    <Show when={stats()!.moviePct > 60}>
                      <span class="accent">You're a film lover at heart.</span>
                    </Show>
                    <Show when={stats()!.tvPct > 60}>
                      <span class="accent">You love long-form storytelling.</span>
                    </Show>
                    <Show when={stats()!.moviePct >= 40 && stats()!.moviePct <= 60}>
                      <span class="accent">You enjoy both equally.</span>
                    </Show>
                  </p>
                  <div style={{ "margin-top": "var(--sp-4)" }}>
                    <div class="ratio-bar">
                      <div class="ratio-bar-segment ratio-bar-movie" style={{ width: `${stats()!.moviePct}%` }} />
                      <div class="ratio-bar-segment ratio-bar-tv" style={{ width: `${stats()!.tvPct}%` }} />
                    </div>
                    <div class="ratio-labels">
                      <span class="ratio-label"><strong>{stats()!.movieCount}</strong> Movies</span>
                      <span class="ratio-label"><strong>{stats()!.tvCount}</strong> Series</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* === 4. TOP GENRES === */}
              <Show when={stats()!.topGenres.length > 0}>
                <section class="sec-section">
                  <p class="sec-section-label">Your taste profile</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          palette
                        </span>
                      </div>
                      <p class="insight-card-title">Top genres</p>
                    </div>
                    <div class="genre-bars" style={{ "margin-top": "var(--sp-3)" }}>
                      <For each={stats()!.topGenres}>
                        {(genre) => (
                          <div class="genre-bar-row">
                            <span class="genre-bar-name">{genre.name}</span>
                            <div class="genre-bar-track">
                              <div class="genre-bar-fill" style={{ width: `${genre.pct}%` }} />
                            </div>
                            <span class="genre-bar-count">{genre.count}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </section>
              </Show>

              {/* === 5. RELEASE DECADES === */}
              <Show when={stats()!.decades.length > 0}>
                <section class="sec-section">
                  <p class="sec-section-label">Era of cinema</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          history
                        </span>
                      </div>
                      <p class="insight-card-title">
                        You love the <span style={{ color: "var(--p)" }}>{stats()!.favoriteDecade}</span>
                      </p>
                    </div>
                    <p class="insight-card-body" style={{ "margin-bottom": "var(--sp-4)" }}>
                      Your watchlist spans {stats()!.decades.length} decades of cinema.
                    </p>
                    <div class="decade-grid">
                      <For each={stats()!.decades}>
                        {(d) => (
                          <div class="decade-cell">
                            <p class="decade-cell-year">{d.decade}</p>
                            <p class="decade-cell-count">{d.count} titles</p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </section>
              </Show>

              {/* === 6. FAVORITE DIRECTORS === */}
              <Show when={stats()!.topDirectors.length > 0}>
                <section class="sec-section">
                  <p class="sec-section-label">Auteurs you follow</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          person
                        </span>
                      </div>
                      <p class="insight-card-title">Most-watched directors</p>
                    </div>
                    <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)", "margin-top": "var(--sp-2)" }}>
                      <For each={stats()!.topDirectors}>
                        {(dir) => (
                          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", padding: "var(--sp-2) 0", "border-bottom": "1px solid var(--hairline)" }}>
                            <span style={{ "font-family": "'Outfit', sans-serif", "font-size": "0.875rem", "font-weight": 600, color: "var(--text-body)" }}>
                              {dir.name}
                            </span>
                            <span style={{ "font-family": "'Azeret Mono', monospace", "font-size": "0.625rem", "font-weight": 700, color: "var(--p)" }}>
                              {dir.count} {dir.count !== 1 ? "titles" : "title"}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </section>
              </Show>

              {/* === 7. COMPLETION HEATMAP === */}
              <Show when={stats()!.heatmap.some((d) => d.level > 0)}>
                <section class="sec-section">
                  <p class="sec-section-label">Your watching rhythm</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          calendar_view_month
                        </span>
                      </div>
                      <p class="insight-card-title">Last 365 days</p>
                    </div>
                    <div class="heatmap" style={{ "margin-top": "var(--sp-3)" }}>
                      {/* Render as weeks (columns) of 7 days (rows) */}
                      {(() => {
                        const weeks = [];
                        const heat = stats()!.heatmap;
                        for (let w = 0; w < Math.ceil(heat.length / 7); w++) {
                          const week = heat.slice(w * 7, w * 7 + 7);
                          weeks.push(week);
                        }
                        return weeks.map((week) => (
                          <div class="heatmap-row">
                            {week.map((day) => (
                              <div
                                class={`heatmap-cell heatmap-cell-${day.level}`}
                                title={`${day.date}: ${day.level} watches`}
                              />
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                    <div class="heatmap-legend">
                      <span>Less</span>
                      <div class="heatmap-cell" />
                      <div class="heatmap-cell heatmap-cell-1" />
                      <div class="heatmap-cell heatmap-cell-2" />
                      <div class="heatmap-cell heatmap-cell-3" />
                      <div class="heatmap-cell heatmap-cell-4" />
                      <span>More</span>
                    </div>
                  </div>
                </section>
              </Show>

              {/* === 8. MONTHLY TRENDS === */}
              <Show when={stats()!.monthlyCounts.some((m) => m.count > 0)}>
                <section class="sec-section">
                  <p class="sec-section-label">Monthly trends</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          trending_up
                        </span>
                      </div>
                      <p class="insight-card-title">Last 12 months</p>
                    </div>
                    <div style={{ display: "flex", "align-items": "flex-end", gap: "4px", height: "80px", "margin-top": "var(--sp-4)" }}>
                      <For each={stats()!.monthlyCounts}>
                        {(m) => {
                          const max = Math.max(...stats()!.monthlyCounts.map((x) => x.count), 1);
                          const h = Math.max(4, (m.count / max) * 70);
                          return (
                            <div style={{ flex: "1", display: "flex", "flex-direction": "column", "align-items": "center", gap: "4px" }}>
                              <div
                                style={{
                                  width: "100%",
                                  height: `${h}px`,
                                  "border-radius": "var(--radius-sm)",
                                  background: m.count > 0 ? "linear-gradient(to top, var(--p), var(--p2))" : "var(--tier-3)",
                                  "box-shadow": m.count > 0 ? "0 0 8px var(--p-glow)" : "none",
                                  transition: "height 600ms var(--ease-smooth)",
                                }}
                                title={`${m.month}: ${m.count} titles`}
                              />
                              <span style={{ "font-family": "'Azeret Mono', monospace", "font-size": "0.5rem", color: "var(--text-muted)", "text-transform": "uppercase" }}>
                                {m.month}
                              </span>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </section>
              </Show>

              {/* === 9. WEEKEND VS WEEKDAY === */}
              <Show when={stats()!.weekdayVsWeekend.weekday + stats()!.weekdayVsWeekend.weekend > 0}>
                <section class="sec-section">
                  <p class="sec-section-label">When you watch</p>
                  <div class="insight-card">
                    <div class="insight-card-header">
                      <div class="insight-card-icon" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                          schedule
                        </span>
                      </div>
                      <p class="insight-card-title">Weekend vs weekday</p>
                    </div>
                    <p class="insight-card-body">
                      <Show when={stats()!.weekdayVsWeekend.weekend > stats()!.weekdayVsWeekend.weekday}>
                        <span class="accent">You're a weekend watcher.</span>{" "}
                      </Show>
                      <Show when={stats()!.weekdayVsWeekend.weekday > stats()!.weekdayVsWeekend.weekend}>
                        <span class="accent">You watch throughout the week.</span>{" "}
                      </Show>
                      {stats()!.weekdayVsWeekend.weekday} weekday watches · {stats()!.weekdayVsWeekend.weekend} weekend watches
                    </p>
                  </div>
                </section>
              </Show>

              {/* === 10. TOP RATED === */}
              <Show when={stats()!.topRated}>
                <section class="sec-section">
                  <p class="sec-section-label">Your highest rated</p>
                  <div class="insight-card">
                    <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)" }}>
                      <div style={{ width: "48px", height: "72px", "border-radius": "var(--radius-sm)", overflow: "hidden", "background": "var(--tier-3)", "flex-shrink": 0, border: "1px solid var(--hairline)" }}>
                        <Show when={stats()!.topRated!.poster_path} fallback={
                          <div style={{ width: "100%", height: "100%", display: "flex", "align-items": "center", "justify-content": "center", color: "var(--text-dim)" }}>
                            <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">movie</span>
                          </div>
                        }>
                          <img
                            src={tmdbImage(stats()!.topRated!.poster_path, "w185")}
                            style={{ width: "100%", height: "100%", "object-fit": "cover" }}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                          />
                        </Show>
                      </div>
                      <div style={{ flex: "1", "min-width": "0" }}>
                        <p style={{ "font-family": "'Outfit', sans-serif", "font-size": "0.9375rem", "font-weight": 700, color: "var(--text-strong)", margin: "0", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                          {stats()!.topRated!.title || stats()!.topRated!.name}
                        </p>
                        <p style={{ "font-family": "'Azeret Mono', monospace", "font-size": "0.5625rem", "font-weight": 700, color: "var(--text-muted)", margin: "2px 0 0", "letter-spacing": "0.1em", "text-transform": "uppercase" }}>
                          Your rating: <span style={{ color: "#f5c518" }}>★ {stats()!.topRated!.rating}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
    </PageContainer>
  );
};

export default StatsPage;
