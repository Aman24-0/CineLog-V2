// src/features/dashboard/components/DashboardSkeleton.tsx
import { Skeleton } from "~/shared/ui/primitives";

/**
 * V2.2 Sprint 3 Dashboard Skeleton — mirrors the new cinematic layout.
 *
 * Layout:
 *  - Greeting skeleton (eyebrow + title + subtitle)
 *  - Hero skeleton (full-bleed backdrop + poster + title + meta + actions)
 *  - Continue Watching skeleton (label + rail of cards)
 *  - Recently Added skeleton (label + rail of posters)
 *  - Stats Story skeleton (label + glass panel with cells)
 */
export default function DashboardSkeleton() {
  return (
    <div class="page-enter">
      {/* Greeting skeleton */}
      <div class="greeting-block">
        <Skeleton width="80px" height="0.5625rem" variant="text" />
        <Skeleton width="180px" height="2rem" />
        <Skeleton width="220px" height="0.875rem" variant="text" />
      </div>

      {/* Hero skeleton */}
      <div class="dashboard-hero">
        <div
          class="skeleton-base"
          style={{ position: "absolute", inset: 0, "border-radius": "var(--radius-xl)" }}
        />
        <div class="dashboard-hero-content">
          <div class="dashboard-hero-poster">
            <div class="skeleton-base" style={{ width: "100%", height: "100%" }} />
          </div>
          <div class="flex-1 min-w-0">
            <Skeleton width="70%" height="2rem" />
            <div class="flex gap-2 mt-2">
              <Skeleton width="50px" height="1.25rem" radius="var(--radius-pill)" />
              <Skeleton width="60px" height="1.25rem" radius="var(--radius-pill)" />
              <Skeleton width="70px" height="1.25rem" radius="var(--radius-pill)" />
            </div>
            <div class="flex gap-2 mt-3">
              <Skeleton width="100px" height="2.5rem" radius="var(--radius-pill)" />
              <Skeleton width="100px" height="2.5rem" radius="var(--radius-pill)" />
            </div>
          </div>
        </div>
      </div>

      {/* Continue Watching skeleton */}
      <div class="dashboard-section">
        <Skeleton width="140px" height="0.5625rem" variant="text" style={{ "margin-bottom": "var(--sp-3)" }} />
        <div class="flex gap-3 overflow-hidden pb-2">
          {Array.from({ length: 3 }).map(() => (
            <Skeleton
              width="280px"
              height="158px"
              radius="var(--radius-lg)"
              class="shrink-0"
            />
          ))}
        </div>
      </div>

      {/* Recently Added skeleton */}
      <div class="dashboard-section">
        <Skeleton width="120px" height="0.5625rem" variant="text" style={{ "margin-bottom": "var(--sp-3)" }} />
        <div class="flex gap-3 overflow-hidden pb-2">
          {Array.from({ length: 5 }).map(() => (
            <div class="shrink-0" style={{ width: "120px" }}>
              <Skeleton width="100%" height="0" radius="var(--radius-card)" style={{ "aspect-ratio": "2 / 3" }} />
              <Skeleton width="80%" height="0.75rem" style={{ "margin-top": "0.5rem" }} />
              <Skeleton width="60%" height="0.5rem" variant="text" style={{ "margin-top": "0.25rem" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Stats Story skeleton */}
      <div class="dashboard-section">
        <Skeleton width="80px" height="0.5625rem" variant="text" style={{ "margin-bottom": "var(--sp-3)" }} />
        <div class="stats-story">
          <div class="stats-story-grid">
            {Array.from({ length: 4 }).map(() => (
              <div class="stats-story-cell">
                <Skeleton width="2.5rem" height="2rem" />
                <Skeleton width="60px" height="0.5rem" variant="text" />
                <Skeleton width="80px" height="0.6875rem" variant="text" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
