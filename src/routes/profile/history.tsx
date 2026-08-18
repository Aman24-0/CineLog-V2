// src/routes/profile/history.tsx
import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";
import { ErrorState } from "~/shared/ui/states";
const HistoryPage = lazy(() => import("~/features/profile/HistoryPage"));

function HistoryRouteFallback() {
  return (
    <div class="sec-page" aria-busy="true" aria-live="polite">
      <div class="history-skeleton" style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
        <GlassSkeleton class="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function HistoryRoute() {
  return (
    <>
      <Title>CineLog — History</Title>
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
        <Suspense fallback={<HistoryRouteFallback />}>
          <HistoryPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
