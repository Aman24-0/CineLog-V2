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

const DESKTOP_SEARCH_STYLE: JSX.CSSProperties = {
  background: "var(--raised)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-pill)",
  padding: "0.375rem 0.875rem",
  color: "var(--text-muted)",
  "font-family": "'Outfit', sans-serif",
  "font-size": "0.8125rem",
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
  display: "flex",
  "align-items": "center",
  gap: "0.5rem",
  width: "260px"
};

const HEADER_ACTION_STYLE: JSX.CSSProperties = {
  width: "36px",
  height: "36px",
  "border-radius": "50%",
  border: "1px solid var(--hairline)",
  background: "var(--raised)",
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)"
};

const AVATAR_STYLE: JSX.CSSProperties = {
  width: "32px",
  height: "32px",
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
 * AppHeader — sticky application header.
 *
 * MOBILE Layout: [wordmark] ........ [bell]
 * DESKTOP Layout: [wordmark] [search] .... [quick-add] [sync] [bell] [avatar]
 *
 * On desktop, the header gains:
 *   - Global Search shortcut (navigates to /discover with search focused)
 *   - Quick Add button (navigates to /discover)
 *   - Sync Status indicator
 *   - User Avatar (navigates to /profile or opens AuthModal)
 *
 * The bell icon (only rendered when signed in) opens the Notification
 * Center sheet, which lists the user's release-day reminders and other
 * in-app notifications.
 */
const AppHeader: Component = () => {
  const { isSignedIn, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  const handleSearchClick = () => {
    navigate("/discover");
  };

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

  return (
    <header
      class="app-header-glass sticky top-0 z-30 flex items-center justify-between"
      role="banner"
    >
      {/* Wordmark — aria-label ensures screen readers announce
          "CineLog" as a word rather than letter-by-letter.
          On desktop, the wordmark is hidden since the sidebar has the logo. */}
      <h1
        class="font-headline m-0 app-header__wordmark"
        aria-label="CineLog"
        style={WORDMARK_STYLE}
      >
        CINE<span style={WORDMARK_ACCENT_STYLE}>LOG</span>
      </h1>

      {/* Desktop Search Bar — hidden on mobile */}
      <button
        type="button"
        class="app-header__search"
        style={DESKTOP_SEARCH_STYLE}
        onClick={handleSearchClick}
        aria-label="Search titles"
        title="Search"
      >
        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
          search
        </span>
        <span>Search movies, shows, anime...</span>
        <span
          style={{
            "margin-left": "auto",
            "font-size": "0.6875rem",
            "font-family": "'Azeret Mono', monospace",
            color: "var(--text-muted)",
            background: "var(--glass-bg)",
            padding: "0.125rem 0.375rem",
            "border-radius": "4px",
            border: "1px solid var(--hairline)"
          }}
        >
          ⌘K
        </span>
      </button>

      {/* Right cluster */}
      <div class="flex items-center gap-1.5">
        {/* Desktop Quick Add — hidden on mobile */}
        <button
          type="button"
          class="app-header__action"
          style={HEADER_ACTION_STYLE}
          onClick={handleQuickAdd}
          aria-label="Quick add"
          title="Add to vault"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            add
          </span>
        </button>

        {/* Desktop Sync Status — hidden on mobile */}
        <Show when={isSignedIn()}>
          <button
            type="button"
            class="app-header__action"
            style={HEADER_ACTION_STYLE}
            aria-label="Cloud sync"
            title="Synced"
          >
            <span class="material-symbols-outlined" style={{ "font-size": "18px", color: "var(--p)" }} aria-hidden="true">
              cloud_done
            </span>
          </button>
        </Show>

        {/* Notification bell */}
        <HeaderNotificationBell
          unreadCount={notif.unreadCount}
          onClick={() => setNotifOpen(true)}
        />

        {/* Desktop User Avatar — hidden on mobile */}
        <button
          type="button"
          class="app-header__avatar"
          style={AVATAR_STYLE}
          onClick={handleAvatarClick}
          aria-label={isSignedIn() ? "Profile" : "Sign in"}
          title={isSignedIn() ? "Profile" : "Sign in"}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
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
