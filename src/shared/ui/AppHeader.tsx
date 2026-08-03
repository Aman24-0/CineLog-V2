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
 * MOBILE Layout: [wordmark] ........ [search] [bell]
 * DESKTOP Layout: [wordmark] [search bar] .... [quick-add] [sync] [bell] [avatar]
 *
 * Search is now a global feature — an icon button that expands into the
 * search bar with a smooth animation. The search bar is always visible
 * on desktop (expanded by default) and collapsed to an icon on mobile.
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

  // Global search context — shared with DiscoverPage
  const search = useGlobalSearch();
  let searchInputRef: HTMLInputElement | undefined;

  // When search bar opens, focus the input and navigate to /discover
  createEffect(() => {
    if (search.searchOpen()) {
      // Small delay to allow the animation to start before focusing
      setTimeout(() => searchInputRef?.focus(), 100);
      // If we're not on /discover, navigate there so results show
      if (!window.location.pathname.startsWith("/discover")) {
        navigate("/discover");
      }
    }
  });

  // Close search on Escape
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && search.searchOpen()) {
      search.setSearchOpen(false);
      search.setQuery("");
    }
  };

  // Click-outside handler for the search bar
  let searchContainerRef: HTMLDivElement | undefined;
  const handleClickOutside = (e: MouseEvent) => {
    if (
      search.searchOpen() &&
      searchContainerRef &&
      !searchContainerRef.contains(e.target as Node)
    ) {
      search.setSearchOpen(false);
    }
  };

  createEffect(() => {
    if (search.searchOpen()) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    });
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

      {/* ── Global Search ──────────────────────────────────────────
          MOBILE: Search icon button → expands into search bar
          DESKTOP: Always-visible search bar (pill style) */}

      {/* Desktop search bar — always visible on desktop */}
      <div class="app-header__search-desktop" ref={searchContainerRef}>
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
                onClick={() => {
                  search.setQuery("");
                  searchInputRef?.focus();
                }}
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

      {/* Mobile search icon — toggles the search bar */}
      <button
        type="button"
        class="app-header__search-mobile focus-ring"
        style={HEADER_ACTION_STYLE}
        onClick={() => {
          if (search.searchOpen()) {
            search.setSearchOpen(false);
            search.setQuery("");
          } else {
            search.setSearchOpen(true);
          }
        }}
        aria-label="Search"
        title="Search"
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "20px" }}
          aria-hidden="true"
        >
          {search.searchOpen() ? "close" : "search"}
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

      {/* Mobile expanded search bar — slides down below the header */}
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
                  // Auto-focus when the mobile search bar opens
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
              <Show when={search.query()}>
                <button
                  type="button"
                  class="app-header-search-clear focus-ring"
                  onClick={() => {
                    search.setQuery("");
                    searchInputRef?.focus();
                  }}
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
