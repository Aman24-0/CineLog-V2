import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState } from "~/shared/ui/states";

const RecentActivityPage = lazy(
  () => import("~/features/profile/RecentActivityPage")
);

function RecentActivityRouteFallback() {
  return (
    <div class="sec-page" aria-busy="true" aria-live="polite">
      <div class="profile-recent-activity-page-list">
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function RecentActivityRoute() {
  return (
    <>
      <Title>CineLog — Recent Activity</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <ErrorState
              icon="error"
              title="Couldn't load recent activity"
              message={error.message}
              variant="page"
              onRetry={() => reset()}
            />
          </div>
        )}
      >
        <Suspense fallback={<RecentActivityRouteFallback />}>
          <RecentActivityPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
