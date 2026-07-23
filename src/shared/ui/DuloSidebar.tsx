// src/shared/ui/DuloSidebar.tsx
// Desktop sidebar — CineLog secondary navigation. Hidden on mobile (CSS).
//
// Contains the SAME four primary destinations as the bottom nav
// (Discover, Watchlist, Collections, Profile) plus the secondary
// destinations (Statistics, Upcoming, History, Settings) that live
// inside the Profile drawer on mobile.
//
// NAVIGATION RULE (per spec):
//   Never include Home, Live, Movies, Shows, Library, Shorts, Calendar,
//   Streaming, Channels, or Anime. CineLog has exactly: Discover,
//   Watchlist, Collections, Profile, Details, Settings, Statistics, Upcoming.
import { For, type Component } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

type NavItem = {
  icon: string;
  label: string;
  href: string;
};

const PRIMARY_ITEMS: NavItem[] = [
  { icon: "explore", label: "Discover", href: "/discover" },
  { icon: "bookmark", label: "Watchlist", href: "/watchlist" },
  { icon: "collection", label: "Collections", href: "/collections" },
  { icon: "person", label: "Profile", href: "/profile" },
];

const SECONDARY_ITEMS: NavItem[] = [
  { icon: "bar_chart", label: "Statistics", href: "/profile/stats" },
  { icon: "event_upcoming", label: "Upcoming", href: "/profile/upcoming" },
  { icon: "history", label: "History", href: "/profile/history" },
  { icon: "settings", label: "Settings", href: "/settings" },
];

const DuloSidebar: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const path = () => location.pathname;

  const isActive = (item: NavItem) => {
    if (item.href === "/discover") return path() === "/" || path() === "/discover";
    if (item.href === "/collections")
      return path() === "/collections" || path().startsWith("/collections/");
    if (item.href === "/profile")
      return path() === "/profile" || path().startsWith("/profile/");
    return path() === item.href;
  };

  return (
    <aside class="cinelog-sidebar glass-surface-strong" aria-label="Site navigation">
      {/* Logo */}
      <div class="cinelog-sidebar-logo">
        <div class="cinelog-sidebar-logo-text">
          CINE<span>LOG</span>
        </div>
      </div>

      {/* Primary nav */}
      <div class="cinelog-sidebar-section">
        <For each={PRIMARY_ITEMS}>
          {(item) => (
            <button
              class={`cinelog-sidebar-item${isActive(item) ? " active" : ""}`}
              onClick={() => navigate(item.href)}
              aria-current={isActive(item) ? "page" : undefined}
              aria-label={item.label}
            >
              <span class="material-symbols-outlined cinelog-sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          )}
        </For>
      </div>

      {/* Secondary section */}
      <div class="cinelog-sidebar-section" style={{ "margin-top": "0.5rem" }}>
        <div class="cinelog-sidebar-section-label">More</div>
        <For each={SECONDARY_ITEMS}>
          {(item) => (
            <button
              class={`cinelog-sidebar-item${isActive(item) ? " active" : ""}`}
              onClick={() => navigate(item.href)}
              aria-current={isActive(item) ? "page" : undefined}
              aria-label={item.label}
            >
              <span class="material-symbols-outlined cinelog-sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          )}
        </For>
      </div>

      {/* Sign in CTA */}
      {!isSignedIn() && (
        <button class="cinelog-sidebar-signin" onClick={openAuthModal}>
          Sign in
        </button>
      )}
    </aside>
  );
};

export default DuloSidebar;
