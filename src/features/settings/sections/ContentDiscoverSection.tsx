// src/features/settings/sections/ContentDiscoverSection.tsx
//
// Content & Language section — language, region, date format, vault
// status, adult content filter, rating cap, rating scale, default
// discover tab, streaming provider selection.
//
// Pure JSX extractor: receives the `SettingsState` bag for local state
// (providers, provider-loading state, memos) and imports the global
// preference signals/setters directly from `~/core/preferences`.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header.
//   • The inner panel:
//       - Language (primary + fallback) selects
//       - Date format segmented control
//       - Default vault status segmented control
//       - Adult content filter toggle + rating cap select
//       - Rating scale segmented control
//       - Default discover tab segmented control
//       - Streaming providers subsection — DELEGATED to the new
//         StreamingProvidersSection component (Stage 5 Chunk 4),
//         which implements the JustWatch-backed search/add/remove/
//         reorder UI. The old TMDB chip grid was removed.

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import SectionResetButton from "~/features/settings/components/SectionResetButton";
import {
  ControlRow,
  ToggleRow,
  SelectRow
} from "~/features/settings/sharedControls";

// Global preference signals/setters — imported directly.
import {
  language,
  setLanguage,
  fallbackLanguage,
  setFallbackLanguage,
  dateFormat,
  setDateFormat,
  defaultVaultStatus,
  setDefaultVaultStatus,
  adultContentFilter,
  setAdultContentFilter,
  contentRatingCap,
  setContentRatingCap,
  ratingScale,
  setRatingScale,
  defaultDiscoverTab,
  setDefaultDiscoverTab
} from "~/core/preferences";

// Stage 5 Chunk 4 — new JustWatch-backed streaming providers UI.
import { StreamingProvidersSection } from "~/features/settings/components/StreamingProvidersSection";

// Static option lists — single source of truth.
import {
  DATE_FORMAT_OPTIONS,
  VAULT_STATUS_OPTIONS,
  RATING_SCALE_OPTIONS,
  RATING_CAP_OPTIONS,
  DISCOVER_TAB_OPTIONS
} from "~/shared/constants/settings";

export function ContentDiscoverSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "content")}>
      <section
        id="section-content"
        class="settings-accordion-section"
      >
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("content")}
          aria-expanded={s.isExpanded("content")}
          aria-controls="panel-content"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            tune
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Content & Language")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Language, region, filters, ratings")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("content")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("content")}>
          <div
            id="panel-content"
            class="settings-accordion-panel"
          >
            {/* Language */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Language</p>
              <div class="setting-group">
                <SelectRow
                  icon="translate"
                  label="Primary language"
                  desc="Used for title overviews and posters."
                  value={language}
                  onChange={(v) => setLanguage(v)}
                  options={s.languageOptions()}
                />
                <SelectRow
                  icon="swap_horiz"
                  label="Fallback language"
                  desc="Used when no content in primary language."
                  value={fallbackLanguage}
                  onChange={(v) => setFallbackLanguage(v)}
                  options={s.fallbackOptions()}
                />
              </div>
            </div>

            {/* Date format */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Date format</p>
              <div class="setting-group">
                <ControlRow
                  icon="calendar_month"
                  label="Date display"
                  desc="How dates appear across the app."
                >
                  {s.renderSegmented(
                    DATE_FORMAT_OPTIONS,
                    dateFormat,
                    (id) => setDateFormat(id),
                    "Date format"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Default vault status */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">
                Default vault status
              </p>
              <div class="setting-group">
                <ControlRow
                  icon="bookmark_add"
                  label="New titles added"
                  desc="Status assigned automatically."
                >
                  {s.renderSegmented(
                    VAULT_STATUS_OPTIONS,
                    defaultVaultStatus,
                    (id) => setDefaultVaultStatus(id),
                    "Default vault status"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Adult content filter */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Content filter</p>
              <div class="setting-group">
                <ToggleRow
                  icon="no_adult_content"
                  label="Adult content filter"
                  desc="Hide adult titles from Discover."
                  current={adultContentFilter}
                  onChange={(v) => {
                    setAdultContentFilter(v);
                    s.showToast(
                      v
                        ? "Adult content hidden"
                        : "Adult content visible",
                      "info",
                      1200
                    );
                  }}
                />
                <SelectRow
                  icon="family_restroom"
                  label="Rating cap"
                  desc="Hide titles rated above this."
                  value={contentRatingCap}
                  onChange={(v) => {
                    setContentRatingCap(v);
                    s.showToast(
                      v
                        ? `Rating cap set to ${v}`
                        : "Rating cap removed",
                      "info",
                      1200
                    );
                  }}
                  options={RATING_CAP_OPTIONS}
                />
              </div>
            </div>

            {/* Rating scale */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">Rating scale</p>
              <div class="setting-group">
                <ControlRow
                  icon="grade"
                  label="How ratings appear"
                  desc="Star or thumbs display."
                >
                  {s.renderSegmented(
                    RATING_SCALE_OPTIONS,
                    ratingScale,
                    (id) => setRatingScale(id),
                    "Rating scale"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Default discover tab */}
            <div class="setting-subsection">
              <p class="setting-subsection-label">
                Default Discover tab
              </p>
              <div class="setting-group">
                <ControlRow
                  icon="tab"
                  label="Discover opens to"
                  desc="Which tab Discover starts on."
                >
                  {s.renderSegmented(
                    DISCOVER_TAB_OPTIONS,
                    defaultDiscoverTab,
                    (id) => setDefaultDiscoverTab(id),
                    "Default Discover tab"
                  )}
                </ControlRow>
              </div>
            </div>

            {/* Streaming providers — Stage 5 Chunk 4: JustWatch-backed
                search/add/remove/reorder UI. Replaces the old TMDB
                chip grid. The new component reads s.providers()
                (loaded from /api/ott/providers by useSettingsState)
                and the global streamingProviders() signal directly. */}
            <StreamingProvidersSection
              providers={s.providers}
              providersLoading={s.providersLoading}
              activeCount={s.activeProviderCount}
            />

            <SectionResetButton state={s} sectionId="content" />
          </div>
        </Show>
      </section>
    </Show>
  );
}
