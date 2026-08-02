// src/lib/email/renderer.ts
//
// CineLog V2 — Email Template Renderer (Phase 2 — Task 15)
// ---------------------------------------------------------------------
// Single entry point that maps a NotificationType + a context object
// to a fully-rendered HTML email string.
//
// WHY A RENDERER (not direct template calls):
//   The email-firing code path (useNotifications.ts, the weekly-recap
//   cron, and future automated flows) shouldn't have to know which
//   template function to call for each notification type. The renderer
//   abstracts that mapping so callers just say:
//
//     renderEmailTemplate("weekly_recap", { activity: {...} })
//
//   and get back a complete HTML document.
//
//   This also makes it trivial to add a new notification type: add a
//   case to the switch, add a template file, and every caller gets
//   the new type for free.
//
// ISOMORPHIC:
//   This module is safe to import from both server routes (API
//   endpoints) and browser code (useNotifications). The template
//   functions are pure string builders — no DOM, no fetches, no env
//   reads. That's important because the browser-side fallback path
//   (useNotifications.ts) renders the HTML client-side and POSTs it
//   to /api/email/send, while the server-side weekly-recap cron
//   renders it server-side and POSTs it directly to Resend.
//
//   The base template's inline-CSS approach means the same HTML
//   renders correctly in every email client regardless of who
//   produced it.

import { renderBaseEmail } from "./templates/base";
import { renderReminderEmail } from "./templates/reminder";
import {
  renderWeeklyRecapEmail,
  type WeeklyRecapActivity
} from "./templates/weeklyRecap";
import { renderNewSeasonEmail } from "./templates/newSeason";
import { renderContinueWatchingEmail } from "./templates/continueWatching";
import {
  renderRecommendationsEmail,
  type RecommendationItem
} from "./templates/recommendations";
import { renderSyncStatusEmail } from "./templates/syncStatus";

// Re-export the sub-types so callers can construct context objects
// without having to know which template file each type lives in.
export type { WeeklyRecapActivity, RecommendationItem };

/**
 * The set of notification types that can be delivered via email.
 * Mirrors the notification.type values stored in the `notifications`
 * table, plus "reminder" which is the type used by release-day
 * reminders (stored as type="reminder" in the notifications table).
 */
export type NotificationType =
  | "reminder"
  | "weekly_recap"
  | "new_season"
  | "continue_watching"
  | "recommendations"
  | "sync_status";

/**
 * The context object passed to renderEmailTemplate. Every field is
 * optional — the renderer applies sensible defaults for any missing
 * field so a caller that only has a title + message can still
 * produce a valid email.
 */
export interface TemplateContext {
  // ── Generic fields (used by all types) ──────────────────────────
  title?: string;
  message?: string;

  // ── Reminder ────────────────────────────────────────────────────
  releaseDate?: string;

  // ── Weekly recap ────────────────────────────────────────────────
  activity?: WeeklyRecapActivity;

  // ── New season ──────────────────────────────────────────────────
  seriesName?: string;
  seasonNumber?: number;
  episodeCount?: number;

  // ── Continue watching ───────────────────────────────────────────
  progress?: string;

  // ── Recommendations ─────────────────────────────────────────────
  recommendations?: RecommendationItem[];

  // ── Sync status ─────────────────────────────────────────────────
  status?: "success" | "error";
  timestamp?: string;
  titleCount?: number;
}

/**
 * Render an email template for the given notification type + context.
 *
 * Returns a complete HTML document string (with <html>, <head>,
 * <body>) suitable for passing to Resend's `html` field or any
 * other email-sending API.
 *
 * For unknown notification types, falls back to a generic template
 * that just renders the title + message — this ensures we never
 * throw on a new notification type the renderer hasn't been updated
 * for yet.
 */
export function renderEmailTemplate(
  type: NotificationType,
  context: TemplateContext
): string {
  switch (type) {
    case "reminder":
      return renderReminderEmail(
        context.title || "Your reminder",
        context.releaseDate || "Unknown",
        context.message || ""
      );

    case "weekly_recap":
      return renderWeeklyRecapEmail(
        context.activity || {
          completed: 0,
          rated: 0,
          added: 0,
          highestRated: null
        }
      );

    case "new_season":
      return renderNewSeasonEmail(
        context.seriesName || "A series you track",
        context.seasonNumber || 1,
        context.episodeCount || 0
      );

    case "continue_watching":
      return renderContinueWatchingEmail(
        context.title || "A title you were watching",
        context.progress || "Continue where you left off"
      );

    case "recommendations":
      return renderRecommendationsEmail(context.recommendations || []);

    case "sync_status":
      return renderSyncStatusEmail(
        context.status || "success",
        context.timestamp || new Date().toLocaleString(),
        context.titleCount || 0
      );

    default: {
      // Exhaustiveness check — if a new NotificationType is added
      // without a corresponding case, TypeScript will flag this as
      // a type error (the `never` assertion). At runtime we fall
      // back to the generic template.
      const _exhaustive: never = type;
      void _exhaustive;
      // Render a plain message email using the base template.
      const safeMessage = (context.message || "You have a new notification from CineLog.")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return renderBaseEmail(
        `<p style="margin:0;color:#dddddd;">${safeMessage}</p>`,
        context.title || "CineLog Notification"
      );
    }
  }
}

// Re-export renderBaseEmail for callers that need the raw wrapper
// (e.g. for ad-hoc emails that don't fit any of the typed templates).
export { renderBaseEmail };
