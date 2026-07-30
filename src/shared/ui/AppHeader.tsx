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
import { useAuthModal } from "~/shared/hooks/useAuthModal";
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
const AVATAR_INITIAL_STYLE: JSX.CSSProperties = {
  background: "var(--p-dim)",
  color: "var(--p)",
  "font-weight": 700,
  "font-size": "13px",
  "font-family": "'Outfit', sans-serif"
};
const DISPLAY_NAME_STYLE: JSX.CSSProperties = {
  color: "var(--text-body)",
  "font-size": "0.8125rem",
  "font-weight": 600
};

/**
 * AppHeader — sticky application header.
 *
 * Layout: [wordmark] ........ [bell] [avatar pill]
 *
 * The bell icon (only rendered when signed in) opens the Notification
 * Center sheet, which lists the user's release-day reminders and other
 * in-app notifications. Tapping the bell is the only entry point to
 * the notification feed from outside the Upcoming page.
 *
 * Navigation restructure (Profile phase):
 *   The avatar NO LONGER signs out on click. That was an undiscoverable
 *   trap-door — users had no way to know clicking the avatar would log
 *   them out. The avatar now navigates to /profile, which is the
 *   natural destination for "who am I" actions. Sign out lives inside
 *   Profile → Settings → Account → Sign Out, where it belongs.
 *
 *   When the user is NOT signed in, the avatar opens the AuthModal
 *   (same as before).
 *
 * Polished:
 *  - Wordmark uses font-headline (Bebas Neue) with the accent suffix.
 *  - Avatar pill is a glass surface with a hairline border, smoother
 *    hover (background + border-color transition), and a focus ring.
 *  - Sticky header uses a stronger backdrop blur (20px) so content
 *    scrolling underneath stays readable but not distracting.
 *  - Safe-area-aware top padding (env(safe-area-inset-top)) so the
 *    header never sits under the iOS notch / PWA chrome.
 */
const AppHeader: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  const initial = createMemo(() => {
    const name = user()?.displayName || user()?.email || "";
    return name.charAt(0).toUpperCase() || "?";
  });

  const handleAvatarClick = () => {
    if (isSignedIn()) {
      navigate("/profile");
    } else {
      openAuthModal();
    }
  };

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

      {/* Right cluster: notification bell + avatar pill */}
      <div class="flex items-center gap-1.5">
        <HeaderNotificationBell
          unreadCount={notif.unreadCount}
          onClick={() => setNotifOpen(true)}
        />

        {/* Avatar pill */}
        <button
          type="button"
          onClick={handleAvatarClick}
          class="focus-ring app-header-avatar flex items-center gap-2 overflow-hidden rounded-full"
          aria-label={
            isSignedIn()
              ? `View your profile — signed in as ${user()?.displayName || user()?.email || "user"}`
              : "Sign in"
          }
        >
          <Show
            when={user()?.photoURL}
            fallback={
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={AVATAR_INITIAL_STYLE}
                aria-hidden="true"
              >
                {initial()}
              </div>
            }
          >
            <img
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              src={user()!.photoURL!}
              alt=""
              class="h-8 w-8 shrink-0 rounded-full object-cover"
              referrerpolicy="no-referrer"
            />
          </Show>
          <Show when={isSignedIn()}>
            <span
              class="hidden max-w-[120px] truncate sm:block"
              style={DISPLAY_NAME_STYLE}
            >
              {user()?.displayName || user()?.email}
            </span>
          </Show>
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
