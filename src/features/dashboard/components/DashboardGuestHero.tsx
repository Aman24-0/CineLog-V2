// src/features/dashboard/components/DashboardGuestHero.tsx
import { Show } from "solid-js";
import { Button } from "~/shared/ui/primitives";

/**
 * DashboardGuestHero — the empty/guest state for the Dashboard hero.
 *
 * Shown when:
 *   - The user is a guest (not signed in) → "Your Universe Awaits" + Sign In CTA
 *   - The user is signed in but has an empty vault → "Start Your Collection"
 *
 * Extracted from DashboardHero.tsx to keep that file under the 250-line
 * limit. Uses the same visual language (greeting-eyebrow, type-display-sm,
 * guest-hero-content) as the main hero.
 */
export interface DashboardGuestHeroProps {
  isGuest: boolean;
  onLogin: () => void;
}

export default function DashboardGuestHero(props: DashboardGuestHeroProps) {
  return (
    <div class="guest-hero animate-fade-in">
      <div class="guest-hero-content">
        <div
          class="flex items-center justify-center w-16 h-16 rounded-2xl mb-2"
          style={{
            background: "var(--p-dim)",
            border: "1px solid color-mix(in srgb, var(--p) 25%, transparent)",
            "box-shadow": "0 0 24px var(--p-glow)",
          }}
          aria-hidden="true"
        >
          <span
            class="material-symbols-outlined"
            style={{
              "font-size": "32px",
              color: "var(--p)",
              "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
            aria-hidden="true"
          >
            {props.isGuest ? "clapperboard" : "movie_filter"}
          </span>
        </div>

        <span class="greeting-eyebrow">
          {props.isGuest ? "Preview Mode" : "Empty Vault"}
        </span>

        <h2 class="type-display-sm" style={{ "text-align": "center" }}>
          {props.isGuest ? "Your Universe Awaits" : "Start Your Collection"}
        </h2>

        <p
          class="type-body-soft"
          style={{ "text-align": "center", "max-width": "280px" }}
        >
          {props.isGuest
            ? "Sign in to build your personal cinematic universe, track progress, and get tailored recommendations."
            : "Search for movies and series to start building your collection."}
        </p>

        <Show when={props.isGuest}>
          <Button
            variant="primary"
            size="md"
            icon="login"
            onClick={props.onLogin}
            style={{ "margin-top": "0.5rem" }}
            aria-label="Sign in to begin"
          >
            Sign In to Begin
          </Button>
        </Show>
      </div>
    </div>
  );
}
