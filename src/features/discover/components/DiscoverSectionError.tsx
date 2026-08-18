// src/features/discover/components/DiscoverSectionError.tsx
//
// DiscoverSectionError — fallback rendered when a Discover section's
// data fetch rejects. Logs the error to the console once per render
// and shows a shared ErrorState component with an optional retry.

import { createEffect } from "solid-js";
import { ErrorState } from "~/shared/ui/states";

interface DiscoverSectionErrorProps {
  label: string;
  error: Error;
  /** Optional retry callback — when provided, the ErrorState shows a
   *  retry button so the user can recover without a full page reload. */
  onRetry?: () => void;
}

export function DiscoverSectionError(props: DiscoverSectionErrorProps) {
  // Log to the console from inside a tracked scope so the rule is
  // satisfied AND we only log when the error or label actually changes
  // (avoids spamming the console on unrelated parent re-renders).
  createEffect(() => {
    const label = props.label;
    const error = props.error;
    console.error(`[DiscoverPage] ${label} section error:`, error);
  });
  return (
    <section class="discover-fold">
      <div class="discover-fold-label">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "12px", color: "var(--text-dim)" }}
          aria-hidden="true"
        >
          error
        </span>
        {props.label}
      </div>
      <ErrorState
        icon="error"
        title={`Couldn't load ${props.label}`}
        message="Check your connection and try again."
        variant="section"
        retryable={!!props.onRetry}
        onRetry={props.onRetry}
      />
    </section>
  );
}
