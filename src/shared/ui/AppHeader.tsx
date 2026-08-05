// src/shared/ui/AppHeader.tsx
//
// Phase 10 Chunk 1 — Desktop View & UI Architecture Redesign
// ───────────────────────────────────────────────────────────
// WHAT CHANGED:
//   • Removed the duplicate mobile slide-down search bar
//     (`app-header-search-mobile-bar`). It bound a SECOND GlassInput
//     to the same `search.query()` signal as the desktop inline bar,
//     so on desktop / tablet both inputs were mounted at once and
//     ⌘K triggered a duplicate search bar to slide down BELOW the
//     inline bar. The inline bar is now the single source of truth
//     for search input on desktop; mobile users tap the search icon
//     to navigate to /discover (which has its own search surface).
//
//   • Mobile search icon no longer toggles an overlay — it navigates
//     to /discover. The toggle behaviour (search-open / search-close
//     icon swap) was only there to drive the now-removed slide-down.
//
//   • Simplified the ⌘K handler — always focuses the desktop inline
//     bar (no need to check `search.searchOpen()` since the overlay
//     no longer exists).
//
//   • Removed `mobileSearchRef` and the createEffect that focused
//     it — no mobile input to focus anymore.
//
// VISUAL STRUCTURE:
//   MOBILE  (<1024px): [CINELOG] ........................ [🔍] [🔔]
//                       (search icon → /discover)
//
//   DESKTOP (≥1024px): [CINELOG] [────── search ──────] [➕] [☁️] [🔔] [👤]
//                       (inline expansive search bar)
//
// The breakpoint is 1024px (aligned with the desktop sidebar) — NOT
// 640px as it was before. This prevents the "stretched mobile app"
// feel on tablets where the desktop search bar showed without the
// desktop sidebar.

import {
  Show,
  createSignal,
  createEffect,
  onCleanup,
  type Component,
  type JSX
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import HeaderNotificationBell from "~/features/upcoming/components/HeaderNotificationBell";
import { useNotifications } from "~/features/upcoming/hooks/useNotifications";
import NotificationCenter from "~/features/upcoming/components/NotificationCenter";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { GlassIconButton, GlassInput } from "~/shared/ui/glass";

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

// Search-clear button rendered inside GlassInput's `rightContent` slot.
// Styled as a subtle pill so it doesn't compete with the search icon
// on the left. Used only by the desktop inline bar (the mobile
// slide-down that previously used it has been removed).
const SEARCH_CLEAR_BTN_STYLE: JSX.CSSProperties = {
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  width: "32px",
  height: "32px",
  "border-radius": "50%",
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition:
    "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)"
};

/**
 * AppHeader — sticky application header.
 *
 * MOBILE Layout  (<1024px): [CINELOG] .............. [🔍] [🔔]
 *   • Search icon navigates to /discover (no overlay).
 *   • BottomNavigation handles primary nav.
 *
 * DESKTOP Layout (≥1024px): [CINELOG] [search bar] [➕] [☁️] [🔔] [👤]
 *   • Inline expansive search bar (drives global SearchOverlay).
 *   • DesktopSidebar handles primary nav (left sidebar).
 *   • Quick Add + Cloud Sync + Avatar are desktop-only.
 *
 * GLASS SYSTEM:
 *   • All action buttons use <GlassIconButton size="default"> (44×44px,
 *     WCAG 2.5.5 compliant).
 *   • Search input uses <GlassInput> with `rightContent` slot for the
 *     clear button (or ⌘K hint when empty).
 */
const AppHeader: Component = () => {
  const { isSignedIn, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  // Global search context — drives the SearchOverlay rendered in AppShell.
  const search = useGlobalSearch();

  // Desktop inline search bar ref — focused on ⌘K.
  // The mobile slide-down bar's ref was removed along with the bar.
  let desktopSearchRef: HTMLInputElement | undefined;

  // ⌘K keyboard shortcut — focuses the desktop inline search input.
  // On mobile this is a no-op (desktopSearchRef is undefined because
  // the inline bar is hidden via CSS, but SolidJS still mounts it in
  // the DOM — so we additionally check viewport width to be safe).
  const handleShortcut = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      if (desktopSearchRef && typeof window !== "undefined" && window.innerWidth >= 1024) {
        e.preventDefault();
        desktopSearchRef.focus();
      }
    }
  };
  createEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", handleShortcut);
    onCleanup(() => window.removeEventListener("keydown", handleShortcut));
  });

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

  // Mobile search icon — navigates to /discover where the full search
  // experience lives. Previously this opened a slide-down overlay with
  // its own GlassInput (the "dummy" duplicate search bar), which has
  // been removed.
  const handleMobileSearchClick = () => {
    navigate("/discover");
  };

  const handleSearchSubmit = (e: Event) => {
    e.preventDefault();
    search.commitSearch(search.query());
  };

  // Clear button rendered inside the desktop GlassInput's rightContent slot.
  const renderClearButton = () => (
    <button
      type="button"
      class="focus-ring"
      style={SEARCH_CLEAR_BTN_STYLE}
      onClick={() => {
        search.setQuery("");
        desktopSearchRef?.focus();
      }}
      aria-label="Clear search"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--tier-3)";
        e.currentTarget.style.color = "var(--text-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <span
        class="material-symbols-outlined"
        style={{ "font-size": "18px" }}
        aria-hidden="true"
      >
        close
      </span>
    </button>
  );

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
        class="font-headline m-0 app-header__wordmark"
        aria-label="CineLog"
        style={WORDMARK_STYLE}
      >
        CINE<span style={WORDMARK_ACCENT_STYLE}>LOG</span>
      </h1>

      {/* Desktop inline search bar — always visible on desktop (≥1024px),
          hidden on mobile/tablet. Drives the global SearchOverlay. */}
      <div class="app-header__search-desktop">
        <form
          class="app-header-search-form"
          onSubmit={handleSearchSubmit}
          role="search"
        >
          <GlassInput
            ref={desktopSearchRef}
            type="search"
            icon="search"
            placeholder="Search movies, series, anime…"
            value={search.query()}
            onInput={(e) => search.setQuery(e.currentTarget.value)}
            aria-label="Search movies, series, and anime"
            autocomplete="off"
            spellcheck={false}
            rightContent={
              <Show
                when={search.query()}
                fallback={
                  <span
                    class="app-header-search-shortcut"
                    style={{
                      "font-size": "11px",
                      color: "var(--text-dim)",
                      "font-family": "'Azeret Mono', monospace",
                      padding: "2px 6px",
                      "border-radius": "var(--radius-sm)",
                      border: "1px solid var(--hairline-2)"
                    }}
                  >
                    ⌘K
                  </span>
                }
              >
                {renderClearButton()}
              </Show>
            }
          />
          <button type="submit" class="sr-only">
            Search
          </button>
        </form>
      </div>

      {/* Right cluster — mobile search icon + quick-add + sync + bell + avatar.
          The mobile search icon, quick-add, sync, and avatar are individually
          toggled by CSS at the 1024px breakpoint (see glass-system.css). */}
      <div class="flex items-center gap-1.5">
        {/* Mobile search icon — visible only on mobile/tablet (<1024px).
            Navigates to /discover (no overlay). */}
        <GlassIconButton
          class="app-header__search-mobile"
          variant="secondary"
          size="default"
          icon="search"
          label="Search"
          onClick={handleMobileSearchClick}
        />

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
