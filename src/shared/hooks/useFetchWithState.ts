// src/shared/hooks/useFetchWithState.ts
//
// Fetch wrapper that integrates useRequestState + useAbortController + timeout.
// Provides a single `execute` function that handles the full lifecycle:
//   - Abort previous in-flight request
//   - Set loading state
//   - Fetch with timeout
//   - Parse response
//   - Handle HTTP status codes (401, 403, 404, 429, 5xx)
//   - Set success/error state
//
// This is the primary way to make API requests in CineLog going forward.
// Existing hooks can migrate incrementally.
//
// Usage:
//   const req = useFetchWithState<Movie[]>();
//
//   async function loadMovies() {
//     await req.execute("/api/movies", { method: "GET" });
//   }
//
//   <Show when={req.isLoading()}><Skeleton /></Show>
//   <Show when={req.hasError()}><ErrorState onRetry={loadMovies} /></Show>
//   <Show when={req.hasData()}><MovieList data={req.data()!} /></Show>

import { onCleanup } from "solid-js";
import { useRequestState, type RequestError } from "./useRequestState";
import { useAbortController } from "./useAbortController";

export interface UseFetchWithStateOptions {
  /** Request timeout in ms. Default 15000 */
  timeoutMs?: number;
  /** Whether to throw on non-2xx responses. Default true */
  throwOnHttpError?: boolean;
}

export interface UseFetchWithStateReturn<T> {
  // Inherited from useRequestState
  phase: () => import("./useRequestState").RequestPhase;
  data: () => T | null;
  error: () => RequestError | null;
  previousData: () => T | null;
  start: () => void;
  success: (data: T) => void;
  fail: (error: Error | RequestError, status?: number) => void;
  timeout: () => void;
  reset: () => void;
  isIdle: () => boolean;
  isLoading: () => boolean;
  isRefreshing: () => boolean;
  isSuccess: () => boolean;
  hasError: () => boolean;
  hasTimeout: () => boolean;
  hasData: () => boolean;
  isEmpty: () => boolean;
  isOffline: () => boolean;
  isRateLimit: () => boolean;
  isServerError: () => boolean;
  isNotFound: () => boolean;
  isForbidden: () => boolean;
  isUnauthorized: () => boolean;

  // Fetch-specific
  /** Execute a fetch request with full state management */
  execute: (
    url: string,
    init?: RequestInit,
    options?: { skipAbort?: boolean }
  ) => Promise<T | null>;
  /** The raw Response object from the last request */
  lastResponse: () => Response | null;
}

export function useFetchWithState<T = unknown>(
  opts: UseFetchWithStateOptions = {}
): UseFetchWithStateReturn<T> {
  const { timeoutMs = 15000, throwOnHttpError = true } = opts;
  const req = useRequestState<T>();
  const { abortController, resetAbort } = useAbortController();

  let lastResponseRef: Response | null = null;
  const lastResponse = () => lastResponseRef;

  async function execute(
    url: string,
    init: RequestInit = {},
    options: { skipAbort?: boolean } = {}
  ): Promise<T | null> {
    // Abort any in-flight request
    const controller = options.skipAbort ? abortController() : resetAbort();

    req.start();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      req.timeout();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      lastResponseRef = response;
      clearTimeout(timeoutId);

      // Handle HTTP status codes
      if (!response.ok) {
        const status = response.status;

        // Try to get error message from response body
        let errorMessage = `Request failed with status ${status}`;
        try {
          const body = await response.json();
          if (body.error || body.message) {
            errorMessage = body.error || body.message;
          }
        } catch {
          // Non-JSON response — use default message
        }

        if (throwOnHttpError) {
          req.fail(new Error(errorMessage), status);
          return null;
        }

        // If not throwing, still return null for non-2xx
        return null;
      }

      // Parse successful response
      let data: T;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json() as T;
      } else {
        // For non-JSON responses, return the response text cast as T
        data = (await response.text()) as unknown as T;
      }

      req.success(data);
      return data;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Don't update state if the request was aborted (superseded by a new one)
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }

      // Determine status from error
      const status = (err as { status?: number; cause?: { status?: number } })?.status || (err as { cause?: { status?: number } })?.cause?.status;
      req.fail(err instanceof Error ? err : new Error(String(err)), status);
      return null;
    }
  }

  onCleanup(() => {
    // Abort any in-flight request on cleanup
    abortController().abort();
  });

  return {
    ...req,
    execute,
    lastResponse
  };
}
