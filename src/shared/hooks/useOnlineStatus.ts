// src/shared/hooks/useOnlineStatus.ts
//
// Reactive online/offline detection hook for SolidJS.
// Uses navigator.onLine + online/offline events.
// Module-level signal so all consumers share the same state.
//
// Usage:
//   const { isOnline } = useOnlineStatus();
//   <Show when={isOnline()} fallback={<OfflineState />}>

import { createSignal, onMount, onCleanup } from "solid-js";

const [isOnline, setIsOnline] = createSignal(
  typeof navigator !== "undefined" ? navigator.onLine : true
);

let initialized = false;

function initOnlineStatus() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const onOnline = () => setIsOnline(true);
  const onOffline = () => setIsOnline(false);

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Cleanup is intentionally never called — this is a module-level
  // listener that persists for the app's lifetime.
}

export function useOnlineStatus() {
  onMount(() => initOnlineStatus());

  return {
    /** Whether the browser reports an online connection */
    isOnline,
    /** Whether the browser reports offline */
    isOffline: () => !isOnline()
  };
}

// Also export for non-reactive consumption (e.g., in API helpers)
export { isOnline };
