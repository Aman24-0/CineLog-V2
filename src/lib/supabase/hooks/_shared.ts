/**
 * CineLog V2 — Supabase Hooks: Shared Async-State Helper
 * ---------------------------------------------------------------------
 * A tiny Solid primitive that gives every repository-wrapping hook a
 * uniform `loading` / `error` signal pair plus a `run()` wrapper.
 *
 * Why a shared helper?
 * --------------------
 * Each hook wraps ~8–15 repository methods. Without this helper, every
 * method would repeat the same try / catch / finally boilerplate to
 * track loading and error state. `createAsyncState` centralises that
 * so each hook method is a single line:
 *
 *     return run(() => repo.getVaultItem(identity));
 *
 * Concurrency
 * -----------
 * A reference-counted counter tracks in-flight operations. `loading`
 * stays `true` while ANY operation is running and only goes `false`
 * when the last one finishes. This is correct for concurrent calls
 * (e.g. a dashboard firing 4 shelf queries in parallel).
 *
 * Error handling
 * --------------
 * `run()` catches errors, stores them on the `error` signal, and
 * RE-THROWS so the caller can still react (e.g. show a toast). The
 * repository methods already return `{ data, error }` tuples for
 * expected business errors; `run()` only catches unexpected throws
 * (network failures, programming errors). For the expected-error
 * path, the caller reads `result.error` from the returned tuple.
 *
 * SSR safety
 * ----------
 * `createSignal` is safe on the server — it just creates a signal that
 * never updates (no reactivity system runs during SSR). The hooks
 * therefore render their initial `loading: false` / `error: null`
 * state during SSR and hydrate cleanly.
 */

import { createSignal } from "solid-js";

/**
 * The async-state surface every hook exposes.
 */
export interface AsyncState {
  /** True while at least one tracked operation is in flight. */
  readonly loading: () => boolean;
  /** The last unexpected error thrown by a tracked operation. */
  readonly error: () => Error | null;
  /**
   * Wrap an async operation in the loading/error tracker.
   * Re-throws on error so the caller can react; the error is also
   * stored on the `error` signal.
   */
  readonly run: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Clear the `error` signal (e.g. before a retry). */
  readonly clearError: () => void;
}

/**
 * Create a fresh async-state tracker for a hook instance.
 *
 * Each hook call creates its own tracker — state is NOT shared across
 * components (unlike the Firebase `useAuth` module-level signal). This
 * matches the repository pattern where each component owns its data.
 */
export function createAsyncState(): AsyncState {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let inFlight = 0;

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    inFlight++;
    setLoading(true);
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      inFlight--;
      if (inFlight === 0) setLoading(false);
    }
  };

  const clearError = (): void => {
    setError(null);
  };

  return { loading, error, run, clearError };
}
