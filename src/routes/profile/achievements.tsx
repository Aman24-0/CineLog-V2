// src/routes/profile/achievements.tsx
import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState } from "~/shared/ui/states";
const AchievementsPage = lazy(
  () => import("~/features/profile/AchievementsPage")
);

function AchievementsRouteFallback() {
  return (
    <div class="sec-page" aria-busy="true" aria-live="polite">
      <div class="achievements-skeleton" style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(120px, 1fr))", gap: "var(--sp-3)" }}>
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
        <GlassSkeleton class="h-28 rounded-lg" />
      </div>
    </div>
  );
}

export default function AchievementsRoute() {
  return (
    <>
      <Title>CineLog — Achievements</Title>
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
        <Suspense fallback={<AchievementsRouteFallback />}>
          <AchievementsPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
