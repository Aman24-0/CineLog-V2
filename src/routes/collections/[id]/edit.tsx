// src/routes/collections/[id]/edit.tsx
import { ErrorBoundary } from "solid-js";
import UniverseEditPage from "~/features/collections/components/UniverseEditPage";

export default function UniverseEditRoute() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div class="sec-page" style={{ "padding": "var(--sp-12) var(--sp-5)" }}>
          <div class="empty-premium" role="alert" aria-live="assertive">
            <div class="empty-premium-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                error
              </span>
            </div>
            <h3 class="empty-premium-title">Couldn't load editor</h3>
            <p class="empty-premium-body">{error.message || "Something went wrong loading the universe editor."}</p>
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={() => reset()}
              style={{ "margin-top": "var(--sp-2)" }}
              aria-label="Retry"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      <UniverseEditPage />
    </ErrorBoundary>
  );
}
