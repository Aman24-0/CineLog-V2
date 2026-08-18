// src/routes/watchlist.tsx
import { lazy, Suspense, ErrorBoundary } from "solid-js";
import { Title, Link, Meta } from "@solidjs/meta";
import { GlassSkeleton } from "~/shared/ui/glass";

const WatchlistView = lazy(() => import("~/features/watchlist/WatchlistView"));

// Per-route Suspense fallback — a minimal skeleton so the lazy
// chunk's brief load doesn't swap the whole app shell. The
// top-level <Suspense> in app.tsx remains as a backstop, but this
// closer boundary means the AppHeader / BottomNavigation stay
// mounted during the transition.
function WatchlistRouteFallback() {
  return (
    <div class="page-enter" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-72 rounded-lg" />
    </div>
  );
}

export default function WatchlistRoute() {
  return (
    <>
      <Title>CineLog — Watchlist</Title>
      <Link rel="canonical" href="https://cinelog.app/watchlist" />
      <Meta name="description" content="Track and organize your movie and TV show watchlist with CineLog." />
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
        <Suspense fallback={<WatchlistRouteFallback />}>
          <WatchlistView />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
