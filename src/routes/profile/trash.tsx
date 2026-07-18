// src/routes/profile/trash.tsx
import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import { PremiumEmptyState } from "~/shared/ui/premium";
import TrashPage from "~/features/trash/TrashPage";

export default function TrashRoute() {
  return (
    <>
      <Title>CineLog — Trash</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="profile-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <PremiumEmptyState
              icon="error"
              iconFill
              title="Couldn't load trash"
              message={error.message || "Something went wrong loading your trash."}
              actionLabel="Retry"
              onAction={() => reset()}
            />
          </div>
        )}
      >
        <TrashPage />
      </ErrorBoundary>
    </>
  );
}
