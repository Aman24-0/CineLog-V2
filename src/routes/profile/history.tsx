// src/routes/profile/history.tsx
import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import HistoryPage from "~/features/profile/HistoryPage";

export default function HistoryRoute() {
  return (
    <>
      <Title>CineLog — History</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ "padding": "var(--sp-12) var(--sp-5)" }}>
            <div class="empty-premium" role="alert">
              <h3 class="empty-premium-title">Something went wrong</h3>
              <p class="empty-premium-body">{error.message}</p>
              <button class="btn-primary focus-ring" onClick={() => reset()} style={{ "margin-top": "var(--sp-2)" }}>
                Retry
              </button>
            </div>
          </div>
        )}
      >
        <HistoryPage />
      </ErrorBoundary>
    </>
  );
}
