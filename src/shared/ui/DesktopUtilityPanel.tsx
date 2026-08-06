// src/shared/ui/DesktopUtilityPanel.tsx
//
// Phase 10 Chunk 1 — Desktop View & UI Architecture Redesign
// ───────────────────────────────────────────────────────────
// WHAT CHANGED:
//   • Replaced static placeholder text with real contextual content:
//     - Continue Watching shelf (from useUserLibrary watchlist,
//       filtered by status="Watching", sorted by recent progress)
//     - Upcoming Reminders shelf (from useNotifications reminders,
//       sorted by release_date ascending, top 5 upcoming)
//   • Wrapped each section in a GlassCard with a header row
//     (icon + title).
//   • Each list item is a clickable row that navigates to the
//     title's detail page (movie/tv route).
//   • Empty states use a compact GlassEmptyState so the panel never
//     looks broken when the user has no watching/reminder data.
//   • Signed-out users see a single sign-in prompt card instead of
//     empty shelves (avoids showing "no data" UI for guests).
//
// ARCHITECTURE:
//   The panel reads from existing hooks (useUserLibrary,
//   useNotifications) — no new fetches, no new state. The hooks are
//   mounted at the app root, so the data is already warm by the time
//   the panel renders on desktop.
//
//   Route contextuality is preserved: on /profile/upcoming the
//   Reminders shelf renders first (top), on /watchlist the Continue
//   Watching shelf renders first. On every other route the default
//   order is Continue Watching → Reminders.

import {
  Show,
  Switch,
  Match,
  For,
  createMemo,
  type Component,
  type JSX
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useNotifications } from "~/features/upcoming/hooks/useNotifications";
import { useModalState } from "~/shared/hooks/useModalState";
import { GlassCard, GlassEmptyState } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";
import type { UserReminderRow } from "~/lib/supabase/repositories/upcoming";

// ─── Style constants ──────────────────────────────────────────────
const SECTION_HEADING_STYLE: JSX.CSSProperties = {
  display: "flex",
  "align-items": "center",
  gap: "0.5rem",
  "font-family": "'Outfit', sans-serif",
  "font-size": "0.75rem",
  "font-weight": 700,
  color: "var(--text-strong)",
  "letter-spacing": "0.04em",
  "text-transform": "uppercase",
  margin: "0 0 0.75rem 0"
};

const ITEM_ROW_STYLE: JSX.CSSProperties = {
  display: "grid",
  "grid-template-columns": "36px 1fr auto",
  gap: "0.625rem",
  "align-items": "center",
  padding: "0.5rem",
  "border-radius": "var(--radius-md, 8px)",
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease-out)",
  border: "none",
  background: "transparent",
  width: "100%",
  "text-align": "left"
};

const ITEM_POSTER_STYLE: JSX.CSSProperties = {
  width: "36px",
  height: "54px",
  "border-radius": "var(--radius-sm, 4px)",
  "object-fit": "cover",
  background: "var(--glass-bg)",
  "flex-shrink": 0
};

const ITEM_TITLE_STYLE: JSX.CSSProperties = {
  "font-family": "'Outfit', sans-serif",
  "font-size": "0.8125rem",
  "font-weight": 600,
  color: "var(--text-strong)",
  "white-space": "nowrap",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "line-height": "1.3",
  margin: "0"
};

const ITEM_META_STYLE: JSX.CSSProperties = {
  "font-family": "'Azeret Mono', monospace",
  "font-size": "0.6875rem",
  color: "var(--text-muted)",
  "white-space": "nowrap",
  margin: "0"
};

const ITEM_BADGE_STYLE: JSX.CSSProperties = {
  "font-family": "'Azeret Mono', monospace",
  "font-size": "0.625rem",
  "font-weight": 600,
  color: "var(--p)",
  padding: "0.125rem 0.375rem",
  "border-radius": "var(--radius-pill, 999px)",
  background: "var(--p-dim)",
  "white-space": "nowrap"
};

const HEADING_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "16px",
  color: "var(--p)",
  "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
};

/**
 * DesktopUtilityPanel — right contextual sidebar for desktop (≥1024px).
 *
 * Shows two contextual shelves:
 *   1. Continue Watching — titles the user is actively watching
 *      (status="Watching"), sorted by most recent progress update.
 *   2. Upcoming Reminders — titles with scheduled reminders,
 *      sorted by release date (soonest first).
 *
 * Hidden on mobile/tablet via CSS (.desktop-utility-panel → display:none
 * below 1024px — see desktop-workspace.css).
 */
