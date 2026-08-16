// src/features/settings/sections/types.ts
//
// `SettingsState` — the "state bag" passed from `SettingsPage` down into
// each section component. All SolidJS signals/setters/handlers/memos that
// live in `SettingsPage.tsx` are gathered into this single object so the
// section components can stay pure JSX extractors.
//
// Design note:
//   Global preference signals (theme, density, language, notifPrefs, etc.)
//   are imported DIRECTLY by the section components from
//   `~/core/preferences` and `~/core/theme`. Only the LOCAL state that
//   lives in `SettingsPage.tsx` (signals created with `createSignal` in
//   the component body, plus local handlers/memos) goes through this
//   state bag. This keeps the bag small while still letting SettingsPage
//   own all the auth/profile/account/sheet state.
//
// Why a single bag (vs per-section props)?
//   • Each section needs a different slice, but the slices overlap
//     (e.g. both Account and DangerZone use `isSignedIn()` and
//     `handleSignOut`).
//   • A single typed bag means we only have to define each piece of
//     state ONCE, in one place, with one source of truth.
//   • SolidJS props are accessors — passing a big object is cheap
//     because consumers only re-run when they actually read a signal.
//
// Adding new state:
//   1. Declare the signal/handler in SettingsPage.tsx
//   2. Add it to this interface
//   3. Add it to the `state` object in SettingsPage.tsx
//   4. Use it as `s.mySignal()` / `s.myHandler()` in the section component

import type { Accessor, Setter, JSX } from "solid-js";
import type { User } from "~/shared/types";
import type { JustWatchProviderItem } from "~/core/preferences";

// ────────────────────────────────────────────────────────────────────
// Section metadata — used by the sidebar + search filter
// ────────────────────────────────────────────────────────────────────

export interface SectionMeta {
  id: string;
  title: string;
  desc: string;
  icon: string;
  keywords: string[];
}

// ────────────────────────────────────────────────────────────────────
// Segmented control option type (matches sharedControls.Segmented)
// ────────────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string | number> {
  id: T;
  label: string;
  short?: string;
}

// ────────────────────────────────────────────────────────────────────
// The state bag
// ────────────────────────────────────────────────────────────────────

export interface SettingsState {
  // ── Auth + profile (from useAuth / useProfile) ──────────────────
  user: Accessor<User | null>;
  isSignedIn: Accessor<boolean>;

  // ── Account state ───────────────────────────────────────────────
  hasPassword: Accessor<boolean>;
  country: Accessor<string>;
  displayName: Accessor<string>;
  bio: Accessor<string>;
  editingProfile: Accessor<boolean>;
  savingProfile: Accessor<boolean>;
  nameInput: Accessor<string>;
  bioInput: Accessor<string>;
  setNameInput: Setter<string>;
  setBioInput: Setter<string>;

  // Account sheet visibility state
  showEmailSheet: Accessor<boolean>;
  setShowEmailSheet: Setter<boolean>;
  showPasswordSheet: Accessor<boolean>;
  setShowPasswordSheet: Setter<boolean>;
  showLinkEmailPasswordSheet: Accessor<boolean>;
  setShowLinkEmailPasswordSheet: Setter<boolean>;
  showDeactivateSheet: Accessor<boolean>;
  setShowDeactivateSheet: Setter<boolean>;
  deactivateMode: Accessor<"deactivate" | "delete">;
  showSignOutSheet: Accessor<boolean>;
  setShowSignOutSheet: Setter<boolean>;

  // Account panel visibility state (inline collapsibles)
  show2FAPanel: Accessor<boolean>;
  setShow2FAPanel: Setter<boolean>;
  showSessionsPanel: Accessor<boolean>;
  setShowSessionsPanel: Setter<boolean>;
  showLoginHistoryPanel: Accessor<boolean>;
  setShowLoginHistoryPanel: Setter<boolean>;
  showLoginMethodsPanel: Accessor<boolean>;
  setShowLoginMethodsPanel: Setter<boolean>;

  // OAuth linking state
  linkedProviders: Accessor<Set<string>>;
  linkingProvider: Accessor<string | null>;
  unlinkingProvider: Accessor<string | null>;

