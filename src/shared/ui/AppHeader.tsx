// src/shared/ui/AppHeader.tsx
import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

/**
 * AppHeader — premium OTT-style sticky header.
 *
 * Layout: [CINELOG wordmark] ........ [avatar button]
 *
 * Visual-only redesign — no logic, routing, ARIA, or auth changes.
 * The avatar still navigates to /profile when signed in, or opens
 * the AuthModal when not.
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
      class="sticky top-0 z-30 flex items-center justify-between"
      style={{
        background: "rgba(9,9,9,0.80)",
        "backdrop-filter": "blur(28px) saturate(160%)",
        "-webkit-backdrop-filter": "blur(28px) saturate(160%)",
        "border-bottom": "1px solid rgba(255,255,255,0.05)",
        "padding-top": "calc(12px + env(safe-area-inset-top, 0px))",
        "padding-bottom": "12px",
        "padding-left": "20px",
        "padding-right": "20px",
      }}
      role="banner"
    >
      {/* Wordmark — Inter, extrabold, tight tracking */}
      <h1
        class="m-0"
        style={{
          "font-family": "'Inter', sans-serif",
          "font-size": "22px",
          "line-height": "1",
          "font-weight": "800",
          "letter-spacing": "-0.03em",
          color: "#FFFFFF",
        }}
      >
        CINE<span style={{ color: "#8A624C" }}>LOG</span>
      </h1>

      {/* Avatar — circular, glass */}
      <button
        type="button"
        onClick={handleAvatarClick}
        class="flex items-center gap-2 rounded-full overflow-hidden focus-ring"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "3px",
          "padding-right": "12px",
          transition:
            "background 200ms ease, border-color 200ms ease, transform 150ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
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
                background: "rgba(138,98,76,0.20)",
                color: "#C9A584",
                "font-weight": 700,
                "font-size": "13px",
                "font-family": "'Inter', sans-serif",
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
              color: "#FFFFFF",
              "font-size": "14px",
              "font-weight": 500,
              "font-family": "'Inter', sans-serif",
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
