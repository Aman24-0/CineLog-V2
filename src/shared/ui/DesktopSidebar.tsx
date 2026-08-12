// src/shared/ui/DesktopSidebar.tsx
import { useNavigate, useLocation } from "@solidjs/router";
import { For, createSignal, createMemo, Show, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { prefetchRoute } from "~/shared/utils/routePrefetch";

/**
 * DesktopSidebar — permanent left navigation for desktop/tablet.
 *
 * Replaces the bottom navigation bar on screens >= 1024px.
 * Provides a collapsible sidebar with icon + label navigation items.
 *
 * Design inspired by: Netflix Desktop, Steam, Plex, VS Code, Figma.
 *
 * Structure:
 *   - Logo at top
 *   - Navigation items (Dashboard, Discover, Watchlist, Collections, Upcoming, Statistics)
 *   - Profile/Settings at bottom
 *   - Collapse toggle
 *
 * The sidebar is rendered by AppShell and is always visible on desktop.
 * Mobile continues to use BottomNavigation.
 */
const DesktopSidebar: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [collapsed, setCollapsed] = createSignal(false);

  const path = () => location.pathname;

  const go = (href: string) => {
    navigate(href);
  };

  const handleProfileClick = () => {
    if (isSignedIn()) {
      go("/profile");
    } else {
      openAuthModal();
    }
  };

  const navItems = [
    { icon: "explore", label: "Discover", href: "/discover" },
    { icon: "visibility", label: "Watchlist", href: "/watchlist" },
    { icon: "collections_bookmark", label: "Collections", href: "/collections" },
    { icon: "upcoming", label: "Upcoming", href: "/profile/upcoming" },
    { icon: "bar_chart", label: "Statistics", href: "/profile/stats" },
    { icon: "person", label: "Profile", href: "/profile", onClick: handleProfileClick },
    { icon: "settings", label: "Settings", href: "/settings" },
  ];

  const isActive = (href: string) => {
    if (href === "/discover" && (path() === "/discover" || path() === "/search")) return true;
    if (href === "/collections" && path().startsWith("/collections")) return true;
    // Profile should only be active for exact /profile or /profile/ sub-paths
    // that are NOT claimed by more specific routes (upcoming, stats).
    if (href === "/profile" && path() === "/profile") return true;
    if (href === "/settings" && path().startsWith("/settings")) return true;
    return path() === href;
  };

  return (
    <aside
      class={`desktop-sidebar${collapsed() ? " desktop-sidebar--collapsed" : ""}`}
      role="navigation"
      aria-label="Desktop navigation"
    >
      {/* Logo — hidden on desktop (now in AppHeader); shown when collapsed on desktop as icon only */}
      <Show when={collapsed()}>
        <div class="desktop-sidebar__logo">
          <span class="desktop-sidebar__logo-icon material-symbols-outlined" aria-hidden="true">
            movie
          </span>
        </div>
      </Show>

      {/* Navigation items */}
      <nav class="desktop-sidebar__nav">
        <For each={navItems}>
          {(item) => {
            const active = createMemo(() => isActive(item.href));
            return (
              <button
                type="button"
                class={`desktop-sidebar__item${active() ? " desktop-sidebar__item--active" : ""}`}
                onClick={() => {
                  prefetchRoute(item.href);
                  if (item.onClick) {
                    item.onClick();
                  } else {
                    go(item.href);
                  }
                }}
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                aria-current={active() ? "page" : undefined}
                aria-label={item.label}
                title={collapsed() ? item.label : undefined}
              >
                <span
                  class="material-symbols-outlined desktop-sidebar__item-icon"
                  style={{
                    "font-variation-settings": active()
                      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                  }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <Show when={!collapsed()}>
                  <span class="desktop-sidebar__item-label">{item.label}</span>
                </Show>
                <Show when={active()}>
                  <span class="desktop-sidebar__item-indicator" aria-hidden="true" />
                </Show>
              </button>
            );
          }}
        </For>
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        class="desktop-sidebar__toggle"
        onClick={() => setCollapsed(!collapsed())}
        aria-label={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span
          class="material-symbols-outlined"
          style={{
            transform: collapsed() ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--dur-base) var(--ease-out)"
          }}
          aria-hidden="true"
        >
          chevron_left
        </span>
        <Show when={!collapsed()}>
          <span class="desktop-sidebar__toggle-label">Collapse</span>
        </Show>
      </button>
    </aside>
  );
};

export default DesktopSidebar;
