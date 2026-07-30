// src/routes/collections/[id].tsx
import { lazy, ErrorBoundary } from "solid-js";
const CollectionDetailPage = lazy(
  () => import("~/features/collections/CollectionDetailPage")
);

export default function CollectionDetailRoute() {
  return (
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
            <h3 class="glass-empty-state-title">Couldn't load collection</h3>
            <p class="glass-empty-state-body">
              {error.message || "Something went wrong loading this collection."}
            </p>
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={() => reset()}
              style={{ "margin-top": "var(--sp-2)" }}
              aria-label="Retry loading collection"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      <CollectionDetailPage />
    </ErrorBoundary>
  );
}
