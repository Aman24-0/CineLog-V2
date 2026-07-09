// src/shared/hooks/useAuth.ts
//
// Phase 6.1 — Auth Provider Integration
// ---------------------------------------
// This hook is the application's authentication provider. It was
// previously backed by Firebase `onAuthStateChanged`; it is now backed
// by the Supabase Authentication Foundation (`src/lib/supabase/session.ts`).
//
// The PUBLIC API is IDENTICAL to the previous Firebase-backed version:
//   { user, authReady, isSignedIn }
//
// `user` has the same shape as before:
//   { uid, displayName, email, photoURL }
//
// This means every existing consumer (DashboardPage, WatchlistView,
// SearchPage, DiscoverPage, AppHeader, GreetingBlock, DetailsModal,
// RatingCluster, DetailsRatings) continues to compile and work without
// any modification. The Firebase auth code in `src/core/firebase/`
// still exists but is no longer the source of auth truth.
//
// Architecture:
//   Application → useAuth (this file) → onSessionChange → Supabase Auth
//
// SSR safety
// ----------
// Mirrors the previous pattern: the `onSessionChange` subscription is
// registered inside `onMount` (client-only) and cleaned up in
// `onCleanup`. The module-level signals stay null/false during SSR and
// resolve after hydration, avoiding hydration mismatches.

import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import type { User } from "~/shared/types";

// ---------------------------------------------------------------------------
// Module-level signals — shared across ALL components (same pattern as the
// previous Firebase version). Every component that calls `useAuth()` reads
// from the same `user` / `authReady` signals, so auth state is consistent
// across the app.
// ---------------------------------------------------------------------------
const [user, setUser] = createSignal<User | null>(null);
const [authReady, setAuthReady] = createSignal(false);

// Ref-counted subscription: only one `onSessionChange` listener is ever
// active, regardless of how many components call `useAuth()`. The listener
// is cleaned up when the last consumer unmounts.
let unsub: (() => void) | null = null;
let listenerCount = 0;

/**
 * Map a Supabase `Session.user` to the application's `User` shape.
 *
 * The app's `User` type has `{ uid, displayName, email, photoURL }` —
 * a subset of the Supabase user fields. `uid` maps from Supabase's
 * `user.id`; the others map from `user_metadata` / `user.email` /
 * `user.user_metadata.avatar_url`.
 */
function mapSupabaseUser(session: Session | null): User | null {
  if (!session?.user) return null;
  const supabaseUser = session.user;
  return {
    uid: supabaseUser.id,
    displayName: supabaseUser.user_metadata?.full_name
      ?? supabaseUser.user_metadata?.name
      ?? supabaseUser.user_metadata?.display_name
      ?? null,
    email: supabaseUser.email ?? null,
    photoURL: supabaseUser.user_metadata?.avatar_url
      ?? supabaseUser.user_metadata?.picture
      ?? null
  };
}

/**
 * useAuth — the application's authentication provider hook.
 *
 * Returns:
 *   • user()        — the current user `{ uid, displayName, email, photoURL }` or null
 *   • authReady()   — true once the first auth-state event has fired
 *   • isSignedIn()  — convenience: true when user() is non-null
 *
 * Call inside a Solid component. The hook registers an auth-state
 * listener on mount and cleans it up on unmount.
 */
export function useAuth() {
  onMount(() => {
    listenerCount++;
    if (!unsub) {
      unsub = onSessionChange((_event, session) => {
        setUser(mapSupabaseUser(session));
        setAuthReady(true);
      }).unsubscribe;
    }
  });

  onCleanup(() => {
    listenerCount--;
    if (listenerCount <= 0 && unsub) {
      unsub();
      unsub = null;
      listenerCount = 0;
    }
  });

  return {
    user,
    authReady,
    isSignedIn: () => user() !== null
  };
}
