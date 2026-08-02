// src/shared/ui/AppHeader.tsx
import {
  Show,
  createMemo,
  createSignal,
  type Component,
  type JSX
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import HeaderNotificationBell from "~/features/upcoming/components/HeaderNotificationBell";
import { useNotifications } from "~/features/upcoming/hooks/useNotifications";
import NotificationCenter from "~/features/upcoming/components/NotificationCenter";

// ─── Module-level style constants ────────────────────────────────────
// Static styles shared across every AppHeader render. Extracted to
// module level so they're allocated once (not per header mount) and
// the prop reference stays stable for downstream consumers.
const WORDMARK_STYLE: JSX.CSSProperties = {
  "font-size": "1.5rem",
  "line-height": "1",
  "letter-spacing": "0.08em",
  color: "var(--text-strong)"
};
const WORDMARK_ACCENT_STYLE: JSX.CSSProperties = { color: "var(--p)" };

/**
 * AppHeader — sticky application header.
 *
 * Layout: [wordmark] ........ [bell]
 *
 * The Profile avatar has been REMOVED from the header. Profile is
 * accessed exclusively from the Bottom Navigation's "Profile" tab,
 * which handles both logged-in (navigate to /profile) and logged-out
 * (open AuthModal) states. This avoids the redundant dual-entry-point
 * (header avatar + bottom nav) that existed after the social module
 * was removed.
 *
 * The bell icon (only rendered when signed in) opens the Notification
 * Center sheet, which lists the user's release-day reminders and other
 * in-app notifications.
 *
 * Polished:
 *  - Wordmark uses font-headline (Bebas Neue) with the accent suffix.
 *  - Sticky header uses a stronger backdrop blur (20px) so content
 *    scrolling underneath stays readable but not distracting.
 *  - Safe-area-aware top padding (env(safe-area-inset-top)) so the
 *    header never sits under the iOS notch / PWA chrome.
 */
const AppHeader: Component = () => {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  return (
    <header
      class="app-header-glass sticky top-0 z-30 flex items-center justify-between"
      role="banner"
    >
      {/* Wordmark — aria-label ensures screen readers announce
          "CineLog" as a word rather than letter-by-letter */}
      <h1 class="font-headline m-0" aria-label="CineLog" style={WORDMARK_STYLE}>
        CINE<span style={WORDMARK_ACCENT_STYLE}>LOG</span>
      </h1>

      {/* Right cluster: notification bell only */}
      <div class="flex items-center gap-1.5">
        <HeaderNotificationBell
          unreadCount={notif.unreadCount}
          onClick={() => setNotifOpen(true)}
        />
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
