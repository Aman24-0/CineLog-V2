// src/features/upcoming/components/HeaderNotificationBell.tsx
//
// HeaderNotificationBell — the bell icon that lives in the app header.
// Shows a red badge with the unread notification count when > 0.
// Tapping the bell opens the NotificationCenter sheet.
//
// The bell is hidden entirely when the user is not signed in (guests
// have no notifications).

import { type Component, Show, createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";

interface HeaderNotificationBellProps {
  unreadCount: () => number;
  onClick: () => void;
}

const HeaderNotificationBell: Component<HeaderNotificationBellProps> = (
  props
) => {
  const { isSignedIn } = useAuth();
  const badge = createMemo(() => {
    const c = props.unreadCount();
    if (c <= 0) return null;
    return c > 9 ? "9+" : String(c);
  });

  return (
    <Show when={isSignedIn()}>
      <button
        type="button"
        class="upcoming-bell focus-ring"
        onClick={() => props.onClick()}
        aria-label={
          badge()
            ? `Notifications — ${props.unreadCount()} unread`
            : "Notifications"
        }
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "20px" }}
          aria-hidden="true"
        >
          notifications
        </span>
        <Show when={badge()}>
          <span class="upcoming-bell-badge" aria-hidden="true">
            {badge()}
          </span>
        </Show>
      </button>
    </Show>
  );
};

export default HeaderNotificationBell;
