// src/routes/settings/about.tsx
//
// About & Help — combines version info, legal, contact, and FAQ.
//
// Sections:
//   1. App version + build info + changelog
//   2. Legal — Terms of Service + Privacy Policy
//   3. Open-source licenses
//   4. Contact / report a bug (mailto link)
//   5. FAQ

import { Title } from "@solidjs/meta";
import { Show, createSignal, For, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";

const APP_VERSION = "2.0.0";
const BUILD_DATE = "2026-07-15";
const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "2.0.0",
    date: "2026-07-15",
    changes: [
      "Redesigned Settings hub: 8 sections, 11 sub-pages",
      "New: Profile & Preferences page (language, fallback, default vault status)",
      "New: Content & Discover page (adult filter, rating cap, streaming providers, default tab, rating scale)",
      "New: Calendar page (first day of week, time format, release timezone, default view)",
      "Rebuilt: Notifications with real persistence + quiet hours + weekly digest + lead time",
      "Rebuilt: Privacy with real controls (hide ratings in screenshots, clear search history, clear cache)",
      "New: CSV export + import (Letterboxd / Trakt / IMDb / generic)",
      "New: Sync cadence preference (real-time / WiFi-only / manual)",
      "New: About & Help page (version, changelog, legal, licenses, contact, FAQ)"
    ]
  }
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is CineLog free?",
    a: "Yes. CineLog is free to use. We don't show ads, sell your data, or have a paid tier. All features are available to all users."
  },
  {
    q: "Where is my data stored?",
    a: "Your watchlist, profile, and collections are stored securely in the cloud. Theme preferences and search history are stored locally on your device."
  },
  {
    q: "Can I import my data from Letterboxd, Trakt, or IMDb?",
    a: "Yes. Go to Settings → Sync & Backup → Import. We support CSV files from Letterboxd, Trakt, IMDb, and generic CSV/JSON. The format is auto-detected from the header row."
  },
  {
    q: "How do notifications work?",
    a: "Notifications are reminders for you, not social pings. They appear as in-app toasts while you're using CineLog, and as device notifications (if you enable push permission) when the app is in the background. Quiet hours silence all notifications during a time window you set."
  },
  {
    q: "Can other people see what I watch?",
    a: "No. CineLog is a single-player tracking app. Your watchlist, ratings, and profile are visible only to you. There are no followers, no public feed, no social graph."
  },
  {
    q: "How do I delete my account?",
    a: "Go to Settings → Account → Delete Account. You can also deactivate temporarily if you want to come back later. Your data is removed within 30 days of permanent deletion."
  }
];

const LICENSES = [
  { name: "SolidJS", version: "1.9.x", license: "MIT" },
  { name: "@solidjs/router", version: "0.14.x", license: "MIT" },
  { name: "@solidjs/start", version: "1.0.x", license: "MIT" },
  { name: "@supabase/supabase-js", version: "2.110.x", license: "MIT" },
  { name: "Material Symbols", version: "—", license: "Apache 2.0" },
  { name: "Bebas Neue (font)", version: "—", license: "OFL" },
  { name: "Outfit (font)", version: "—", license: "OFL" },
  { name: "Söhne Mono (font)", version: "—", license: "Commercial" }
];

