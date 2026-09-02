// src/routes/discover/theatres.tsx
import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";

const TheatresPage = lazy(() => import("~/features/discover/TheatresPage"));

function TheatresRouteFallback() {
  return (
    <div class="page-enter" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-72 rounded-lg" />
    </div>
  );
}

export default function TheatresRoute() {
  return (
    <>
      <Title>CineLog — Running in Theatres</Title>
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
        <Suspense fallback={<TheatresRouteFallback />}>
          <TheatresPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
