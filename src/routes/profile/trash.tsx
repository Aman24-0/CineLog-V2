// src/routes/profile/trash.tsx
import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";
import TrashPage from "~/features/trash/TrashPage";

export default function TrashRoute() {
  return (
    <>
      <Title>CineLog — Trash</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="profile-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <GlassEmptyState
              icon="error"
              title="Couldn't load trash"
              message={error.message || "Something went wrong loading your trash."}
              action={
                <GlassButton variant="primary" onClick={() => reset()} aria-label="Retry">
                  Retry
                </GlassButton>
              }
            />
          </div>
        )}
      >
        <TrashPage />
      </ErrorBoundary>
    </>
  );
}
