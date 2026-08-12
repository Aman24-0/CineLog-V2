// src/routes/collections/index.tsx
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { Title, Link, Meta } from "@solidjs/meta";
import { GlassSkeleton } from "~/shared/ui/glass";
const CollectionsPage = lazy(
  () => import("~/features/collections/CollectionsPage")
);

// Per-route Suspense fallback — keeps the AppHeader / BottomNavigation
// mounted while the lazy Collections chunk loads.
function CollectionsRouteFallback() {
  return (
    <div class="sec-page" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-72 rounded-lg" />
    </div>
  );
}

export default function CollectionsRoute() {
  return (
    <>
      <Title>CineLog — Collections</Title>
      <Link rel="canonical" href="https://cinelog.app/collections" />
      <Meta name="description" content="Create and manage curated movie and TV show collections on CineLog." />
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <div class="glass-empty-state" role="alert" aria-live="assertive">
              <div class="glass-empty-state-icon" aria-hidden="true">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "32px", color: "#f87171" }}
                  aria-hidden="true"
                >
                  error
                </span>
              </div>
              <h3 class="glass-empty-state-title">Couldn't load collections</h3>
              <p class="glass-empty-state-body">
                {error.message ||
                  "Something went wrong loading your collections."}
              </p>
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={() => reset()}
                style={{ "margin-top": "var(--sp-2)" }}
                aria-label="Retry loading collections"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      >
        <Suspense fallback={<CollectionsRouteFallback />}>
          <CollectionsPage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