  // ── Account handlers ────────────────────────────────────────────
  handleStartEditProfile: () => void;
  handleSaveProfile: () => Promise<void>;
  handleCancelEditProfile: () => void;
  handleSaveCountry: (newCountry: string) => Promise<void>;
  handleLinkProvider: (provider: "google" | "apple") => Promise<void>;
  handleUnlinkProvider: (provider: "google" | "apple") => Promise<void>;
  handleSignOut: () => void;
  handleConfirmSignOut: () => Promise<void>;
  handleDeactivate: () => void;
  handleDelete: () => void;

  /**
   * Re-fetch the user's password + linked-provider state from Supabase.
   * Used by the sheet `onClose` handlers (so the UI updates after the
   * user changes their password / links a provider via a sheet).
   */
  refreshHasPassword: () => Promise<void>;

  // ── Appearance state ────────────────────────────────────────────
  dynamicAccentColor: Accessor<string>;
  extractingColor: Accessor<boolean>;
  bannerUrl: Accessor<string | null>;
  bannerType: Accessor<string>;

  // ── Appearance handlers ─────────────────────────────────────────
  isPresetActive: (presetId: import("~/core/theme").Theme) => boolean;
  isDynamicActive: () => boolean;
  handlePresetClick: (presetId: import("~/core/theme").Theme) => void;
  handleDynamicClick: () => Promise<void>;
  handleReextractDynamic: () => Promise<void>;

  // ── Content state ───────────────────────────────────────────────
  providers: Accessor<JustWatchProviderItem[]>;
  providersLoading: Accessor<boolean>;
  handleToggleProvider: (provider: JustWatchProviderItem) => void;

  // ── Notifications state ─────────────────────────────────────────
  pushPermission: Accessor<NotificationPermission | "unsupported">;
  requestPushPermission: () => Promise<void>;
  handleCategoryToggle: (
    key: keyof import("~/core/preferences").NotificationPrefs,
    value: boolean
  ) => void;

  // ── Derived display values (memos + plain functions) ────────────
  countryOptions: Accessor<{ value: string; label: string }[]>;
  languageOptions: Accessor<{ value: string; label: string }[]>;
  fallbackOptions: Accessor<{ value: string; label: string }[]>;
  activeProviderCount: Accessor<number>;
  joinDate: () => string;
  emailDisplay: () => string;
  nameDisplay: () => string;

  // ── Toast (used directly inside JSX onChange handlers) ──────────
  showToast: (
    msg: string,
    type?: "success" | "error" | "info" | "action",
    durationMs?: number,
    options?: { actionLabel?: string; onAction?: () => void }
  ) => void;

  // ── Accordion / search UI helpers ───────────────────────────────
  filteredSections: Accessor<SectionMeta[]>;
  isExpanded: (id: string) => boolean;
  toggleSection: (id: string) => void;
  highlightText: (text: string) => JSX.Element;

  // ── Search input state (used by the page-shell search bar) ─────
  query: Accessor<string>;
  setQuery: Setter<string>;

  // ── Sidebar nav click handler (page-shell sidebar) ─────────────
  handleSidebarClick: (id: string) => void;

  // ── Phase 6 Part 3 — Task 3: Reset + import/export ──────────────
  /**
   * Reset the given section's preferences to their default values.
   * The section id matches the `id` field in SectionMeta (e.g.
   * "appearance", "notifications", "calendar", "content", "sync").
   * Shows a success/error toast.
   */
  handleResetSection: (sectionId: string) => void;

  /**
   * Export all current preferences to a JSON file and trigger a
   * browser download. The file is named
   * `cinelog-preferences-YYYY-MM-DD.json`.
   */
  handleExportSettings: () => void;

  /**
   * Import preferences from a JSON file (typically chosen via an
   * `<input type="file">`). Validates the file's magic header and
   * shape before applying.
   */
  handleImportSettings: (file: File) => Promise<void>;

  // ── Render helpers ──────────────────────────────────────────────
  renderSegmented: <T extends string | number>(
    options: SegmentedOption<T>[],
    current: () => T,
    onChange: (id: T) => void,
    name: string
  ) => JSX.Element;
}
