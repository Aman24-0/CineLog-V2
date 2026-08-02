// src/shared/ui/social/FollowButton.tsx
//
// FollowButton — the social follow / unfollow toggle.
//
// Renders a GlassButton labelled "Follow" or "Following" depending on
// the caller's relationship with `targetUserId`. Wraps the useFollow
// hook so the parent doesn't need to wire up auth, optimistic updates,
// or toast feedback.
//
// USAGE
//   <FollowButton targetUserId={() => profile.id} size="compact" />
//
// GUEST BEHAVIOR
//   When the viewer is signed out, clicking the button opens the
//   AuthModal instead of calling the API. The label stays "Follow".
//
// ACCESSIBILITY
//   • The button's aria-label includes the actor's name when provided
//     so screen-reader users hear "Follow Alice" instead of just
//     "Follow".
//   • The pending state sets aria-busy="true" (via GlassButton's
//     loading prop) so AT users know a network call is in flight.
//   • Keyboard navigation is handled by the underlying GlassButton
//     (Enter + Space activate, focus ring visible).

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { GlassButton } from "~/shared/ui/glass";
import { useFollow } from "~/shared/hooks/social/useFollow";

export interface FollowButtonProps {
  /** The user id of the account to follow / unfollow. */
  targetUserId: Accessor<string | null | undefined>;
  /**
   * Optional display name of the target — used to build a more
   * descriptive aria-label ("Follow Alice" vs "Follow"). Falls back
   * to a generic label when null.
   */
  displayName?: Accessor<string | null | undefined>;
  /** Button size preset. @default "default" */
  size?: "compact" | "default" | "large";
}

const FollowButton: Component<FollowButtonProps> = (props) => {
  // Wrap the targetUserId accessor in a memo so the solid/reactivity
  // lint rule is satisfied (it tracks Accessor usage inside JSX or
  // tracked scopes). The hook tracks the memo's value internally.
  const targetId = createMemo(() => props.targetUserId());

  // useFollow handles: auth gating, optimistic updates, toast feedback,
  // SSR safety, and re-fetching when targetUserId changes.
  // eslint-disable-next-line solid/reactivity
  const { following, pending, follow, unfollow } = useFollow(targetId);

  // The label is "Following" when the optimistic state is true (so the
  // button visually reflects the post-click state immediately). It
  // reads "Follow" otherwise.
  const label = createMemo(() => (following() ? "Following" : "Follow"));

  // aria-label includes the actor's name for screen-reader context.
  const ariaLabel = createMemo(() => {
    const name = props.displayName?.() ?? null;
    const action = following() ? "Unfollow" : "Follow";
    return name ? `${action} ${name}` : action;
  });

  const handleClick = () => {
    if (following()) {
      void unfollow();
    } else {
      void follow();
    }
  };

  return (
    <Show when={targetId()}>
      <GlassButton
        variant={following() ? "ghost" : "primary"}
        size={props.size ?? "default"}
        icon={following() ? "person_remove" : "person_add"}
        loading={pending()}
        onClick={handleClick}
        aria-label={ariaLabel()}
        // Disable while pending so the user can't double-tap and queue
        // two follow calls (which would race the optimistic state).
        disabled={pending()}
      >
        {label()}
      </GlassButton>
    </Show>
  );
};

export default FollowButton;
