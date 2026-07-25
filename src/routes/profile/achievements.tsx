// src/routes/profile/achievements.tsx
import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import AchievementsPage from "~/features/profile/AchievementsPage";

export default function AchievementsRoute() {
  return (
    <>
      <Title>CineLog — Achievements</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="sec-page" style={{ "padding": "var(--sp-12) var(--sp-5)" }}>
            <div class="glass-empty-state" role="alert">
              <h3 class="glass-empty-state-title">Something went wrong</h3>
              <p class="glass-empty-state-body">{error.message}</p>
              <button class="btn-primary focus-ring" onClick={() => reset()} style={{ "margin-top": "var(--sp-2)" }}>
                Retry
              </button>
            </div>
          </div>
        )}
      >
        <AchievementsPage />
      </ErrorBoundary>
    </>
  );
}
