// src/routes/profile/index.tsx
//
// Sprint 2B — Error boundary uses PremiumEmptyState for
// consistent visual treatment across all empty/error states.

import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import { PremiumEmptyState } from "~/shared/ui/premium";
import ProfilePage from "~/features/profile/ProfilePage";

export default function ProfileRoute() {
  return (
    <>
      <Title>CineLog — Profile</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="profile-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
            <PremiumEmptyState
              icon="error"
              iconFill
              title="Couldn't load profile"
              message={error.message || "Something went wrong loading your profile."}
              actionLabel="Retry"
              onAction={() => reset()}
            />
          </div>
        )}
      >
        <ProfilePage />
      </ErrorBoundary>
    </>
  );
}
