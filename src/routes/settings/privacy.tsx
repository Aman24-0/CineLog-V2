// src/routes/settings/privacy.tsx
//
// Privacy — visibility, screenshot privacy, search history, account deletion.
//
// All technical noise (TMDB, Supabase, cache size, data-storage layers) has
// been removed. What's left is what a normal user needs to understand:
//   • What's visible to others (nothing, by default)
//   • Screenshot blur for sharing without leaking ratings
//   • One tap to clear on-device search history
//   • Cross-links to export and delete-account (canonical home is Sync /
//     Account, but surfaced here for discoverability)

import { Title } from "@solidjs/meta";
import { Show, createSignal, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { ToggleRow } from "~/features/settings/sharedControls";
import { useToast } from "~/shared/hooks/useToast";
import {
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots,
  adultContentFilter
} from "~/core/preferences";
import { clearSearchHistory } from "~/shared/utils/clearStorage";

const PrivacyRoute: Component = () => {
  const { showToast } = useToast();
  const [clearingHistory, setClearingHistory] = createSignal(false);

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const removed = clearSearchHistory();
      showToast(
        removed > 0
          ? `Cleared ${removed} search ${removed === 1 ? "entry" : "entries"}`
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
            {/* Visibility */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
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
                      No public profile page exists.
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
                      No one else can see what you watch.
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
                      CineLog pages are not indexed.
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
                  desc="Blur ratings when switching apps or taking screenshots."
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

            {/* On-device data */}
            <section class="sec-section">
              <p class="sec-section-label">On This Device</p>
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
                      Recent searches stored on this device.
                    </span>
                  </div>
                  <button
                    type="button"
                    class="settings-link-btn focus-ring"
                    onClick={handleClearHistory}
                    disabled={clearingHistory()}
                  >
                    <Show when={!clearingHistory()} fallback="Clearing…">
                      Clear
                    </Show>
                  </button>
                </div>
              </div>
            </section>

            {/* Your rights */}
            <section class="sec-section">
              <p class="sec-section-label">Your Rights</p>
              <div class="setting-group">
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
                      Permanently remove all your data.
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
