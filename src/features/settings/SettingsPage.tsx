// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the unified, single-page settings hub.
//
// LAYOUT:
//   Desktop (≥768px): Two-column grid.
//     • Left: sticky sidebar with section anchors + global search.
//     • Right: scrollable list of setting sections (accordions).
//   Mobile (<768px): Single column.
//     • Sticky search bar at top.
//     • Accordion sections (tap to expand).
//
// SECTIONS (6 + Danger Zone):
//   1. Account          — profile, email, password, 2FA, sessions
//   2. Appearance       — theme cards, accent swatches (incl Dynamic), density, font, poster, spoilers
//   3. Content & Language — language, region, date format, vault status, adult filter, rating cap, rating scale, discover tab, streaming providers
//   4. Notifications    — push, 5 categories, quiet hours, lead time
//   5. Calendar         — first day of week, time format, timezone, default view
//   6. Data & Sync      — cloud sync, cadence, import, export
//   7. Danger Zone      — reset library, delete account (DELETE confirm)
//
// ARCHITECTURE:
//   • State lives in `useSettingsState()` (./hooks/useSettingsState.ts).
//     It returns a `SettingsState` bag with every signal, setter,
//     handler, memo, and UI helper the page needs.
//   • Each section's JSX lives in its own component file
//     (./sections/*Section.tsx). Sections receive `state` as a prop.
//   • This file is a THIN COMPOSER: it renders the page shell
//     (header, search bar, sidebar nav) + delegates the section
//     bodies to the section components + renders the bottom sheets.
//
// SEARCH:
//   The search input filters sections by title, description, and
//   row labels. Matching sections auto-expand; non-matching sections
//   are hidden. Matching text is highlighted with <mark> tags.
//
// ACCORDION:
//   On mobile, each section is a collapsible. On desktop, sections
//   are also collapsible (the sidebar provides anchor navigation).
//
// All settings render INLINE — there is no sub-page navigation.

import { For, Show, type Component } from "solid-js";
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { GlassButton, GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState } from "~/shared/ui/states";

// Account sheets (email/password changes, deactivate, sign-out).
// These render at the page root so they overlay correctly — they're
// NOT part of any section component.
import UpdateEmailSheet from "~/features/account/components/UpdateEmailSheet";
import ChangePasswordSheet from "~/features/account/components/ChangePasswordSheet";
import DeactivateAccountSheet from "~/features/account/components/DeactivateAccountSheet";
import ConfirmSignOutSheet from "~/features/account/components/ConfirmSignOutSheet";
import LinkEmailPasswordSheet from "~/features/account/components/LinkEmailPasswordSheet";

// Section components + section metadata + the SettingsState type.
import {
  AccountSection,
  AppearanceSection,
  ContentDiscoverSection,
  NotificationSection,
  CalendarSection,
  SyncSection,
  DangerZoneSection,
  SECTIONS,
  DANGER_ZONE_META
} from "~/features/settings/sections";

// The state hook — owns ALL signals, handlers, memos, UI helpers.
import { useSettingsState } from "~/features/settings/hooks/useSettingsState";

// ────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────

