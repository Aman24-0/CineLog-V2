// src/shared/hooks/useRequestState.ts
//
// Unified request state tracking for SolidJS async operations.
// Tracks loading, error, data, timeout, and HTTP status codes.
// Provides discriminant helpers for UI rendering.
//
// This is NOT a data-fetching library — it's a state machine
// that pairs with your existing fetch logic to provide
// consistent state semantics across the entire app.
//
// Usage:
//   const req = useRequestState<Movie[]>();
//
//   async function fetchMovies() {
//     req.start();
//     try {
//       const data = await fetchFromApi();
//       req.success(data);
//     } catch (err) {
//       req.fail(err);
//     }
//   }
//
//   // In JSX:
//   <Show when={req.isLoading()}><Skeleton /></Show>
//   <Show when={req.isEmpty()}><EmptyState /></Show>
//   <Show when={req.hasError()}><ErrorState onRetry={fetchMovies} /></Show>
//   <Show when={req.hasData()}><MovieList data={req.data()!} /></Show>

import { createSignal } from "solid-js";

export type RequestPhase =
  | "idle"       // Not started
  | "loading"    // Initial load (no data yet)
  | "refreshing" // Refreshing (data already exists)
  | "success"    // Successfully loaded (may be empty data)
  | "error"      // Failed
  | "timeout";   // Timed out

export interface RequestError {
  message: string;
  status?: number;
  isTimeout?: boolean;
  isOffline?: boolean;
  isRateLimit?: boolean;
  isServerError?: boolean;
  isNotFound?: boolean;
  isForbidden?: boolean;
  isUnauthorized?: boolean;
}

export interface UseRequestStateReturn<T> {
  // State accessors
  phase: () => RequestPhase;
  data: () => T | null;
  error: () => RequestError | null;
  /** Previous data — available during refresh/error so UI can keep showing stale content */
  previousData: () => T | null;

  // State transitions
  start: () => void;
  success: (data: T) => void;
  fail: (error: Error | RequestError, status?: number) => void;
  timeout: () => void;
  reset: () => void;

  // Discriminant helpers
  isIdle: () => boolean;
  isLoading: () => boolean;
  isRefreshing: () => boolean;
  isSuccess: () => boolean;
  hasError: () => boolean;
  hasTimeout: () => boolean;
  hasData: () => boolean;
  /** True when data array is empty after successful load */
  isEmpty: () => boolean;

  // Error type helpers
  isOffline: () => boolean;
  isRateLimit: () => boolean;
  isServerError: () => boolean;
  isNotFound: () => boolean;
  isForbidden: () => boolean;
  isUnauthorized: () => boolean;
}

export function useRequestState<T>(): UseRequestStateReturn<T> {
  const [phase, setPhase] = createSignal<RequestPhase>("idle");
  const [data, setData] = createSignal<T | null>(null);
  const [error, setError] = createSignal<RequestError | null>(null);
  const [previousData, setPreviousData] = createSignal<T | null>(null);

  function start() {
    if (data() !== null) {
      setPhase("refreshing");
      setPreviousData(() => data() as T);
    } else {
      setPhase("loading");
    }
    setError(null);
  }

  function success(newData: T) {
    setData(() => newData);
    setPreviousData(null);
    setPhase("success");
    setError(null);
  }

  function fail(err: Error | RequestError, status?: number) {
    const reqError: RequestError =
      err instanceof Error
        ? {
            message: err.message || "An error occurred",
            status,
            isTimeout: err.name === "TimeoutError" || err.message?.includes("timeout"),
            isOffline: !window.navigator.onLine,
            isRateLimit: status === 429,
            isServerError: status !== undefined && status >= 500,
            isNotFound: status === 404,
            isForbidden: status === 403,
            isUnauthorized: status === 401
          }
        : { ...err, status: status ?? err.status };

    setError(reqError);
    // Keep previous data during error so UI can show stale content
    if (phase() === "refreshing") {
      // previousData already set in start()
    }
    setPhase("error");
  }

  function timeout() {
    setError({
      message: "Request timed out",
      isTimeout: true
    });
    setPhase("timeout");
  }

  function reset() {
    setPhase("idle");
    setData(null);
    setError(null);
    setPreviousData(null);
  }

  // Discriminant helpers
  const isIdle = () => phase() === "idle";
  const isLoading = () => phase() === "loading";
  const isRefreshing = () => phase() === "refreshing";
  const isSuccess = () => phase() === "success";
  const hasError = () => phase() === "error";
  const hasTimeout = () => phase() === "timeout";
  const hasData = () => data() !== null && (phase() === "success" || phase() === "refreshing");
  const isEmpty = () => isSuccess() && Array.isArray(data()) && (data() as unknown[]).length === 0;

  // Error type helpers
  const isOffline = () => hasError() && error()?.isOffline === true;
  const isRateLimit = () => hasError() && error()?.isRateLimit === true;
  const isServerError = () => hasError() && error()?.isServerError === true;
  const isNotFound = () => hasError() && error()?.isNotFound === true;
  const isForbidden = () => hasError() && error()?.isForbidden === true;
  const isUnauthorized = () => hasError() && error()?.isUnauthorized === true;

  return {
    phase,
    data,
    error,
    previousData,
    start,
    success,
    fail,
    timeout,
    reset,
    isIdle,
    isLoading,
    isRefreshing,
    isSuccess,
    hasError,
    hasTimeout,
    hasData,
    isEmpty,
    isOffline,
    isRateLimit,
    isServerError,
    isNotFound,
    isForbidden,
    isUnauthorized
  };
}
