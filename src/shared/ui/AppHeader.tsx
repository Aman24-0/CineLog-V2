// src/shared/ui/AppHeader.tsx — CineLog sticky glass header
import { Show, createMemo, createSignal, onCleanup, onMount, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

/**
 * AppHeader — CineLog premium sticky glass header.
 *
 * Layout: [hamburger][search] ........... [avatar]
 *
 * NAVIGATION CONTRACT (per spec — "Each button must perform only its own action"):
 *   • Hamburger → opens a side drawer with secondary destinations
 *                 (Statistics, Upcoming, Settings, Trash, About). It does
 *                 NOT navigate to /profile. The avatar already does that.
 *   • Search    → navigates to /search (the intentional discovery-by-query
 *                 page). Does NOT redirect to /discover and does NOT open
 *                 the AuthModal.
 *   • Avatar    → navigates to /profile when signed in, opens the AuthModal
 *                 when signed out. This is the ONLY profile entry point in
 *                 the header.
 *
 * DESIGN: Frosted glass surface, soft blur, subtle bottom hairline, premium
 * shadow on scroll. Never adds extra buttons or duplicate profile access.
 */
const AppHeader: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);

  const initial = createMemo(() => {
    const name = user()?.displayName || user()?.email || "";
    return name.charAt(0).toUpperCase() || "?";
  });

  // Hamburger — opens the drawer (does NOT go to /profile).
  const handleHamburgerClick = () => {
    setDrawerOpen((v) => !v);
  };

  // Search — goes to the dedicated /search page.
  const handleSearchClick = () => {
    navigate("/search");
  };

  // Avatar — goes to /profile (or opens AuthModal when signed out).
  const handleAvatarClick = () => {
    if (isSignedIn()) {
      navigate("/profile");
    } else {
      openAuthModal();
    }
  };

  // Subtle shadow on scroll for the glass header.
  onMount(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  // Close drawer on Escape.
  const onDrawerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setDrawerOpen(false);
  };

  // Drawer destinations — secondary nav only. Primary tabs live in
  // BottomNavigation. Profile is intentionally NOT here (avatar handles it).
  const drawerItems = [
    { icon: "bar_chart", label: "Statistics", href: "/profile/stats" },
    { icon: "event_upcoming", label: "Upcoming", href: "/profile/upcoming" },
    { icon: "history", label: "History", href: "/profile/history" },
    { icon: "delete_sweep", label: "Trash", href: "/profile/trash" },
    { icon: "settings", label: "Settings", href: "/settings" },
  ] as const;

  return (
    <>
      <header
        class="cinelog-header glass-bar"
        classList={{ "is-scrolled": scrolled() }}
        role="banner"
      >
        {/* Left: hamburger + search */}
        <div class="cinelog-header-left">
          <button
            class="cinelog-header-icon-btn"
            type="button"
            aria-label="Open menu"
            aria-expanded={drawerOpen()}
            aria-controls="cinelog-header-drawer"
            onClick={handleHamburgerClick}
          >
            <span class="material-symbols-outlined" style={{ "font-size": "22px" }} aria-hidden="true">
              menu
            </span>
          </button>
          <button
            class="cinelog-header-icon-btn"
            type="button"
            aria-label="Search"
            onClick={handleSearchClick}
          >
            <span class="material-symbols-outlined" style={{ "font-size": "22px" }} aria-hidden="true">
              search
            </span>
          </button>
        </div>

        {/* Center: wordmark — only on inner pages for premium feel */}
        <div class="cinelog-header-wordmark" aria-hidden="true">
          CINE<span>LOG</span>
        </div>

        {/* Right: avatar */}
        <button
          type="button"
          class="cinelog-avatar-btn"
          onClick={handleAvatarClick}
          aria-label={isSignedIn() ? "Go to profile" : "Sign in"}
        >
          <Show
            when={isSignedIn()}
            fallback={
              <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">
                account_circle
              </span>
            }
          >
            <span class="cinelog-avatar-letter">{initial()}</span>
          </Show>
        </button>
      </header>

      {/* Slide-in drawer — opened by hamburger ONLY. */}
      <Show when={drawerOpen()}>
        <div
          class="cinelog-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={onDrawerKeyDown}
          role="button"
          tabindex={-1}
          aria-label="Close menu"
        />
        <aside
          id="cinelog-header-drawer"
          class="cinelog-drawer glass-surface-strong"
          role="dialog"
          aria-modal="false"
          aria-label="Secondary navigation"
          onKeyDown={onDrawerKeyDown}
        >
          <div class="cinelog-drawer-header">
            <span class="cinelog-drawer-title">Menu</span>
            <button
              type="button"
              class="cinelog-drawer-close"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <nav class="cinelog-drawer-nav" aria-label="Secondary">
            {drawerItems.map((item) => (
              <button
                type="button"
                class="cinelog-drawer-item"
                onClick={() => {
                  setDrawerOpen(false);
                  navigate(item.href);
                }}
              >
                <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>
      </Show>
    </>
  );
};

export default AppHeader;
