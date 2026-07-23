// src/shared/ui/AppHeader.tsx — Dulo.tv-inspired header
import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

/**
 * AppHeader — Dulo.tv-style minimal sticky header.
 *
 * Layout: [hamburger][search] ........... (wordmark is omitted on inner
 * pages; Dulo.tv only shows the logo on the hero/home page).
 * On desktop: sidebar-style nav appears; on mobile: bottom tabs.
 */
const AppHeader: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();

  const initial = createMemo(() => {
    const name = user()?.displayName || user()?.email || "";
    return name.charAt(0).toUpperCase() || "?";
  });

  const handleAvatarClick = () => {
    if (isSignedIn()) {
      navigate("/profile");
    } else {
      openAuthModal();
    }
  };

  return (
    <header
      class="dulo-header"
      role="banner"
    >
      {/* Left: hamburger + search (Dulo.tv pattern) */}
      <div class="dulo-header-left">
        <button
          class="dulo-header-icon-btn"
          type="button"
          aria-label="Open menu"
          onClick={handleAvatarClick}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "22px" }}>
            menu
          </span>
        </button>
        <button
          class="dulo-header-icon-btn"
          type="button"
          aria-label="Search"
          onClick={() => navigate("/discover")}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "22px" }}>
            search
          </span>
        </button>
      </div>

      {/* Right: avatar */}
      <button
        type="button"
        class="dulo-avatar-btn"
        onClick={handleAvatarClick}
        aria-label={isSignedIn() ? "Go to profile" : "Sign in"}
      >
        <Show
          when={isSignedIn()}
          fallback={
            <span class="material-symbols-outlined" style={{ "font-size": "20px" }}>
              account_circle
            </span>
          }
        >
          <span class="dulo-avatar-letter">{initial()}</span>
        </Show>
      </button>
    </header>
  );
};

export default AppHeader;
