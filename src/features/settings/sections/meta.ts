// src/features/settings/sections/meta.ts
//
// Section metadata — the `SECTIONS` array (the 6 main sections) plus
// `DANGER_ZONE_META` (the 7th "Danger Zone" section).
//
// Each entry has:
//   • id       — matches the section's anchor / panel id
//   • title    — sidebar nav label + accordion header title
//   • desc     — short description shown under the title
//   • icon     — Material Symbols icon name
//   • keywords — words that match the section in the search filter
//
// Used by:
//   • The sidebar nav (SettingsPage shell) — to render nav links.
//   • The `filteredSections` memo (useSettingsState hook) — to filter
//     sections by search query.
//   • Each section component's outer `<Show when={filteredSections()
//     .some(s => s.id === "xxx")}>` — to hide non-matching sections.

import type { SectionMeta } from "./types";

export const SECTIONS: SectionMeta[] = [
  {
    id: "account",
    title: "Account",
    desc: "Profile, security, 2FA, sessions",
    icon: "manage_accounts",
    keywords: [
      "name", "email", "password", "oauth", "google", "apple",
      "2fa", "two-factor", "authenticator", "session", "device", "sign out",
      "login history", "security", "login methods", "connect", "unlink",
      "country", "region"
    ]
  },
  {
    id: "appearance",
    title: "Appearance",
    desc: "Theme, accent, density, font",
    icon: "palette",
    keywords: [
      "dark", "light", "system", "accent", "color", "sage", "neon",
      "crimson", "gold", "dynamic", "density", "compact", "spacious",
      "font size", "poster quality", "spoilers", "animations", "contrast"
    ]
  },
  {
    id: "content",
    title: "Content & Language",
    desc: "Language, region, filters, ratings",
    icon: "tune",
    keywords: [
      "language", "fallback", "country", "region", "date format",
      "vault status", "planned", "watching", "completed", "dropped",
      "adult", "rating cap", "certification", "rating scale", "star",
      "thumbs", "discover", "tab", "streaming", "provider", "netflix",
      "prime", "disney", "hotstar"
    ]
  },
  {
    id: "notifications",
    title: "Notifications",
    desc: "Push, categories, quiet hours",
    icon: "notifications",
    keywords: [
      "push", "permission", "new season", "continue watching",
      "weekly recap", "recommendations", "sync", "quiet hours",
      "reminder", "lead time", "digest"
    ]
  },
  {
    id: "calendar",
    title: "Calendar",
    desc: "Week, time format, timezone",
    icon: "calendar_month",
    keywords: [
      "first day", "week", "sunday", "monday", "saturday",
      "12-hour", "24-hour", "timezone", "default view", "agenda", "month"
    ]
  },
  {
    id: "sync",
    title: "Data & Sync",
    desc: "Cloud, import, export, backup",
    icon: "sync",
    keywords: [
      "cloud", "sync", "cadence", "real-time", "wifi", "manual",
      "import", "json", "csv", "letterboxd", "trakt", "imdb", "tv time",
      "export", "backup"
    ]
  }
];

export const DANGER_ZONE_META: SectionMeta = {
  id: "danger",
  title: "Danger Zone",
  desc: "Reset library, delete account",
  icon: "warning",
  keywords: ["reset", "delete", "deactivate", "remove", "destroy", "erase"]
};
