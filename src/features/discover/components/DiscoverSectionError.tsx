// src/features/discover/components/DiscoverSectionError.tsx
//
// DiscoverSectionError — fallback rendered when a Discover section's
// data fetch rejects. Logs the error to the console once per render
// and shows a DiscoverEmptyState with a retry hint.

import { createEffect } from "solid-js";
import DiscoverEmptyState from "./DiscoverEmptyState";

interface DiscoverSectionErrorProps {
  label: string;
  error: Error;
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
      <DiscoverEmptyState
        icon="error"
        message={`Couldn't load ${props.label}.`}
        hint="Check your connection and try again."
      />
    </section>
  );
}