const DesktopUtilityPanel: Component = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { watchlist } = useUserLibrary();
  const notif = useNotifications();
  const { openTitle } = useModalState();

  // ── Continue Watching: top 5 by recent progress ──────────────
  const continueWatching = createMemo<WatchlistItem[]>(() => {
    return watchlist()
      .filter((m) => m.status === "Watching")
      .sort((a, b) => {
        const tA = a.watchProgress?.updatedAt
          ? new Date(a.watchProgress.updatedAt).getTime()
          : 0;
        const tB = b.watchProgress?.updatedAt
          ? new Date(b.watchProgress.updatedAt).getTime()
          : 0;
        return tB - tA;
      })
      .slice(0, 5);
  });

  // ── Upcoming Reminders: top 5 by release date (soonest first) ──
  // Only future releases (>= today) so the panel doesn't fill with
  // stale past-due reminders the user already saw.
  const upcomingReminders = createMemo<UserReminderRow[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return notif
      .reminders()
      .filter((r) => r.release_date >= today)
      .sort((a, b) => a.release_date.localeCompare(b.release_date))
      .slice(0, 5);
  });

  // ── Contextual ordering: which shelf renders first? ───────────
  // On /watchlist → Continue Watching first (user is browsing their library).
  // On /profile/upcoming → Reminders first (user is looking at their calendar).
  // Everywhere else → Continue Watching first (default).
  const remindersFirst = createMemo(() => {
    const p = location.pathname;
    return p === "/profile/upcoming" || p.startsWith("/profile/upcoming");
  });

  // ── Helpers ────────────────────────────────────────────────────
  const titleOf = (m: WatchlistItem): string =>
    m.title || m.name || m.original_title || m.original_name || "Untitled";

  const openItem = (m: WatchlistItem) => {
    // Open the Details modal directly — the item is already in the
    // user's vault so openTitle can resolve the vaultItem.
    openTitle(m, watchlist());
  };

  const openReminder = (r: UserReminderRow) => {
    navigate(`/${r.title_type === "series" ? "tv" : "movie"}/${r.tmdb_id}`);
  };

  const formatReminderDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      const now = new Date();
      const diffDays = Math.round(
        (d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
          86400000
      );
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Tomorrow";
      if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const progressLabel = (m: WatchlistItem): string => {
    if (m.media_type === "tv") {
      const s = m.season ?? 0;
      const e = m.episode ?? 0;
      if (s > 0 && e > 0) return `S${s} E${e}`;
      if (s > 0) return `S${s}`;
      return "Watching";
    }
    return m.watchProgress?.currentTime && m.watchProgress?.duration
      ? `${Math.round((m.watchProgress.currentTime / m.watchProgress.duration) * 100)}%`
      : "Watching";
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <aside
      class="desktop-utility-panel"
      role="complementary"
      aria-label="Continue watching and upcoming reminders"
    >
      <Switch>
        {/* ── Signed-out: show a single sign-in prompt ──────── */}
        <Match when={!isSignedIn()}>
          <GlassCard variant="glass" size="default" padding="default">
            <h3 style={SECTION_HEADING_STYLE}>
              <span
                class="material-symbols-outlined"
                style={HEADING_ICON_STYLE}
                aria-hidden="true"
              >
                login
              </span>
              Sign in
            </h3>
            <p
              style={{
                "font-size": "0.8125rem",
                "line-height": "1.5",
                color: "var(--text-soft)",
                margin: "0"
              }}
            >
              Sign in to see your Continue Watching shelf and upcoming
              release reminders here.
            </p>
          </GlassCard>
        </Match>

        {/* ── Signed-in: show contextual shelves ────────────── */}
        <Match when={true}>
          <Show
            when={!remindersFirst()}
            fallback={
              <>
                <RemindersSection
                  reminders={upcomingReminders()}
                  onOpen={openReminder}
                  formatDate={formatReminderDate}
                />
                <ContinueWatchingSection
                  items={continueWatching()}
                  onOpen={openItem}
                  titleOf={titleOf}
                  progressLabel={progressLabel}
                  posterUrl={(m) => tmdbImage(m.poster_path, "w92")}
                />
              </>
            }
          >
            <ContinueWatchingSection
              items={continueWatching()}
              onOpen={openItem}
              titleOf={titleOf}
              progressLabel={progressLabel}
              posterUrl={(m) => tmdbImage(m.poster_path, "w92")}
            />
            <RemindersSection
              reminders={upcomingReminders()}
              onOpen={openReminder}
              formatDate={formatReminderDate}
            />
          </Show>
        </Match>
      </Switch>
    </aside>
  );
};

