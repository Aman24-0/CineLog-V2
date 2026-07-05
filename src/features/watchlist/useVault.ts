// src/features/watchlist/useVault.ts
import { createSignal, onMount, onCleanup } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "~/core/firebase";
import type { WatchlistItem } from "~/shared/types";

export function useVault() {
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let unsubSnap: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    unsubAuth = onAuthStateChanged(auth, (u) => {
      setIsGuest(!u);
      
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }
      
      if (u) {
        // Keep loading true until the first snapshot or error is received
        setLoading(true);
        setError(null);
        
        // V1 Exact Firestore path: users/{uid}/watchlist ordered by addedAt desc
        const q = query(
          collection(db, "users", u.uid, "watchlist"), 
          orderBy("addedAt", "desc")
        );
        
        unsubSnap = onSnapshot(
          q,
          (snap) => {
            setWatchlist(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WatchlistItem));
            setLoading(false);
            setError(null);
          },
          (err) => {
            console.error("Firestore error fetching vault:", err);
            setWatchlist([]);
            setLoading(false);
            setError("Failed to load vault data. Please try again later.");
          }
        );
      } else {
        setWatchlist([]);
        setLoading(false);
        setError(null);
      }
    });
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
    if (unsubSnap) unsubSnap();
  });

  return {
    watchlist,
    loading,
    isGuest,
    error
  };
}
