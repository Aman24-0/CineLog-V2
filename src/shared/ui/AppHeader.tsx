// src/shared/ui/AppHeader.tsx
import {
  Show,
  createMemo,
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

// ─── Module-level style constants ────────────────────────────────────
const WORDMARK_STYLE: JSX.CSSProperties = {
  "font-size": "1.5rem",
  "line-height": "1",
  "letter-spacing": "0.08em",
  color: "var(--text-strong)"
};
const WORDMARK_ACCENT_STYLE: JSX.CSSProperties = { color: "var(--p)" };

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
 * MOBILE Layout:  [CINELOG] .............. [🔍] [🔔]
 * DESKTOP Layout: [CINELOG] [search bar] .. [quick-add] [sync] [🔔] [avatar]
 *
 * Search is a GLOBAL feature. The 🔍 icon sits beside the bell on the
 * right side. Tapping it opens the search overlay (a slide-down panel
 * below the header) without navigating away from the current page.
 * Closing the overlay resets ALL search state completely.
 */
const AppHeader: Component = () => {
  const { isSignedIn, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = createSignal(false);

  // Global search context — independent from DiscoverPage
  const search = useGlobalSearch();
  let searchInputRef: HTMLInputElement | undefined;

  // Focus the search input when the overlay opens
  createEffect(() => {
    if (search.searchOpen()) {
      setTimeout(() => searchInputRef?.focus(), 80);
    }
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

  // Clear button — single clear button that clears text AND results
  const handleClearSearch = () => {
    search.setQuery("");
    searchInputRef?.focus();
  };

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
          wordmark and right cluster */}
      <div class="app-header__search-desktop">
        <form
          class="app-header-search-form"
          onSubmit={handleSearchSubmit}
          role="search"
        >
          <div class="app-header-search-bar">
            <span
              class="material-symbols-outlined app-header-search-icon"
              aria-hidden="true"
            >
              search
            </span>
            <input
              ref={searchInputRef}
              type="search"
              class="app-header-search-input"
              placeholder="Search movies, series, anime…"
              value={search.query()}
              onInput={(e) => search.setQuery(e.currentTarget.value)}
              aria-label="Search movies, series, and anime"
              autocomplete="off"
              spellcheck={false}
            />
            <Show when={search.query()}>
              <button
                type="button"
                class="app-header-search-clear focus-ring"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "18px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </Show>
            <Show when={!search.query()}>
              <span class="app-header-search-shortcut">⌘K</span>
            </Show>
          </div>
          <button type="submit" class="sr-only">
            Search
          </button>
        </form>
      </div>

      {/* Right cluster — search icon (mobile) + quick-add + sync + bell + avatar */}
      <div class="flex items-center gap-1.5">
        {/* Mobile search icon — toggles the overlay. On desktop, this is hidden. */}
        <button
          type="button"
          class="app-header__search-mobile focus-ring"
          style={HEADER_ACTION_STYLE}
          onClick={() => {
            if (search.searchOpen()) {
              search.closeSearch();
            } else {
              search.openSearch();
            }
          }}
          aria-label={search.searchOpen() ? "Close search" : "Search"}
          title={search.searchOpen() ? "Close" : "Search"}
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "20px" }}
            aria-hidden="true"
          >
            {search.searchOpen() ? "close" : "search"}
          </span>
        </button>

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

      {/* Mobile search overlay — slides down below the header */}
      <Show when={search.searchOpen()}>
        <div class="app-header-search-mobile-bar">
          <form
            class="app-header-search-mobile-form"
            onSubmit={handleSearchSubmit}
            role="search"
          >
            <div class="app-header-search-bar">
              <span
                class="material-symbols-outlined app-header-search-icon"
                aria-hidden="true"
              >
                search
              </span>
              <input
                ref={(el) => {
                  searchInputRef = el;
                  setTimeout(() => el.focus(), 50);
                }}
                type="search"
                class="app-header-search-input"
                placeholder="Search movies, series, anime…"
                value={search.query()}
                onInput={(e) => search.setQuery(e.currentTarget.value)}
                aria-label="Search movies, series, and anime"
                autocomplete="off"
                spellcheck={false}
              />
              {/* Single clear button — clears text + results */}
              <Show when={search.query()}>
                <button
                  type="button"
                  class="app-header-search-clear focus-ring"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "18px" }}
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
              </Show>
            </div>
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
