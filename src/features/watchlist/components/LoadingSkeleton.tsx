// src/features/watchlist/components/LoadingSkeleton.tsx
import { For } from "solid-js";
import { Skeleton } from "~/shared/ui/primitives";

/**
 * Premium loading skeleton for the Vault grid.
 *
 * Uses the Skeleton primitive for consistent shimmer animation. Mirrors the
 * actual vault grid layout (2/4/6 columns responsive) so there's no jarring
 * reflow when Firestore resolves.
 */
export default function LoadingSkeleton() {
  return (
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-fade-in">
      <For each={Array.from({ length: 12 })}>
        {() => (
          <div class="flex flex-col gap-2">
            {/* Poster skeleton — 2:3 ratio */}
            <Skeleton
              width="100%"
              height="0"
              radius="var(--radius-card)"
              style={{ "aspect-ratio": "2 / 3" }}
            />
            {/* Title skeleton */}
            <Skeleton width="80%" height="0.75rem" variant="text" />
            {/* Metadata skeleton */}
            <Skeleton width="50%" height="0.5rem" variant="text" />
          </div>
        )}
      </For>
    </div>
  );
}
