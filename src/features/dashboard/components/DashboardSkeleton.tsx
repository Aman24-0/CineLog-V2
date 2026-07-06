// src/features/dashboard/components/DashboardSkeleton.tsx
import { For } from "solid-js";
import { Skeleton } from "~/shared/ui/primitives";

/**
 * Premium loading skeleton for the Dashboard.
 *
 * Mirrors the actual dashboard layout: hero → stats → continue watching →
 * recently added. Uses the Skeleton primitive so shimmer is consistent
 * across the app.
 *
 * SSR-safe: pure JSX + CSS, no client-only APIs.
 */
export default function DashboardSkeleton() {
  return (
    <div class="space-y-8 animate-fade-in">
      {/* Hero skeleton */}
      <div class="hero-premium" style={{ height: "240px" }}>
        <div
          class="absolute inset-0 skeleton-base"
          style={{ "border-radius": "var(--radius-xl)" }}
          aria-hidden="true"
        />
        <div
          class="absolute bottom-4 left-4 right-4 flex flex-col gap-2 z-10"
          aria-hidden="true"
        >
          <Skeleton width="70%" height="2rem" />
          <Skeleton width="40%" height="0.75rem" variant="text" />
          <div class="flex gap-2 mt-2">
            <Skeleton width="100px" height="2rem" radius="var(--radius-pill)" />
            <Skeleton width="100px" height="2rem" radius="var(--radius-pill)" />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <For each={Array.from({ length: 4 })}>
          {() => (
            <div class="stat-premium" style={{ cursor: "default" }}>
              <Skeleton width="24px" height="24px" radius="var(--radius-sm)" />
              <Skeleton width="2.5rem" height="2rem" />
              <Skeleton width="60%" height="0.625rem" variant="text" />
            </div>
          )}
        </For>
      </div>

      {/* Continue Watching skeleton */}
      <div>
        <Skeleton width="140px" height="0.875rem" variant="text" />
        <div class="flex gap-4 overflow-hidden mt-4 pb-2">
          <For each={Array.from({ length: 3 })}>
            {() => (
              <Skeleton
                width="256px"
                height="144px"
                radius="var(--radius-lg)"
                class="shrink-0"
              />
            )}
          </For>
        </div>
      </div>

      {/* Recently Added skeleton */}
      <div>
        <Skeleton width="120px" height="0.875rem" variant="text" />
        <div class="flex gap-3 overflow-hidden mt-4 pb-2">
          <For each={Array.from({ length: 5 })}>
            {() => (
              <Skeleton
                width="100px"
                height="150px"
                radius="var(--radius-card)"
                class="shrink-0"
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
