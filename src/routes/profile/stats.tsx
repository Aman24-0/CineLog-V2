// src/routes/profile/stats.tsx
import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState } from "~/shared/ui/states";
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
            <ErrorState
              icon="error"
              title="Something went wrong"
              message={error.message}
              variant="page"
              onRetry={() => reset()}
            />
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
