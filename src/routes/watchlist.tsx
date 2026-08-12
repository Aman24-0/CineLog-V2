// src/routes/watchlist.tsx
import { lazy, Suspense } from "solid-js";
import { Title, Link } from "@solidjs/meta";
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
      <Suspense fallback={<WatchlistRouteFallback />}>
        <WatchlistView />
      </Suspense>
    </>
  );
}
