// src/features/watchlist/components/EmptyState.tsx
import { Show } from "solid-js";
import { GlassEmptyState } from "~/shared/ui/glass";

interface EmptyStateProps {
  isGuest?: boolean;
  title: string;
  message: string;
  actionText: string;
  onAction: () => void;
  onLogin?: () => void;
}

export default function EmptyState(props: EmptyStateProps) {
  return (
    <div class="py-12">
      <GlassEmptyState
        icon={props.isGuest ? "login" : "search_off"}
        title={props.title}
        message={props.message}
        actionLabel={props.actionText}
        onAction={props.onAction}
      />
    </div>
  );
}
