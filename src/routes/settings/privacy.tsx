// src/routes/settings/privacy.tsx
//
// Privacy — fully redesigned with REAL controls.
//
// Controls:
//   • Privacy promise (existing read-only card)
//   • Profile visibility (always private, with future opt-in notice)
//   • Hide ratings in screenshots (toggle + visibilitychange listener)
//   • Adult content filter (link to Content & Discover)
//   • Clear search history (real — wipes localStorage search keys)
//   • Clear cache (real — wipes IndexedDB + localStorage TMDB keys)
//   • Data storage explanation (existing read-only)
//   • Export data (link to Sync)
//   • Delete account (link to Account)
//
// All toggles persisted via src/core/preferences.

import { Title } from "@solidjs/meta";
import { Show, createSignal, onMount, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { ToggleRow } from "~/features/settings/sharedControls";
import { useToast } from "~/shared/hooks/useToast";
import {
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots,
  adultContentFilter
} from "~/core/preferences";
import {
  clearSearchHistory,
  clearTmdbCache,
  getStorageBreakdown,
  formatBytes
} from "~/shared/utils/clearStorage";

const PrivacyRoute: Component = () => {
  const { showToast } = useToast();
  const [clearingHistory, setClearingHistory] = createSignal(false);
  const [clearingCache, setClearingCache] = createSignal(false);
  const [breakdown, setBreakdown] = createSignal(getStorageBreakdown());

  onMount(() => {
    // Refresh breakdown on mount in case other tabs modified storage
    setBreakdown(getStorageBreakdown());
  });

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const removed = clearSearchHistory();
      setBreakdown(getStorageBreakdown());
      showToast(
        removed > 0
          ? `Cleared ${removed} search history entries`
          : "No search history to clear",
        "success",
        1800
      );
    } catch (e) {
      console.error("[privacy] clear history failed:", e);
      showToast("Failed to clear search history.", "error");
    } finally {
      setClearingHistory(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const removed = await clearTmdbCache();
      setBreakdown(getStorageBreakdown());
      showToast(
        removed > 0 ? `Cleared ${removed} cache entries` : "No cache to clear",
        "success",
        1800
      );
    } catch (e) {
      console.error("[privacy] clear cache failed:", e);
      showToast("Failed to clear cache.", "error");
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <>
      <Title>CineLog — Privacy</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a
              href="/settings"
              class="sec-back focus-ring"
              aria-label="Back to settings"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px" }}
                aria-hidden="true"
              >
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Privacy</h1>
            <p class="sec-subtitle">
              Your data is yours. CineLog is personal, not social.
            </p>
          </div>

          <div class="sec-body">
            {/* Privacy promise */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <div class="insight-card">
                <div class="insight-card-header">
                  <div class="insight-card-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      shield
                    </span>
                  </div>
                  <p class="insight-card-title">Your data stays yours</p>
                </div>
                <p class="insight-card-body">
                  CineLog is a <strong>single-player tracking app</strong>. Your
                  watchlist, ratings, and profile are visible only to you.{" "}
                  <span class="accent">
                    No followers, no public feed, no social graph.
                  </span>
                  We don't sell your data. We don't show ads. We don't track you
                  across other sites.
                </p>
              </div>
            </section>

            {/* Visibility */}
            <section class="sec-section">
              <p class="sec-section-label">Visibility</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      visibility_off
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Profile</span>
                    <span class="setting-row-desc">
                      Visible only to you — no public profile page
                    </span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>
                    Private
                  </span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      lock
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Watchlist</span>
                    <span class="setting-row-desc">
                      No one else can see what you watch
                    </span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>
                    Private
                  </span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      block
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Search engines</span>
                    <span class="setting-row-desc">
                      CineLog pages are not indexed by Google/Bing
                    </span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>
                    Hidden
                  </span>
                </div>
              </div>
            </section>

            {/* Screenshot privacy */}
            <section class="sec-section">
              <p class="sec-section-label">Screenshot Privacy</p>
              <div class="setting-group">
                <ToggleRow
                  icon="screenshot"
                  label="Hide ratings in screenshots"
                  desc="When you switch apps or take a screenshot, ratings blur automatically. Useful for sharing screenshots without revealing your taste."
                  current={hideRatingsInScreenshots}
                  onChange={(v) => {
                    setHideRatingsInScreenshots(v);
                    showToast(
                      v
                        ? "Ratings will blur in app switcher"
                        : "Ratings visible normally",
                      "info",
                      1500
                    );
                  }}
                />
              </div>
              <div class="info-callout" style={{ "margin-top": "var(--sp-3)" }}>
                <span
                  class="material-symbols-outlined info-callout-icon"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  info
                </span>
                <p class="info-callout-body">
                  <strong>How it works:</strong> When you switch away from
                  CineLog (or open the app switcher), the browser fires a{" "}
                  <code>visibilitychange</code> event. CineLog then adds a CSS
                  class that blurs all rating pills + rating badges. When you
                  come back, the blur is removed. This is best-effort — some
                  platforms (iOS Safari) may not fire the event reliably.
                </p>
              </div>
            </section>

            {/* Adult content (cross-link) */}
            <section class="sec-section">
              <p class="sec-section-label">Content Filter</p>
              <div class="setting-group">
                <a
                  href="/settings/content-discover"
                  class="setting-row focus-ring"
                  aria-label="Manage adult content filter"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      no_adult_content
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Adult content filter</span>
                    <span class="setting-row-desc">
                      Currently:{" "}
                      <strong
                        style={{
                          color: adultContentFilter()
                            ? "#4ade80"
                            : "var(--text-muted)"
                        }}
                      >
                        {adultContentFilter() ? "On (hidden)" : "Off (visible)"}
                      </strong>
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </a>
              </div>
            </section>

            {/* Data management — real clear buttons */}
            <section class="sec-section">
              <p class="sec-section-label">Data On This Device</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      history
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Search history</span>
                    <span class="setting-row-desc">
                      {breakdown().searchHistoryKeys} entries · stored locally
                    </span>
                  </div>
                  <button
                    type="button"
                    class="settings-link-btn focus-ring"
                    onClick={handleClearHistory}
                    disabled={
                      clearingHistory() || breakdown().searchHistoryKeys === 0
                    }
                  >
                    <Show when={!clearingHistory()} fallback="Clearing…">
                      Clear
                    </Show>
                  </button>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      cached
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">TMDB cache</span>
                    <span class="setting-row-desc">
                      {breakdown().tmdbCacheKeys} entries ·{" "}
                      {formatBytes(breakdown().approxBytes)} total
                    </span>
                  </div>
                  <button
                    type="button"
                    class="settings-link-btn focus-ring"
                    onClick={handleClearCache}
                    disabled={clearingCache()}
                  >
                    <Show when={!clearingCache()} fallback="Clearing…">
                      Clear
                    </Show>
                  </button>
                </div>
              </div>
            </section>

            {/* Data storage (read-only) */}
            <section class="sec-section">
              <p class="sec-section-label">Data Storage</p>
              <div class="setting-group">
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      cloud
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Supabase (PostgreSQL)</span>
                    <span class="setting-row-desc">
                      Your watchlist, profile, collections — encrypted at rest
                    </span>
                  </div>
                  <span class="setting-row-value" style={{ color: "#4ade80" }}>
                    Secured
                  </span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      movie
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">TMDB API</span>
                    <span class="setting-row-desc">
                      Movie/TV metadata — fetched read-only, cached locally
                    </span>
                  </div>
                  <span class="setting-row-value">Read-only</span>
                </div>
                <div class="setting-row" style={{ cursor: "default" }}>
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      storage
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Local Storage</span>
                    <span class="setting-row-desc">
                      Theme preference + search history — on this device only
                    </span>
                  </div>
                  <span class="setting-row-value">Device-only</span>
                </div>
              </div>
            </section>

            {/* Your rights */}
            <section class="sec-section">
              <p class="sec-section-label">Your Rights</p>
              <div class="setting-group">
                <a
                  href="/settings/sync"
                  class="setting-row focus-ring"
                  aria-label="Export your data"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      download
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Export Your Data</span>
                    <span class="setting-row-desc">
                      Download your full watchlist as JSON or CSV
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </a>
                <a
                  href="/settings/account"
                  class="setting-row focus-ring setting-row-danger"
                  aria-label="Delete your account"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      delete_forever
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Delete Account</span>
                    <span class="setting-row-desc">
                      Permanently remove all your data
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </a>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default PrivacyRoute;
