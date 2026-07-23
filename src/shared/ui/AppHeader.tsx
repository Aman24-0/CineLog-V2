// src/shared/ui/AppHeader.tsx
import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

/**
 * AppHeader — sticky application header.
 *
 * Layout: [wordmark] ........ [avatar pill]
 *
 * Navigation restructure (Profile phase):
 *   The avatar NO LONGER signs out on click. That was an undiscoverable
 *   trap-door — users had no way to know clicking the avatar would log
 *   them out. The avatar now navigates to /profile, which is the
 *   natural destination for "who am I" actions. Sign out lives inside
 *   Profile → Settings → Account → Sign Out, where it belongs.
 *
 *   When the user is NOT signed in, the avatar opens the AuthModal
 *   (same as before).
 *
 * Polished:
 *  - Wordmark uses font-headline (Bebas Neue) with the accent suffix.
 *  - Avatar pill is a glass surface with a hairline border, smoother
 *    hover (background + border-color transition), and a focus ring.
 *  - Sticky header uses a stronger backdrop blur (20px) so content
 *    scrolling underneath stays readable but not distracting.
 *  - Safe-area-aware top padding (env(safe-area-inset-top)) so the
 *    header never sits under the iOS notch / PWA chrome.
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
      class="sticky top-0 z-30 flex items-center justify-between app-header-bg"
      style={{
        background: "rgba(10, 10, 16, 0.82)",
        "backdrop-filter": "blur(28px) saturate(160%)",
        "-webkit-backdrop-filter": "blur(28px) saturate(160%)",
        "border-bottom": "1px solid rgba(255,255,255,0.07)",
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
          "letter-spacing": "0.08em",
          color: "var(--text-strong)",
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
          background: "var(--hairline)",
          border: "1px solid var(--hairline-2)",
          padding: "0.25rem",
          "padding-right": "0.625rem",
          transition:
            "background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-spring)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hairline-2)";
          e.currentTarget.style.borderColor = "var(--hairline-3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--hairline)";
          e.currentTarget.style.borderColor = "var(--hairline-2)";
        }}
        aria-label={
          isSignedIn()
            ? `View your profile — signed in as ${user()?.displayName || user()?.email || "user"}`
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
