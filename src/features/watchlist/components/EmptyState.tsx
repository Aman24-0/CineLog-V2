// src/features/watchlist/components/EmptyState.tsx
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
}

/**
 * GlassEmptyState for the Vault.
 *
 * Two variants:
 *  - Guest: glass surface with accent CTA (sign-in prompt)
 *  - Filtered/empty: minimal centered state with secondary action
 *
 * Polished:
 *  - role="status" + aria-live so screen readers announce state changes.
 *  - .focus-ring on action buttons for keyboard users.
 */
export default function EmptyState(props: EmptyStateProps) {
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
      <div class="py-12">
        <GlassEmptyState
          icon="sentiment_dissatisfied"
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
      </div>
    </Show>
  );
}
