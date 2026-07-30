// src/routes/discover.tsx
import { lazy, Suspense } from "solid-js";
import { Title } from "@solidjs/meta";
import { GlassSkeleton } from "~/shared/ui/glass";

const DiscoverPage = lazy(() => import("~/features/discover/DiscoverPage"));

// Per-route Suspense fallback — a minimal skeleton so the lazy
// chunk's brief load doesn't swap the whole app shell. The
// top-level <Suspense> in app.tsx remains as a backstop, but this
// closer boundary means the AppHeader / BottomNavigation stay
// mounted during the transition.
function DiscoverRouteFallback() {
  return (
    <div class="page-enter" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-72 rounded-lg" />
    </div>
  );
}

export default function DiscoverRoute() {
  return (
    <>
      <Title>CineLog — Discover</Title>
      <Suspense fallback={<DiscoverRouteFallback />}>
        <DiscoverPage />
      </Suspense>
    </>
  );
}
