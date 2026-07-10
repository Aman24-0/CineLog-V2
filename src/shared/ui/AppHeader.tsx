// src/shared/ui/AppHeader.tsx
import { Show, createMemo, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { signOut } from "~/shared/hooks/useAuthActions";

/**
 * AppHeader — sticky application header.
 *
 * Layout: [wordmark] ........ [avatar pill]
 *
 * Polished:
 *  - Wordmark uses font-headline (Bebas Neue) with the accent suffix.
 *  - Avatar pill is a glass surface with a hairline border, smoother
 *    hover (background + border-color transition), and a focus ring.
 *  - Avatar image has onError fallback to the initial tile (handled
 *    by the Show fallback).
 *  - aria-label on the avatar button is context-aware (sign in vs
 *    sign out) so screen-reader users know what the button does.
 *  - Sticky header uses a stronger backdrop blur (20px) so content
 *    scrolling underneath stays readable but not distracting.
 *  - Safe-area-aware top padding (env(safe-area-inset-top)) so the
 *    header never sits under the iOS notch / PWA chrome.
 */
const AppHeader: Component = () => {
  const { user, isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();

  const initial = createMemo(() => {
    const name = user()?.displayName || user()?.email || "";
    return name.charAt(0).toUpperCase() || "?";
  });

  const handleAvatarClick = async () => {
    if (isSignedIn()) {
      await signOut();
    } else {
      openAuthModal();
    }
  };

  return (
    <header
      class="sticky top-0 z-30 flex items-center justify-between"
      style={{
        background: "rgba(5,6,10,0.80)",
        "backdrop-filter": "blur(20px) saturate(140%)",
        "-webkit-backdrop-filter": "blur(20px) saturate(140%)",
        "border-bottom": "1px solid var(--hairline)",
        "padding-top": "calc(0.875rem + env(safe-area-inset-top, 0px))",
        "padding-bottom": "0.875rem",
        "padding-left": "1.25rem",
        "padding-right": "1.25rem",
      }}
      role="banner"
    >
      {/* Wordmark */}
      <h1
        class="font-headline m-0"
        style={{
          "font-size": "1.5rem",
          "line-height": "1",
          "letter-spacing": "0.04em",
        }}
      >
        CINE<span style={{ color: "var(--p)" }}>LOG</span>
      </h1>

      {/* Avatar pill */}
      <button
        type="button"
        onClick={handleAvatarClick}
        class="flex items-center gap-2 rounded-full overflow-hidden focus-ring"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--hairline)",
          padding: "0.25rem",
          "padding-right": "0.625rem",
          transition:
            "background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-spring)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.borderColor = "var(--hairline-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          e.currentTarget.style.borderColor = "var(--hairline)";
        }}
        aria-label={
          isSignedIn()
            ? `Signed in as ${user()?.displayName || user()?.email || "user"} — click to sign out`
            : "Sign in"
        }
      >
        <Show
          when={user()?.photoURL}
          fallback={
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full shrink-0"
              style={{
                background: "var(--p-dim)",
                color: "var(--p)",
                "font-weight": 700,
                "font-size": "13px",
                "font-family": "'Outfit', sans-serif",
              }}
              aria-hidden="true"
            >
              {initial()}
            </div>
          }
        >
          <img
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            src={user()!.photoURL!}
            alt=""
            class="h-8 w-8 rounded-full object-cover shrink-0"
            referrerpolicy="no-referrer"
          />
        </Show>
        <Show when={isSignedIn()}>
          <span
            class="hidden sm:block max-w-[120px] truncate"
            style={{
              color: "var(--text-body)",
              "font-size": "0.8125rem",
              "font-weight": 600,
            }}
          >
            {user()?.displayName || user()?.email}
          </span>
        </Show>
      </button>
    </header>
  );
};

export default AppHeader;
