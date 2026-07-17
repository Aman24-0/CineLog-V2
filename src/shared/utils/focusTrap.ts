/**
 * CineLog V2 — Focus Trap Utility
 * ---------------------------------------------------------------------
 * Traps keyboard focus within a container element (modal, sheet, dialog).
 * When active, Tab and Shift+Tab cycle through focusable children
 * instead of escaping to elements behind the overlay.
 *
 * Usage:
 *   const cleanup = trapFocus(containerRef);
 *   onCleanup(cleanup);
 *
 * Focusable selectors follow WAI-ARIA best practices:
 *   a[href], button:not([disabled]), input:not([disabled]),
 *   select:not([disabled]), textarea:not([disabled]),
 *   [tabindex]:not([tabindex="-1"])
 */

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Get all focusable elements within a container.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}

/**
 * Trap focus within a container element.
 *
 * Returns a cleanup function that restores the previously focused
 * element and removes the event listeners.
 *
 * @param container  The DOM element to trap focus within.
 * @param restoreFocus  Whether to restore focus to the previously
 *   focused element on cleanup (default: true).
 */
export function trapFocus(
  container: HTMLElement,
  restoreFocus: boolean = true,
): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  // Focus the first focusable element, or the container itself.
  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[0].focus();
  } else {
    container.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;

    const elements = getFocusableElements(container);
    if (elements.length === 0) return;

    const first = elements[0];
    const last = elements[elements.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener("keydown", handleKeyDown);

  return () => {
    container.removeEventListener("keydown", handleKeyDown);
    if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  };
}
