// src/routes/u/[username]/following/index.tsx
//
// Following list route — /u/<username>/following
//
// Renders the list of users that <username> follows. Delegates to the
// shared FollowListPage component which handles loading / error /
// empty / ready states + infinite scroll.

import { ErrorBoundary, type Component } from "solid-js";
import { PageContainer } from "~/shared/ui/layout";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";
import FollowListPage from "~/shared/ui/social/FollowListPage";

const FollowingRoute: Component = () => {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <PageContainer>
          <GlassEmptyState
            icon="error"
            title="Something went wrong"
            message={error.message}
            action={
              <GlassButton variant="primary" onClick={() => reset()}>
                Retry
              </GlassButton>
            }
          />
        </PageContainer>
      )}
    >
      <FollowListPage type="following" />
    </ErrorBoundary>
  );
};

export default FollowingRoute;
