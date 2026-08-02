// src/routes/u/[username]/followers/index.tsx
//
// Followers list route — /u/<username>/followers
//
// Renders the list of users who follow <username>. Delegates to the
// shared FollowListPage component which handles loading / error /
// empty / ready states + infinite scroll.

import { ErrorBoundary, type Component } from "solid-js";
import { PageContainer } from "~/shared/ui/layout";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";
import FollowListPage from "~/shared/ui/social/FollowListPage";

const FollowersRoute: Component = () => {
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
      <FollowListPage type="followers" />
    </ErrorBoundary>
  );
};

export default FollowersRoute;
