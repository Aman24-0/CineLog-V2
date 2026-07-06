// src/shared/hooks/useAuth.ts
import { createSignal, onMount, onCleanup } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "~/core/firebase";
import type { User } from "~/shared/types";

// Module-level signal so all components share the same user state.
// onAuthStateChanged is only wired up on the client (auth is null on the
// server — see core/firebase/config.ts), so the signal stays null during SSR
// and resolves after hydration. This avoids hydration mismatches.
const [user, setUser] = createSignal<User | null>(null);
const [authReady, setAuthReady] = createSignal(false);

let unsub: (() => void) | null = null;
let listenerCount = 0;

export function useAuth() {
  onMount(() => {
    listenerCount++;
    if (!unsub && auth) {
      unsub = onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser({
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL
          });
        } else {
          setUser(null);
        }
        setAuthReady(true);
      });
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
