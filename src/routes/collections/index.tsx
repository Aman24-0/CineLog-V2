// src/routes/collections/index.tsx
import { ErrorBoundary } from "solid-js";
import { Title } from "@solidjs/meta";
import CollectionsPage from "~/features/collections/CollectionsPage";

export default function CollectionsRoute() {
  return (
    <>
      <Title>CineLog — Collections</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ "padding": "var(--sp-12) var(--sp-5)" }}>
            <div class="empty-premium" role="alert" aria-live="assertive">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                  error
                </span>
              </div>
              <h3 class="empty-premium-title">Couldn't load collections</h3>
              <p class="empty-premium-body">{error.message || "Something went wrong loading your collections."}</p>
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
        <CollectionsPage />
      </ErrorBoundary>
    </>
  );
}
