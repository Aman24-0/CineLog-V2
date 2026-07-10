// test/setup.ts
//
// Global test setup for Vitest.
// Runs before every test file.
//
// Responsibilities:
//   1. Register @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
//   2. Mock browser APIs not implemented by jsdom:
//      - IntersectionObserver
//      - ResizeObserver
//      - matchMedia
//      - scrollTo (no-op)
//      - URL.createObjectURL / revokeObjectURL
//   3. Isolate localStorage between tests (clear in beforeEach)
//   4. Silence console.error for expected error-path tests (opt-in via vi.stubGlobal)

import "@testing-library/jest-dom/vitest";
import { vi, afterEach, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────
// 1. Browser API mocks
// ─────────────────────────────────────────────────────────────────────

/** Minimal IntersectionObserver stub — tracks observe/unobserve calls. */
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [0];
  private callbacks: IntersectionObserverCallback[] = [];

  constructor(cb: IntersectionObserverCallback) {
    this.callbacks.push(cb);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Minimal ResizeObserver stub. */
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Install the stubs on the global / window object.
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// matchMedia — jsdom doesn't implement it; many components call it for
// prefers-reduced-motion / dark-mode detection.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}

// window.scrollTo — jsdom throws "Not implemented". Make it a no-op.
if (typeof window !== "undefined" && !window.scrollTo) {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

// URL.createObjectURL / revokeObjectURL — needed for any code that
// generates blob URLs (e.g. download exports).
if (typeof URL !== "undefined" && !URL.createObjectURL) {
  URL.createObjectURL = (() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
}

// ─────────────────────────────────────────────────────────────────────
// 2. localStorage isolation
// ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear localStorage + sessionStorage before every test so state
  // never leaks between test cases.
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.clear();
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. Global cleanup
// ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  // Reset all mock call counts + return values between tests.
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