// ─── Sub-components ────────────────────────────────────────────────

interface ContinueWatchingProps {
  items: WatchlistItem[];
  onOpen: (m: WatchlistItem) => void;
  titleOf: (m: WatchlistItem) => string;
  progressLabel: (m: WatchlistItem) => string;
  posterUrl: (m: WatchlistItem) => string;
}

function ContinueWatchingSection(props: ContinueWatchingProps) {
  return (
    <GlassCard
      variant="glass"
      size="default"
      padding="default"
      class="desktop-utility-panel__card"
    >
      <h3 style={SECTION_HEADING_STYLE}>
        <span
          class="material-symbols-outlined"
          style={HEADING_ICON_STYLE}
          aria-hidden="true"
        >
          play_circle
        </span>
        Continue Watching
      </h3>
      <Show
        when={props.items.length > 0}
        fallback={
          <GlassEmptyState
            icon="videocam_off"
            title="Nothing in progress"
            message="Titles you're watching will appear here."
            variant="compact"
          />
        }
      >
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "0.25rem"
          }}
        >
          <For each={props.items}>
            {(m) => (
              <button
                type="button"
                style={ITEM_ROW_STYLE}
                onClick={() => props.onOpen(m)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--raised)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                aria-label={`Continue watching ${props.titleOf(m)}`}
              >
                <img
                  src={props.posterUrl(m)}
                  alt=""
                  style={ITEM_POSTER_STYLE}
                  loading="lazy"
                  decoding="async"
                />
                <span
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    gap: "0.125rem",
                    "min-width": "0"
                  }}
                >
                  <span style={ITEM_TITLE_STYLE}>{props.titleOf(m)}</span>
                  <span style={ITEM_META_STYLE}>
                    {props.progressLabel(m)}
                  </span>
                </span>
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "16px",
                    color: "var(--text-muted)"
                  }}
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </GlassCard>
  );
}

interface RemindersProps {
  reminders: UserReminderRow[];
  onOpen: (r: UserReminderRow) => void;
  formatDate: (d: string) => string;
}

function RemindersSection(props: RemindersProps) {
  return (
    <GlassCard
      variant="glass"
      size="default"
      padding="default"
      class="desktop-utility-panel__card"
      style={{ "margin-top": "0.75rem" }}
    >
      <h3 style={SECTION_HEADING_STYLE}>
        <span
          class="material-symbols-outlined"
          style={HEADING_ICON_STYLE}
          aria-hidden="true"
        >
          notifications_active
        </span>
        Upcoming Reminders
      </h3>
      <Show
        when={props.reminders.length > 0}
        fallback={
          <GlassEmptyState
            icon="event_available"
            title="No reminders"
            message="Set reminders from any title's detail page."
            variant="compact"
          />
        }
      >
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "0.25rem"
          }}
        >
          <For each={props.reminders}>
            {(r) => (
              <button
                type="button"
                style={ITEM_ROW_STYLE}
                onClick={() => props.onOpen(r)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--raised)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                aria-label={`Open reminder for ${r.title_type}`}
              >
                <span
                  style={{
                    ...ITEM_POSTER_STYLE,
                    background: "var(--p-dim)",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    color: "var(--p)"
                  }}
                  aria-hidden="true"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "18px" }}
                  >
                    {r.title_type === "series" ? "tv" : "movie"}
                  </span>
                </span>
                <span
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    gap: "0.125rem",
                    "min-width": "0"
                  }}
                >
                  <span style={ITEM_TITLE_STYLE}>
                    {r.title_type === "series" ? "Series" : "Movie"} · #{r.tmdb_id}
                  </span>
                  <span style={ITEM_META_STYLE}>{r.release_date}</span>
                </span>
                <span style={ITEM_BADGE_STYLE}>
                  {props.formatDate(r.release_date)}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </GlassCard>
  );
}

export default DesktopUtilityPanel;
