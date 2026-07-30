// src/routes/profile/index.tsx
//
// Sprint 2B — Error boundary uses GlassEmptyState for
// consistent visual treatment across all empty/error states.

import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary, Suspense } from "solid-js";
import { GlassEmptyState, GlassButton, GlassSkeleton } from "~/shared/ui/glass";
const ProfilePage = lazy(() => import("~/features/profile/ProfilePage"));

// Per-route Suspense fallback — a minimal skeleton so the lazy
// chunk's brief load doesn't swap the whole app shell. The
// top-level <Suspense> in app.tsx remains as a backstop, but this
// closer boundary means the AppHeader / BottomNavigation stay
// mounted during the transition.
function ProfileRouteFallback() {
  return (
    <div class="profile-page" aria-busy="true" aria-live="polite">
      <GlassSkeleton class="h-44 w-full rounded-xl" />
      <GlassSkeleton
        class="h-24 w-full rounded-lg"
        style={{ "margin-top": "var(--sp-4)" }}
      />
    </div>
  );
}

export default function ProfileRoute() {
  return (
    <>
      <Title>CineLog — Profile</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div
            class="profile-page"
            style={{ padding: "var(--sp-12) var(--sp-5)" }}
          >
            <GlassEmptyState
              icon="error"
              title="Couldn't load profile"
              message={
                error.message || "Something went wrong loading your profile."
              }
              action={
                <GlassButton
                  variant="primary"
                  onClick={() => reset()}
                  aria-label="Retry"
                >
                  Retry
                </GlassButton>
              }
            />
          </div>
        )}
      >
        <Suspense fallback={<ProfileRouteFallback />}>
          <ProfilePage />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
