// src/features/settings/sections/SyncSection.tsx
//
// Data & Sync section — cloud status, sync cadence, import hub,
// CSV import, backup cards, CSV export, screenshot privacy toggle.
//
// Pure JSX extractor: receives the `SettingsState` bag for the
// `isSignedIn()` accessor + `showToast(...)` + accordion UI helpers,
// and imports the global `hideRatingsInScreenshots` signal + setter
// directly from `~/core/preferences`.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - Sign-in gate (Show fallback if not signed in)
//       - CloudStatusCard
//       - SyncCadenceCard
//       - ImportHub + CsvImportCard
//       - BackupCards + CsvExportCard
//       - Hide ratings in screenshots toggle

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import SectionResetButton from "~/features/settings/components/SectionResetButton";
import { ToggleRow } from "~/features/settings/sharedControls";

// Sync feature cards (cloud status, cadence, import, export).
import CloudStatusCard from "~/features/sync/components/CloudStatusCard";
import SyncCadenceCard from "~/features/sync/components/SyncCadenceCard";
import ImportHub from "~/features/sync/components/ImportHub";
import CsvImportCard from "~/features/sync/components/CsvImportCard";
import BackupCards from "~/features/sync/components/BackupCards";
import CsvExportCard from "~/features/sync/components/CsvExportCard";
// Direct integrations (Trakt OAuth + sync wizard).
import TraktIntegrationCard from "~/features/sync/components/TraktIntegrationCard";

// Global preference signal + setter — imported directly.
import {
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots
} from "~/core/preferences";

export function SyncSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "sync")}>
      <section id="section-sync" class="settings-accordion-section">
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("sync")}
          aria-expanded={s.isExpanded("sync")}
          aria-controls="panel-sync"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            sync
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Data & Sync")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Cloud, import, export, backup")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("sync")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("sync")}>
          <div id="panel-sync" class="settings-accordion-panel">
            <Show
              when={s.isSignedIn()}
              fallback={
                <div class="settings-empty-section" role="status">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      "font-size": "32px",
                      color: "var(--p)"
                    }}
                  >
                    lock
                  </span>
                  <p>Sign in to access sync, import, and export.</p>
                </div>
              }
            >
              {/* Cloud status */}
              <div class="setting-subsection">
                <CloudStatusCard />
              </div>

              {/* Direct integrations — Trakt OAuth + sync */}
              <div class="setting-subsection">
                <p class="setting-subsection-label">
                  Direct integrations
                </p>
                <div class="setting-group">
                  <TraktIntegrationCard />
                </div>
              </div>

              {/* Sync cadence */}
              <div class="setting-subsection">
                <p class="setting-subsection-label">
                  Sync cadence
                </p>
                <div class="setting-group">
                  <SyncCadenceCard />
                </div>
              </div>

              {/* Import */}
              <div class="setting-subsection">
                <p class="setting-subsection-label">Import</p>
                <div class="setting-group">
                  <ImportHub />
                  <CsvImportCard />
                </div>
              </div>

              {/* Export */}
              <div class="setting-subsection">
                <p class="setting-subsection-label">Export</p>
                <div class="setting-group">
                  <BackupCards />
                  <CsvExportCard />
                </div>
              </div>

              {/* Screenshot privacy (lives here now, not in Privacy) */}
              <div class="setting-subsection">
                <p class="setting-subsection-label">
                  Screenshot privacy
                </p>
                <div class="setting-group">
                  <ToggleRow
                    icon="screenshot"
                    label="Hide ratings in screenshots"
                    desc="Blur ratings in app switcher."
                    current={hideRatingsInScreenshots}
                    onChange={(v) => {
                      setHideRatingsInScreenshots(v);
                      s.showToast(
                        v
                          ? "Ratings will blur in app switcher"
                          : "Ratings visible normally",
                        "info",
                        1500
                      );
                    }}
                  />
                </div>
              </div>
            </Show>

            <SectionResetButton state={s} sectionId="sync" />
          </div>
        </Show>
      </section>
    </Show>
  );
}
