// src/shared/ui/states/AuthGate.tsx
//
// Authentication gate — wraps content that requires authentication.
// Handles: checking session, authenticated, unauthenticated, session expired.
// Prevents briefly showing protected content before redirecting.
//
// Usage:
//   <AuthGate>
//     <ProtectedContent />
//   </AuthGate>

import { Component, JSX, Show, createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";
import { GlassLoadingState } from "~/shared/ui/glass";

export interface AuthGateProps {
  children: JSX.Element;
  /** What to show for unauthenticated users. Default: sign-in CTA */
  fallback?: JSX.Element;
  /** Called when sign-in is clicked */
  onSignIn?: () => void;
  /** Whether to show a loading skeleton while auth is resolving */
  showLoading?: boolean;
}

export const AuthGate: Component<AuthGateProps> = (props) => {
  const { isSignedIn, authReady } = useAuth();

  return (
    <Show
      when={authReady()}
      fallback={
        <Show when={props.showLoading !== false}>
          <GlassLoadingState size="small" message="Checking session\u2026" />
        </Show>
      }
    >
      <Show
        when={isSignedIn()}
        fallback={props.fallback ?? (
          <div class="py-12">
            <GlassEmptyState
              icon="person_off"
              title="Sign in to continue"
              message="You need to be signed in to access this content."
              action={
                <Show when={props.onSignIn}>
                  <GlassButton variant="primary" onClick={() => props.onSignIn?.()}>
                    Sign In
                  </GlassButton>
                </Show>
              }
            />
          </div>
        )}
      >
        {props.children}
      </Show>
    </Show>
  );
};

export default AuthGate;
