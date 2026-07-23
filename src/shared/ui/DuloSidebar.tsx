// src/shared/ui/DuloSidebar.tsx
// Desktop sidebar — Dulo.tv-inspired. Hidden on mobile (CSS handles it).
import { type Component } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

const NAV_ITEMS = [
  { icon: "home",    label: "Home",       href: "/discover" },
  { icon: "live_tv", label: "Live",       href: "/discover", disabled: true },
  { icon: "movie",   label: "Movies",     href: "/watchlist" },
  { icon: "tv",      label: "Shows",      href: "/watchlist" },
  { icon: "star",    label: "Watchlist",  href: "/watchlist" },
  { icon: "bookmark",label: "Library",    href: "/collections" },
];

const MORE_ITEMS = [
  { icon: "explore",  label: "Discover",  href: "/discover" },
  { icon: "play_circle", label: "Shorts", href: "/discover", disabled: true },
  { icon: "calendar_month", label: "Calendar", href: "/discover", disabled: true },
];

const DuloSidebar: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const path = () => location.pathname;

  const isActive = (href: string, label: string) => {
    if (label === "Home" || label === "Discover") return path() === "/discover" || path() === "/";
    if (label === "Watchlist" || label === "Movies" || label === "Shows") return path() === "/watchlist";
    if (label === "Library") return path() === "/collections" || path().startsWith("/collections/");
    return path() === href;
  };

  return (
    <aside class="dulo-sidebar" aria-label="Site navigation">
      {/* Logo */}
      <div class="dulo-sidebar-logo">
        <div class="dulo-sidebar-logo-text">
          CINE<span>LOG</span>
        </div>
      </div>

      {/* Main nav */}
      <div class="dulo-sidebar-section">
        {NAV_ITEMS.map((item) => (
          <button
            class={`dulo-sidebar-item${isActive(item.href, item.label) ? " active" : ""}`}
            style={{ opacity: item.disabled ? "0.35" : "1", cursor: item.disabled ? "not-allowed" : "pointer" }}
            onClick={() => !item.disabled && navigate(item.href)}
            aria-current={isActive(item.href, item.label) ? "page" : undefined}
            aria-label={item.label}
          >
            <span class="material-symbols-outlined dulo-sidebar-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* More section */}
      <div class="dulo-sidebar-section" style={{ "margin-top": "0.5rem" }}>
        <div class="dulo-sidebar-section-label">More</div>
        {MORE_ITEMS.map((item) => (
          <button
            class={`dulo-sidebar-item${isActive(item.href, item.label) ? " active" : ""}`}
            style={{ opacity: item.disabled ? "0.35" : "1", cursor: item.disabled ? "not-allowed" : "pointer" }}
            onClick={() => !item.disabled && navigate(item.href)}
            aria-label={item.label}
          >
            <span class="material-symbols-outlined dulo-sidebar-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Sign in CTA */}
      {!isSignedIn() && (
        <button
          class="dulo-sidebar-signin"
          onClick={openAuthModal}
        >
          Sign in
        </button>
      )}
    </aside>
  );
};

export default DuloSidebar;
