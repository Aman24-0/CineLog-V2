// src/features/watchlist/components/EmptyState.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface EmptyStateProps {
  isGuest: boolean;
  onLogin: () => void;
  title: string;
  message: string;
  actionText: string;
  onAction: () => void;
}

/**
 * Premium empty state for the Vault.
 *
 * Two variants:
 *  - Guest: glass surface with accent CTA (sign-in prompt)
 *  - Filtered/empty: minimal centered state with secondary action
 *
 * Uses .empty-premium* CSS classes from the design system for consistency
 * with the dashboard empty states.
 */
export default function EmptyState(props: EmptyStateProps) {
  return (
    <Show
      when={!props.isGuest}
      fallback={
        // Guest variant — glass surface, prominent CTA
        <div
          class="empty-premium rounded-[2rem] border"
          style={{
            "border-color": "var(--hairline-2)",
            background: "var(--glass-bg)",
            "backdrop-filter": "blur(20px)",
            "-webkit-backdrop-filter": "blur(20px)",
            "box-shadow": "var(--shadow-premium)"
          }}
        >
          <div class="empty-premium-icon" aria-hidden="true">
            <Icon name="video_library" fill style="color: var(--p); font-size: 32px" />
          </div>
          <p class="empty-premium-title">{props.title}</p>
          <p class="empty-premium-body">{props.message}</p>
          <button
            onClick={() => props.onAction()}
            class="btn-primary"
            style={{ "margin-top": "var(--sp-2)" }}
            aria-label={props.actionText}
          >
            {props.actionText}
          </button>
        </div>
      }
    >
      {/* Signed-in empty / no matches variant */}
      <div class="empty-premium animate-fade-in" style={{ padding: "var(--sp-12) var(--sp-6)" }}>
        <div class="empty-premium-icon" aria-hidden="true">
          <Icon name="sentiment_dissatisfied" style="color: var(--text-muted); font-size: 32px" />
        </div>
        <p class="empty-premium-title">{props.title}</p>
        <p class="empty-premium-body">{props.message}</p>
        <button
          onClick={() => props.onAction()}
          class="btn-ghost"
          style={{ "margin-top": "var(--sp-2)" }}
          aria-label={props.actionText}
        >
          {props.actionText}
        </button>
      </div>
    </Show>
  );
}
