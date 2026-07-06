// src/shared/ui/AppHeader.tsx
import { Show, createMemo } from "solid-js";
import Icon from "./Icon";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { login, logout } from "~/core/firebase/auth";

/**
 * Sticky application header.
 *
 * Layout: [logo + CineLog title] ........ [notification] [avatar/profile]
 *
 * Behavior:
 *  - When signed out: avatar shows a generic account icon; clicking prompts
 *    Google sign-in.
 *  - When signed in: avatar shows the user's photoURL (or initial fallback);
 *    clicking signs out (with a toast).
 *  - Notification bell is a placeholder for Phase 2.
 *
 * The header is sticky (top: 0) and uses a translucent backdrop blur so page
 * content scrolls cleanly underneath.
 */
export default function AppHeader() {
  const { user, isSignedIn } = useAuth();
  const { showToast } = useToast();

  const initial = createMemo(() => {
    const name = user()?.displayName || user()?.email || "";
    return name.charAt(0).toUpperCase() || "?";
  });

  const handleAvatarClick = async () => {
    if (isSignedIn()) {
      try {
        await logout();
        showToast("Signed out", "info");
      } catch {
        showToast("Sign out failed", "error");
      }
    } else {
      try {
        await login();
        showToast("Signed in successfully! 🎬", "success");
      } catch {
        showToast("Sign in failed. Please try again.", "error");
      }
    }
  };

  const handleNotifications = () => {
    showToast("Notifications coming in Phase 2", "info", 2000);
  };

  return (
    <header
      class="sticky top-0 z-30 flex items-center justify-between px-5 py-3 backdrop-blur"
      style={{
        background: "rgba(5,6,10,0.85)",
        "border-bottom": "1px solid var(--border)",
        // Reserve space for iOS status bar via safe-area-inset-top.
        "padding-top": "calc(0.75rem + env(safe-area-inset-top, 0px))"
      }}
      role="banner"
    >
      {/* Logo + title */}
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
          style="background: var(--p-dim);"
          aria-hidden="true"
        >
          <Icon name="movie_filter" fill style="color: var(--p); font-size: 20px" />
        </div>
        <div class="min-w-0">
          <h1 class="font-headline text-xl leading-none tracking-wide">
            CINE<span style="color: var(--p)">LOG</span>
          </h1>
          <p class="type-caption hidden sm:block" style="margin-top: 2px">
            Personal Movie Vault
          </p>
        </div>
      </div>

      {/* Right cluster: notifications + avatar */}
      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={handleNotifications}
          class="relative flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--muted)",
            border: "1px solid var(--border)"
          }}
          aria-label="Notifications (coming in Phase 2)"
        >
          <Icon name="notifications" style="font-size: 18px" />
          {/* Unread dot placeholder */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "7px",
              right: "8px",
              width: "6px",
              height: "6px",
              "border-radius": "50%",
              background: "var(--p)",
              "box-shadow": "0 0 6px var(--p-glow)"
            }}
          />
        </button>

        <button
          type="button"
          onClick={handleAvatarClick}
          class="flex items-center gap-2 rounded-full transition-all active:scale-95 overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border)",
            "padding-right": "0.5rem",
            "padding-left": "0.25rem",
            "padding-top": "0.125rem",
            "padding-bottom": "0.125rem"
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
            <img
              src={user()!.photoURL!}
              alt=""
              class="h-8 w-8 rounded-full object-cover shrink-0"
              referrerpolicy="no-referrer"
            />
          </Show>
          <Show when={isSignedIn()}>
            <span
              class="hidden sm:block max-w-[100px] truncate"
              style={{ color: "var(--text)", "font-size": "12px", "font-weight": 600 }}
            >
              {user()?.displayName || user()?.email}
            </span>
          </Show>
        </button>
      </div>
    </header>
  );
}