const AboutRoute: Component = () => {
  const [showChangelog, setShowChangelog] = createSignal(false);
  const [showLicenses, setShowLicenses] = createSignal(false);

  const env = import.meta.env;

  const reportBug = () => {
    const subject = encodeURIComponent(`CineLog bug report (v${APP_VERSION})`);
    const body = encodeURIComponent(
      `What happened:\n\n\nWhat I expected:\n\n\nSteps to reproduce:\n1. \n2. \n3. \n\nApp version: ${APP_VERSION}\nBuild: ${BUILD_DATE}\nDevice: ${navigator.userAgent}\n`
    );
    window.location.href = `mailto:cinelog-feedback@example.com?subject=${subject}&body=${body}`;
  };

  return (
    <>
      <Title>CineLog — About & Help</Title>
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
            <h1 class="sec-title">About & Help</h1>
            <p class="sec-subtitle">
              Version, legal, contact, and FAQ.
            </p>
          </div>

          <div class="sec-body">
            {/* Version */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Version</p>
              <div class="setting-group">
                <div class="stat-line">
                  <span class="stat-line-key">App version</span>
                  <span class="stat-line-value">v{APP_VERSION}</span>
                </div>
                <div class="stat-line">
                  <span class="stat-line-key">Build date</span>
                  <span class="stat-line-value">{BUILD_DATE}</span>
                </div>
                <div class="stat-line">
                  <span class="stat-line-key">Environment</span>
                  <span class="stat-line-value">
                    {env.DEV ? "development" : "production"}
                  </span>
                </div>
              </div>
            </section>

            {/* Changelog */}
            <section class="sec-section">
              <p class="sec-section-label">Changelog</p>
              <div class="setting-group">
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() => setShowChangelog((v) => !v)}
                  aria-expanded={showChangelog()}
                >
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
                    <span class="setting-row-label">What's new</span>
                    <span class="setting-row-desc">
                      Latest changes in v{APP_VERSION}
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                    style={{
                      transform: showChangelog() ? "rotate(90deg)" : "none",
                      transition: "transform var(--dur-fast) var(--ease-out)"
                    }}
                  >
                    chevron_right
                  </span>
                </button>
                <Show when={showChangelog()}>
                  <div
                    style={{
                      padding: "var(--sp-3) var(--sp-5)",
                      background: "var(--tier-1)",
                      "border-bottom": "1px solid var(--hairline)"
                    }}
                  >
                    <For each={CHANGELOG}>
                      {(release) => (
                        <div style={{ "margin-bottom": "var(--sp-3)" }}>
                          <p
                            style={{
                              "font-family": "'Outfit', sans-serif",
                              "font-weight": 700,
                              "font-size": "0.875rem",
                              color: "var(--p)",
                              margin: 0,
                              "margin-bottom": "var(--sp-1)"
                            }}
                          >
                            v{release.version} · {release.date}
                          </p>
                          <ul
                            style={{
                              margin: 0,
                              "padding-left": "var(--sp-4)",
                              "font-size": "0.8125rem",
                              color: "var(--text-body)",
                              "line-height": "1.6"
                            }}
                          >
                            <For each={release.changes}>
                              {(change) => (
                                <li style={{ "margin-bottom": "var(--sp-1)" }}>
                                  {change}
                                </li>
                              )}
                            </For>
                          </ul>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </section>

            {/* Legal */}
            <section class="sec-section">
              <p class="sec-section-label">Legal</p>
              <div class="setting-group">
                <a
                  href="https://www.themoviedb.org/terms-of-use"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="setting-row focus-ring"
                  aria-label="Terms of Service"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      description
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Terms of Service</span>
                    <span class="setting-row-desc">
                      How CineLog expects you to use the service
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    open_in_new
                  </span>
                </a>
                <a
                  href="/settings/privacy"
                  class="setting-row focus-ring"
                  aria-label="Privacy Policy"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      privacy_tip
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Privacy Policy</span>
                    <span class="setting-row-desc">
                      What we collect, why we collect it, your rights
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

            {/* Open-source licenses */}
            <section class="sec-section">
              <p class="sec-section-label">Open-Source Licenses</p>
              <div class="setting-group">
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() => setShowLicenses((v) => !v)}
                  aria-expanded={showLicenses()}
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      code
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">View licenses</span>
                    <span class="setting-row-desc">
                      CineLog is built on open-source software
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                    style={{
                      transform: showLicenses() ? "rotate(90deg)" : "none",
                      transition: "transform var(--dur-fast) var(--ease-out)"
                    }}
                  >
                    chevron_right
                  </span>
                </button>
                <Show when={showLicenses()}>
                  <div
                    style={{
                      padding: "var(--sp-3) var(--sp-5)",
                      background: "var(--tier-1)",
                      "border-bottom": "1px solid var(--hairline)"
                    }}
                  >
                    <For each={LICENSES}>
                      {(lic) => (
                        <div
                          class="stat-line"
                          style={{
                            "border-bottom": "1px solid var(--hairline)"
                          }}
                        >
                          <span class="stat-line-key">
                            {lic.name}{" "}
                            <span
                              style={{
                                color: "var(--text-muted)",
                                "font-size": "0.75rem"
                              }}
                            >
                              v{lic.version}
                            </span>
                          </span>
                          <span class="stat-line-value">{lic.license}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </section>

            {/* Contact */}
            <section class="sec-section">
              <p class="sec-section-label">Contact</p>
              <div class="setting-group">
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={reportBug}
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      bug_report
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Report a bug</span>
                    <span class="setting-row-desc">
                      Opens your email app with a pre-filled report
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    mail
                  </span>
                </button>
                <a
                  href="mailto:cinelog-feedback@example.com"
                  class="setting-row focus-ring"
                  aria-label="Send feedback"
                >
                  <div class="setting-row-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      feedback
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Send feedback</span>
                    <span class="setting-row-desc">
                      Feature requests, suggestions, general thoughts
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    mail
                  </span>
                </a>
              </div>
            </section>

            {/* FAQ */}
            <section class="sec-section">
              <p class="sec-section-label">FAQ</p>
              <div class="setting-group" style={{ "flex-direction": "column" }}>
                <For each={FAQ_ITEMS}>
                  {(item) => (
                    <details
                      style={{
                        "border-bottom": "1px solid var(--hairline)",
                        padding: "var(--sp-3) var(--sp-5)",
                        background: "var(--tier-2)"
                      }}
                    >
                      <summary
                        style={{
                          "font-family": "'Outfit', sans-serif",
                          "font-size": "0.9375rem",
                          "font-weight": 600,
                          color: "var(--text-strong)",
                          cursor: "pointer",
                          "list-style": "none"
                        }}
                      >
                        <span
                          style={{
                            "margin-right": "var(--sp-2)",
                            color: "var(--p)"
                          }}
                        >
                          Q.
                        </span>
                        {item.q}
                      </summary>
                      <p
                        style={{
                          "font-size": "0.8125rem",
                          "line-height": "1.6",
                          color: "var(--text-body)",
                          margin: "var(--sp-2) 0 0 0"
                        }}
                      >
                        {item.a}
                      </p>
                    </details>
                  )}
                </For>
              </div>
            </section>

            {/* Footer */}
            <section class="sec-section">
              <p
                style={{
                  "text-align": "center",
                  "font-size": "0.75rem",
                  color: "var(--text-muted)",
                  padding: "var(--sp-4)",
                  margin: 0
                }}
              >
                CineLog v{APP_VERSION}
                <br />© 2026 CineLog. All rights reserved.
              </p>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default AboutRoute;
