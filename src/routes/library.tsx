import { lazy, Suspense, ErrorBoundary } from "solid-js";
import { Title, Link, Meta } from "@solidjs/meta";
import { GlassSkeleton } from "~/shared/ui/glass";

const LibraryView = lazy(() => import("~/features/watchlist/LibraryView"));

function LibraryRouteFallback() {
  return (
    <div class="page-enter" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-72 rounded-lg" />
    </div>
  );
}

export default function LibraryRoute() {
  return (
    <>
      <Title>CineLog — Library</Title>
      <Link rel="canonical" href="https://cinelog.app/library" />
      <Meta
        name="description"
        content="Manage your CineLog library of movies and series, including watch status, ratings, and progress."
      />
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <div class="glass-empty-state" role="alert">
              <h3 class="glass-empty-state-title">Library unavailable</h3>
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
        <Suspense fallback={<LibraryRouteFallback />}>
          <LibraryView />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
