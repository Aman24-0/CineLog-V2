// src/shared/ui/AppHeader.tsx
import { Show, createMemo } from "solid-js";
import Icon from "./Icon";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { signOut } from "~/shared/hooks/useAuthActions";

/**
 * Sticky application header — V2 simplified.
 *
 * Layout: [wordmark] ........ [avatar]
 *
 * Behavior:
 *  - Signed out: avatar shows a generic account icon; clicking opens the
 *    email/password auth modal.
 *  - Signed in: avatar shows the user's photoURL (or initial fallback);
 *    clicking signs out.
 */
export default function AppHeader() {
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
      class="sticky top-0 z-30 flex items-center justify-between backdrop-blur"
      style={{
        background: "rgba(5,6,10,0.80)",
        "border-bottom": "1px solid var(--hairline)",
        "padding-top": "calc(0.875rem + env(safe-area-inset-top, 0px))",
        "padding-bottom": "0.875rem",
        "padding-left": "1.25rem",
        "padding-right": "1.25rem"
      }}
      role="banner"
    >
      {/* Wordmark — single primary element */}
      <h1
        class="font-headline leading-none tracking-wide m-0"
        style={{ "font-size": "1.5rem" }}
      >
        CINE<span style="color: var(--p)">LOG</span>
      </h1>

      {/* Avatar — single secondary element */}
      <button
        type="button"
        onClick={handleAvatarClick}
        class="flex items-center gap-2 rounded-full transition-all active:scale-95 overflow-hidden focus-ring"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--hairline)",
          padding: "0.25rem",
          "padding-right": "0.625rem"
        }}
        aria-label={isSignedIn() ? `Signed in as ${user()?.displayName || user()?.email || "user"} — click to sign out` : "Sign in"}
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
                "font-family": "'Outfit', sans-serif"
              }}
              aria-hidden="true"
            >
              {initial()}
            </div>
          }
        >
          <img loading="lazy" decoding="async"
            src={user()!.photoURL!}
            alt=""
            class="h-8 w-8 rounded-full object-cover shrink-0"
            referrerpolicy="no-referrer"
          />
        </Show>
        <Show when={isSignedIn()}>
          <span
            class="hidden sm:block max-w-[120px] truncate"
            style={{ color: "var(--text-body)", "font-size": "0.8125rem", "font-weight": 600 }}
          >
            {user()?.displayName || user()?.email}
          </span>
        </Show>
      </button>
    </header>
  );
}
