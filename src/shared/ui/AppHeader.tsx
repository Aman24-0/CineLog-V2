// src/shared/ui/AppHeader.tsx
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
// on the left. Re-used by both desktop and mobile search bars.
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
  transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)"
};

/**
 * AppHeader — sticky application header.
 *
 * MOBILE Layout:  [CINELOG] .............. [🔍] [🔔]
 * DESKTOP Layout: [CINELOG] [search bar] .. [quick-add] [sync] [🔔] [avatar]
 *
 * Search is a GLOBAL feature. The 🔍 icon sits beside the bell on the
 * right side. Tapping it opens the search overlay (a slide-down panel
 * below the header) without navigating away from the current page.
 * Closing the overlay resets ALL search state completely.
 *
 * GLASS SYSTEM MIGRATION:
 *   The header's action buttons now use <GlassIconButton size="default">
 *   (44×44px) instead of hand-rolled <button> + style constants. This:
 *     1. Satisfies WCAG 2.5.5 (Target Size — 44×44px minimum).
 *     2. Eliminates the duplicate style between mobile/desktop buttons.
 *     3. Gives us free variants, loading states, badges, and focus
 *        rings via the shared component.
 *
 *   The search inputs now use <GlassInput>. Both the desktop search
 *   bar and the mobile search overlay previously bound the SAME
 *   `searchInputRef` variable — when both were mounted at once on
 *   desktop (the mobile overlay is rendered conditionally but was
 *   using a callback ref that overwrote the desktop ref), focusing
 *   the desktop bar would silently lose its ref. The new code uses
 *   SEPARATE refs for desktop and mobile inputs, eliminating the
 *   collision. GlassInput forwards `ref` via JSX spread, so each
 *   input has its own stable ref.
 */
const AppHeader: Component = () => {
  const { isSignedIn, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  // Global search context — independent from DiscoverPage
  const search = useGlobalSearch();

  // SEPARATE refs for desktop and mobile search inputs. Previously
  // the mobile overlay's callback ref OVERWROTE the desktop ref when
  // both were mounted, causing focus() calls to land on the wrong
  // input (the audit flagged this as a "duplicate ref collision bug").
  // Each input now owns its own ref.
  let desktopSearchRef: HTMLInputElement | undefined;
  let mobileSearchRef: HTMLInputElement | undefined;

  // Focus the search input when the overlay opens. The mobile overlay
  // is the one that needs auto-focus (desktop input is always visible
  // and is focused only on ⌘K). We focus whichever input is currently
  // mounted — mobile takes priority when search.searchOpen() is true.
  createEffect(() => {
    if (search.searchOpen()) {
      setTimeout(() => mobileSearchRef?.focus(), 80);
    }
  });

  // ⌘K keyboard shortcut — focuses the desktop search input when the
  // overlay is NOT open. The desktop bar is hidden on mobile, so this
  // is a no-op there (mobileSearchRef is undefined on desktop).
  const handleShortcut = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      // Only intercept when the desktop search input exists (desktop)
      // and the mobile overlay isn't already open.
      if (desktopSearchRef && !search.searchOpen()) {
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

  const handleSearchSubmit = (e: Event) => {
    e.preventDefault();
    search.commitSearch(search.query());
  };

  // Clear button — single clear button that clears text AND results.
  // Re-rendered into whichever input's `rightContent` slot is active.
  const renderClearButton = (inputRef: HTMLInputElement | undefined) => (
    <button
      type="button"
      class="focus-ring"
      style={SEARCH_CLEAR_BTN_STYLE}
      onClick={() => {
        search.setQuery("");
        inputRef?.focus();
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
      {/* Wordmark */}
      <h1
        class="font-headline m-0 app-header__wordmark"
        aria-label="CineLog"
        style={WORDMARK_STYLE}
      >
        CINE<span style={WORDMARK_ACCENT_STYLE}>LOG</span>
      </h1>

      {/* Desktop search bar — always visible on desktop, sits between
          wordmark and right cluster. Uses GlassInput for consistent
          glass styling and a stable ref. The mobile overlay (below)
          has its own GlassInput with a separate ref — no collision. */}
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
              <Show when={search.query()} fallback={
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
              }>
                {renderClearButton(desktopSearchRef)}
              </Show>
            }
          />
          <button type="submit" class="sr-only">
            Search
          </button>
        </form>
      </div>

      {/* Right cluster — search icon (mobile) + quick-add + sync + bell + avatar */}
      <div class="flex items-center gap-1.5">
        {/* Mobile search icon — toggles the overlay. On desktop, this is hidden. */}
        <Show
          when={search.searchOpen()}
          fallback={
            <GlassIconButton
              class="app-header__search-mobile"
              variant="secondary"
              size="default"
              icon="search"
              label="Search"
              onClick={() => search.openSearch()}
            />
          }
        >
          <GlassIconButton
            class="app-header__search-mobile"
            variant="secondary"
            size="default"
            icon="close"
            label="Close search"
            onClick={() => search.closeSearch()}
          />
        </Show>

        {/* Desktop Quick Add — hidden on mobile. size="default" (44×44) */}
        <GlassIconButton
          class="app-header__action"
          variant="secondary"
          size="default"
          icon="add"
          label="Quick add"
          onClick={handleQuickAdd}
        />

        {/* Desktop Sync Status — hidden on mobile */}
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

        {/* Notification bell */}
        <HeaderNotificationBell
          unreadCount={notif.unreadCount}
          onClick={() => setNotifOpen(true)}
        />

        {/* Desktop User Avatar — hidden on mobile. Now 44×44 to meet WCAG 2.5.5. */}
        <button
          type="button"
          class="app-header__avatar focus-ring"
          style={AVATAR_STYLE}
          onClick={handleAvatarClick}
          aria-label={isSignedIn() ? "Profile" : "Sign in"}
          title={isSignedIn() ? "Profile" : "Sign in"}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            {isSignedIn() ? "person" : "login"}
          </span>
        </button>
      </div>

      {/* Mobile search overlay — slides down below the header. Uses its
          OWN GlassInput with a separate ref (mobileSearchRef) so the
          desktop bar's ref is never overwritten. */}
      <Show when={search.searchOpen()}>
        <div class="app-header-search-mobile-bar">
          <form
            class="app-header-search-mobile-form"
            onSubmit={handleSearchSubmit}
            role="search"
          >
            <GlassInput
              ref={mobileSearchRef}
              type="search"
              icon="search"
              placeholder="Search movies, series, anime…"
              value={search.query()}
              onInput={(e) => search.setQuery(e.currentTarget.value)}
              aria-label="Search movies, series, and anime"
              autocomplete="off"
              spellcheck={false}
              rightContent={
                <Show when={search.query()}>
                  {renderClearButton(mobileSearchRef)}
                </Show>
              }
            />
            <button type="submit" class="sr-only">
              Search
            </button>
          </form>
        </div>
      </Show>

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
