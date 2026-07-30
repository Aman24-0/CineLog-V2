// src/features/discover/components/DiscoverSectionError.tsx
//
// DiscoverSectionError — fallback rendered when a Discover section's
// data fetch rejects. Logs the error to the console once per render
// and shows a DiscoverEmptyState with a retry hint.

import DiscoverEmptyState from "./DiscoverEmptyState";

interface DiscoverSectionErrorProps {
  label: string;
  error: Error;
}

export function DiscoverSectionError(props: DiscoverSectionErrorProps) {
  console.error(`[DiscoverPage] ${props.label} section error:`, props.error);
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
