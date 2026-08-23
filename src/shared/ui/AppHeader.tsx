// src/shared/ui/AppHeader.tsx
//
// Phase 10 Chunk 1 — Desktop View & UI Architecture Redesign
// Final refinement — Search is a primary navigation destination, so the
// Discover-only header intentionally contains no search control.
// ───────────────────────────────────────────────────────────
// VISUAL STRUCTURE:
//   MOBILE  (<1024px): [CINELOG] ........................ [🔔]
//   DESKTOP (≥1024px): [CINELOG] [➕] [☁️] [🔔] [👤]
//
// The notification bell remains available in the header. The dedicated
// /search route and bottom/desktop navigation own catalog search access.
// The breakpoint is 1024px (aligned with the desktop sidebar).

import { Show, createSignal, type Component, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import HeaderNotificationBell from "~/features/upcoming/components/HeaderNotificationBell";
import { useNotifications } from "~/features/upcoming/hooks/useNotifications";
import NotificationCenter from "~/features/upcoming/components/NotificationCenter";
import { GlassIconButton } from "~/shared/ui/glass";

// ─── Module-level style constants ────────────────────────────────────
const WORDMARK_STYLE: JSX.CSSProperties = {
  "font-size": "1.5rem",
  "line-height": "1",
  "letter-spacing": "0.08em",
  color: "var(--text-strong)"
};
const WORDMARK_ACCENT_STYLE: JSX.CSSProperties = { color: "var(--p)" };

// NOTE: The hand-rolled HEADER_ACTION_STYLE (36×36px) and AVATAR_STYLE
// (32×32px) constants have been REMOVED. All header action buttons now
// use <GlassIconButton size="default"> which renders at 44×44px —
// satisfying WCAG 2.5.5 (Target Size) and eliminating the duplicate
// styling. The avatar button keeps its own style because it's a
// profile/login toggle with a distinct visual treatment (rounded,
// hairline border) that differs from the icon-button variant system.

const AVATAR_STYLE: JSX.CSSProperties = {
  width: "44px",
  height: "44px",
  "border-radius": "50%",
  background: "var(--glass-bg-strong)",
  border: "2px solid var(--hairline)",
  color: "var(--text-muted)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  cursor: "pointer",
  transition: "border-color var(--dur-fast) var(--ease-out)"
};

/**
 * AppHeader — sticky Discover-only application header.
 *
 * MOBILE Layout  (<1024px): [CINELOG] ........................ [🔔]
 * DESKTOP Layout (≥1024px): [CINELOG] [➕] [☁️] [🔔] [👤]
 *
 * Search is a primary bottom-navigation destination and therefore does not
 * appear in this global header. The notification bell remains available here.
 * DesktopSidebar and BottomNavigation own primary route navigation.
 *
 * GLASS SYSTEM:
 *   • All action buttons use <GlassIconButton size="default"> (44×44px,
 *     WCAG 2.5.5 compliant).
 */
const AppHeader: Component = () => {
  const { isSignedIn, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  const handleQuickAdd = () => {
    navigate("/discover");
  };

  const handleAvatarClick = () => {
    if (isSignedIn()) {
      navigate("/profile");
    } else {
      openAuthModal();
    }
  };

  // The user object is unused in render but destructured for future use
  // (e.g. showing the user's avatar image). Suppress the unused-var
  // warning by referencing it here.
  void user;

  return (
    <header
      class="app-header-glass sticky top-0 z-30 flex items-center justify-between"
      role="banner"
    >
      {/* Wordmark — hidden on desktop (sidebar has the logo) */}
      <h1
        class="font-headline app-header__wordmark m-0"
        aria-label="CineLog"
        style={WORDMARK_STYLE}
      >
        CINE<span style={WORDMARK_ACCENT_STYLE}>LOG</span>
      </h1>

      {/* Right cluster — quick-add + sync + notification + avatar.
          Quick-add, sync, and avatar are desktop-only; the notification bell
          remains visible on all viewports. */}
      <div class="flex items-center gap-1.5">
        {/* Desktop Quick Add — hidden on mobile/tablet. size="default" (44×44) */}
        <GlassIconButton
          class="app-header__action"
          variant="secondary"
          size="default"
          icon="add"
          label="Quick add"
          onClick={handleQuickAdd}
        />

        {/* Desktop Sync Status — hidden on mobile/tablet */}
        <Show when={isSignedIn()}>
          <GlassIconButton
            class="app-header__action"
            variant="secondary"
            size="default"
            icon="cloud_done"
            label="Cloud sync"
            // Visual cue: the cloud_done icon is gold when synced.
            style={{ color: "var(--p)" }}
          />
        </Show>

        {/* Notification bell — visible on all viewports */}
        <HeaderNotificationBell
          unreadCount={notif.unreadCount}
          onClick={() => setNotifOpen(true)}
        />

        {/* Desktop User Avatar — hidden on mobile/tablet. 44×44 (WCAG 2.5.5). */}
        <button
          type="button"
          class="app-header__avatar focus-ring"
          style={AVATAR_STYLE}
          onClick={handleAvatarClick}
          aria-label={isSignedIn() ? "Profile" : "Sign in"}
          title={isSignedIn() ? "Profile" : "Sign in"}
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "18px" }}
            aria-hidden="true"
          >
            {isSignedIn() ? "person" : "login"}
          </span>
        </button>
      </div>

      {/* Notification Center sheet — Portal-mounted by GlassModal */}
      <Show when={notifOpen() && isSignedIn()}>
        <NotificationCenter
          open={notifOpen()}
          onClose={() => setNotifOpen(false)}
          notifications={notif.notifications}
          onMarkRead={notif.markRead}
          onMarkAllRead={notif.markAllRead}
          onClearRead={notif.clearRead}
          onSnooze={notif.snooze}
          onDismiss={notif.dismiss}
          onOpenTitle={(relatedId, relatedType) => {
            setNotifOpen(false);
            navigate(`/${relatedType ?? "movie"}/${relatedId}`);
          }}
        />
      </Show>
    </header>
  );
};

export default AppHeader;
