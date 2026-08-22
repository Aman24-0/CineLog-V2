// src/features/watchlist/components/EmptyState.tsx — Library empty states
import { Show } from "solid-js";
import { GlassEmptyState, GlassSurface, GlassButton } from "~/shared/ui/glass";
import Icon from "~/shared/ui/Icon";

interface EmptyStateProps {
  isGuest?: boolean;
  title: string;
  message: string;
  actionText: string;
  onAction: () => void;
  onLogin?: () => void;
  /**
   * Variant controls the visual style and copy defaults:
   *  - "first-use": onboarding-style for brand-new users (friendly icon, discover CTA)
   *  - "filtered":  no items match the current filters (adjust-filters CTA)
   *  - "error":     something went wrong (retry CTA) — the existing default
   * Defaults to "error" for backward compatibility.
   */
  variant?: "first-use" | "filtered" | "error";
}

/**
 * GlassEmptyState for the Library.
 *
 * Variants:
 *  - Guest: glass surface with accent CTA (sign-in prompt)
 *  - first-use: onboarding icon + discover CTA ("Your Library is empty")
 *  - filtered:  filter icon + "No items match your filters"
 *  - error:     dissatisfied icon + retry action (original default)
 *
 * Polished:
 *  - role="status" + aria-live so screen readers announce state changes.
 *  - .focus-ring on action buttons for keyboard users.
 */
export default function EmptyState(props: EmptyStateProps) {
  const variant = () => props.variant ?? "error";

  // Pick icon + visual treatment per variant
  const icon = () => {
    switch (variant()) {
      case "first-use":
        return "bookmark_add";
      case "filtered":
        return "filter_list_off";
      default:
        return "sentiment_dissatisfied";
    }
  };

  const isOnboarding = () => variant() === "first-use";

  return (
    <Show
      when={!props.isGuest}
      fallback={
        <GlassSurface
          strength="strong"
          class="flex min-h-[300px] flex-col items-center justify-center rounded-[2rem] p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <div class="mb-4 text-[var(--p)]">
            <Icon name="video_library" fill style={{ "font-size": "32px" }} />
          </div>
          <h3 class="mb-2 text-xl font-medium text-white">{props.title}</h3>
          <p class="mb-6 max-w-[300px] text-[var(--text-muted)]">
            {props.message}
          </p>
          <GlassButton
            variant="primary"
            onClick={() => props.onAction()}
            aria-label={props.actionText}
          >
            {props.actionText}
          </GlassButton>
        </GlassSurface>
      }
    >
      <div class={isOnboarding() ? "py-16" : "py-12"}>
        <Show
          when={isOnboarding()}
          fallback={
            <GlassEmptyState
              icon={icon()}
              title={props.title}
              message={props.message}
              action={
                <GlassButton
                  variant="primary"
                  onClick={() => props.onAction()}
                  aria-label={props.actionText}
                >
                  {props.actionText}
                </GlassButton>
              }
            />
          }
        >
          {/* Onboarding / first-use variant — larger, friendlier, with
              a discover CTA that feels like an invitation, not an error. */}
          <GlassSurface
            strength="strong"
            class="flex min-h-[320px] flex-col items-center justify-center rounded-[2rem] p-10 text-center"
            role="status"
            aria-live="polite"
          >
            <div class="mb-5 text-[var(--p)]">
              <Icon
                name="bookmark_add"
                fill
                style={{ "font-size": "48px" }}
              />
            </div>
            <h3 class="mb-2 text-xl font-semibold text-white">
              {props.title}
            </h3>
            <p class="mb-8 max-w-[340px] text-[var(--text-muted)]">
              {props.message}
            </p>
            <GlassButton
              variant="primary"
              onClick={() => props.onAction()}
              aria-label={props.actionText}
            >
              {props.actionText}
            </GlassButton>
          </GlassSurface>
        </Show>
      </div>
    </Show>
  );
}
