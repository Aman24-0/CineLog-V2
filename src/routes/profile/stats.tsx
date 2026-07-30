// src/routes/profile/stats.tsx
import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";
const StatisticsPage = lazy(() => import("~/features/stats/StatisticsPage"));

// Per-route Suspense fallback — keeps the AppHeader / BottomNavigation
// mounted while the lazy Statistics chunk loads.
function StatsRouteFallback() {
  return (
    <div class="sec-page" aria-busy="true" aria-live="polite">
      <div class="stats-skeleton-grid">
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
      </div>
      <GlassSkeleton
        class="h-72 rounded-lg"
        style={{ "margin-top": "var(--sp-4)" }}
      />
    </div>
  );
}

export default function StatsRoute() {
  return (
    <>
      <Title>CineLog — Statistics</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <div class="glass-empty-state" role="alert">
              <h3 class="glass-empty-state-title">Something went wrong</h3>
              <p class="glass-empty-state-body">{error.message}</p>
              <button
                class="btn-primary focus-ring"
                onClick={() => reset()}
                style={{ "margin-top": "var(--sp-2)" }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      >
        <Suspense fallback={<StatsRouteFallback />}>
          <StatisticsPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
