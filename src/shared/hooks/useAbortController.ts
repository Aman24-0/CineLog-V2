// src/shared/hooks/useAbortController.ts
//
// AbortController management hook for SolidJS.
// Automatically aborts on component cleanup. Prevents
// stale promises from updating unmounted components.
//
// Usage:
//   const { abortController, resetAbort } = useAbortController();
//
//   async function fetchData() {
//     resetAbort(); // Cancel any in-flight request
//     const res = await fetch(url, { signal: abortController().signal });
//     ...
//   }
//
// The abort controller is automatically aborted in onCleanup.

import { createSignal, onCleanup } from "solid-js";

export function useAbortController() {
  const [controller, setController] = createSignal(new AbortController());

  // Abort on component cleanup
  onCleanup(() => {
    controller().abort();
  });

  function resetAbort(): AbortController {
    // Abort the current controller
    controller().abort();
    // Create a new one
    const newController = new AbortController();
    setController(newController);
    return newController;
  }

  function abortAndStart(): AbortController {
    return resetAbort();
  }

  return {
    /** Current AbortController — use .signal for fetch calls */
    abortController: controller,
    /** Abort current and create a new controller. Returns the new controller. */
    resetAbort,
    /** Alias for resetAbort — more semantic for "abort in-flight, start new" */
    abortAndStart,
    /** Whether the current controller has been aborted */
    isAborted: () => controller().signal.aborted
  };
}