const SettingsPage: Component = () => {
  const s = useSettingsState();
  // Hidden file input ref for the Import button. We trigger the click
  // programmatically so the visible Import button can be styled freely.
  let importInputRef: HTMLInputElement | undefined;

  const handleImportClick = () => {
    importInputRef?.click();
  };

  const handleImportFileChosen = (
    e: Event & { currentTarget: HTMLInputElement }
  ) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      void s.handleImportSettings(file);
    }
    // Reset so the same file can be re-imported if needed.
    e.currentTarget.value = "";
  };

  return (
    <>
      <Title>CineLog — Settings</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />

        {/* Loading state — skeleton while initial profile/auth data loads */}
        <Show when={s.settingsLoading()}>
          <div class="sec-page sec-fade-in" aria-busy="true" aria-live="polite">
            <div class="sec-header">
              <GlassSkeleton class="h-4 w-16 rounded" />
              <GlassSkeleton class="h-6 w-32 rounded mt-2" />
              <GlassSkeleton class="h-4 w-64 rounded mt-2" />
            </div>
            <div class="settings-skeleton-grid" style={{ display: "grid", "grid-template-columns": "1fr", gap: "var(--sp-4)", "margin-top": "var(--sp-6)" }}>
              <For each={Array.from({ length: 6 })}>
                {() => (
                  <div style={{ display: "flex", gap: "var(--sp-3)", "align-items": "center" }}>
                    <GlassSkeleton class="h-10 w-10 rounded-lg" />
                    <div style={{ flex: "1" }}>
                      <GlassSkeleton class="h-4 w-40 rounded" />
                      <GlassSkeleton class="h-3 w-56 rounded mt-1" />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Error state — initial load failed */}
        <Show when={!s.settingsLoading() && s.settingsError()}>
          <div class="sec-page sec-fade-in">
            <ErrorState
              icon="cloud_off"
              title="Couldn't load settings"
              message="We couldn't fetch your profile and preferences. Please try again."
              variant="page"
              onRetry={() => void s.retryLoad()}
            />
          </div>
        </Show>

        {/* Main content — only show once initial load is done */}
        <Show when={!s.settingsLoading() && !s.settingsError()}>
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
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Preferences</h1>
            <p class="sec-subtitle">
              Account, appearance, content, sync, and more — all in one place.
            </p>

            {/* Phase 6 Part 3 — Task 3: Import / Export buttons.
                Phase 14 Chunk 5 fix — switched from custom
                .settings-import-export-btn (hardcoded #f5c518 yellow)
                to <GlassButton> variants that adapt to var(--p):
                  • Export → variant="primary" (filled accent, main action)
                  • Import → variant="ghost"   (transparent w/ accent text)
                size="compact" matches the previous visual density. */}
            <div class="settings-import-export-row">
              <GlassButton
                variant="primary"
                size="compact"
                icon="download"
                onClick={s.handleExportSettings}
                aria-label="Export preferences to a JSON file"
              >
                Export
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="compact"
                icon="upload"
                onClick={handleImportClick}
                aria-label="Import preferences from a JSON file"
              >
                Import
              </GlassButton>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={handleImportFileChosen}
              />
            </div>
          </div>

          {/* Search bar — sticky on mobile, inline on desktop */}
          <div class="settings-search-wrapper">
            <div class="settings-search">
              <span
                class="material-symbols-outlined settings-search-icon"
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="search"
                class="settings-search-input"
                placeholder="Search settings…"
                value={s.query()}
                onInput={(e) => s.setQuery(e.currentTarget.value)}
                aria-label="Search settings"
              />
              <Show when={s.query()}>
                <button
                  type="button"
                  class="settings-search-clear focus-ring"
                  onClick={() => s.setQuery("")}
                  aria-label="Clear search"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </Show>
            </div>
          </div>

          {/* Two-column layout: sidebar (desktop) + sections */}
          <div class="settings-layout">
            {/* Sidebar — desktop only */}
            <aside class="settings-sidebar" aria-label="Settings sections">
              <nav>
                <ul class="settings-sidebar-list">
                  <For each={[...SECTIONS, DANGER_ZONE_META]}>
                    {(section) => (
                      <li>
                        <button
                          type="button"
                          class="settings-sidebar-link focus-ring"
                          data-danger={section.id === "danger"}
                          onClick={() => s.handleSidebarClick(section.id)}
                        >
                          <span
                            class="material-symbols-outlined settings-sidebar-icon"
                            aria-hidden="true"
                          >
                            {section.icon}
                          </span>
                          <span class="settings-sidebar-label">
                            {section.title}
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </nav>
            </aside>

            {/* Sections — accordion on mobile, expanded on desktop */}
            <div class="settings-content">
              <Show
                when={s.filteredSections().length > 0}
                fallback={
                  <div class="settings-search-empty">
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ "font-size": "40px", color: "var(--text-soft)" }}
                    >
                      search_off
                    </span>
                    <p>No settings match "{s.query()}"</p>
                    <button
                      type="button"
                      class="btn-ghost focus-ring"
                      onClick={() => s.setQuery("")}
                    >
                      Clear search
                    </button>
                  </div>
                }
              >
                <AccountSection state={s} />
                <AppearanceSection state={s} />
                <ContentDiscoverSection state={s} />
                <NotificationSection state={s} />
                <CalendarSection state={s} />
                <SyncSection state={s} />
                <DangerZoneSection state={s} />
              </Show>
            </div>
          </div>
        </div>
        </Show>
      </PageContainer>

      {/* Sheets — rendered at the page root so they overlay correctly.
          Each sheet's `open` state + `onClose` handler come from the
          state bag. The password-related sheets also call
          `refreshHasPassword()` on close so the UI updates after the
          user changes their password / links a provider. */}
      <UpdateEmailSheet
        open={s.showEmailSheet()}
        onClose={() => s.setShowEmailSheet(false)}
      />
      <ChangePasswordSheet
        open={s.showPasswordSheet()}
        onClose={() => {
          s.setShowPasswordSheet(false);
          // Re-check whether a password is set — covers the edge case
          // where the user just set their first password via this sheet
          // (an OAuth-only user who lands on "Change password" instead
          // of "Set password").
          void s.refreshHasPassword();
        }}
      />
      <LinkEmailPasswordSheet
        open={s.showLinkEmailPasswordSheet()}
        onClose={() => {
          s.setShowLinkEmailPasswordSheet(false);
          void s.refreshHasPassword();
        }}
      />
      <DeactivateAccountSheet
        open={s.showDeactivateSheet()}
        mode={s.deactivateMode()}
        onClose={() => s.setShowDeactivateSheet(false)}
      />
      <ConfirmSignOutSheet
        open={s.showSignOutSheet()}
        mode="local"
        onConfirm={s.handleConfirmSignOut}
        onClose={() => s.setShowSignOutSheet(false)}
      />
    </>
  );
};

export default SettingsPage;
