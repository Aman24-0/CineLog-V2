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

export default function EmptyState(props: EmptyStateProps) {
  return (
    <Show
      when={!props.isGuest}
      fallback={
        <div class="empty-state py-16 rounded-[2rem] border glass-surface" style="border-color: var(--border-active)">
          <div class="empty-state-icon" aria-hidden="true">
            <Icon name="video_library" fill style="color: var(--p); font-size: 36px" />
          </div>
          <p class="empty-state-title">{props.title}</p>
          <p class="empty-state-body">{props.message}</p>
          <button
            onClick={() => props.onAction()}
            class="type-button px-8 py-3 rounded-full text-black shadow-lg active:scale-95 mt-2"
            style="background: var(--p); box-shadow: 0 0 16px var(--p-glow)"
          >
            {props.actionText}
          </button>
        </div>
      }
    >
      <div class="empty-state py-16 animate-fade-in">
        <div class="empty-state-icon" aria-hidden="true">
          <Icon name="sentiment_dissatisfied" style="color: var(--muted); font-size: 36px" />
        </div>
        <p class="empty-state-title">{props.title}</p>
        <p class="empty-state-body">{props.message}</p>
        <button
          onClick={() => props.onAction()}
          class="type-button px-6 py-3 rounded-full active:scale-95 mt-2"
          style="background: var(--raised); border: 1px solid var(--border-active); color: var(--muted)"
        >
          {props.actionText}
        </button>
      </div>
    </Show>
  );
}
