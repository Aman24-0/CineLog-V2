// src/routes/profile/index.tsx
//
// Sprint 2B — Error boundary uses GlassEmptyState for
// consistent visual treatment across all empty/error states.

import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";
import ProfilePage from "~/features/profile/ProfilePage";

export default function ProfileRoute() {
  return (
    <>
      <Title>CineLog — Profile</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="profile-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <GlassEmptyState
              icon="error"
              title="Couldn't load profile"
              message={error.message || "Something went wrong loading your profile."}
              action={
                <GlassButton variant="primary" onClick={() => reset()} aria-label="Retry">
                  Retry
                </GlassButton>
              }
            />
          </div>
        )}
      >
        <ProfilePage />
      </ErrorBoundary>
    </>
  );
}
