// src/shared/hooks/useRetry.ts
//
// Retry hook with exponential backoff for SolidJS.
// Prevents infinite retry loops. Respects rate limits.
// Never retries non-retryable errors (403, 404).
//
// Usage:
//   const { retry, retryCount, isRetrying, canRetry } = useRetry({
//     maxRetries: 3,
//     baseDelay: 1000,
//     onRetry: () => fetchData()
//   });

import { createSignal, createMemo, onCleanup } from "solid-js";

export interface UseRetryOptions {
  /** Maximum retry attempts. Default 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default 1000 */
  baseDelay?: number;
  /** Maximum delay cap in ms. Default 30000 */
  maxDelay?: number;
  /** Whether to use exponential backoff. Default true */
  exponential?: boolean;
  /** Called on each retry attempt */
  onRetry?: () => void | Promise<void>;
  /** Status codes that should NOT be retried. Default [401, 403, 404] */
  nonRetryableStatuses?: number[];
}

export interface UseRetryReturn {
  /** Trigger a retry */
  retry: (status?: number) => void;
  /** Current retry count */
  retryCount: () => number;
  /** Whether a retry is currently in progress */
  isRetrying: () => boolean;
  /** Whether more retries are available */
  canRetry: () => boolean;
  /** Reset retry state */
  resetRetryCount: () => void;
  /** Delay in ms before the next retry (for display) */
  nextDelay: () => number;
}

export function useRetry(options: UseRetryOptions = {}): UseRetryReturn {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    exponential = true,
    onRetry,
    nonRetryableStatuses = [401, 403, 404]
  } = options;

  const [retryCount, setRetryCount] = createSignal(0);
  const [isRetrying, setIsRetrying] = createSignal(false);

  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (retryTimer) clearTimeout(retryTimer);
  });

  const canRetry = createMemo(() => retryCount() < maxRetries);

  const nextDelay = createMemo(() => {
    const count = retryCount();
    if (!exponential) return Math.min(baseDelay, maxDelay);
    const delay = baseDelay * Math.pow(2, count);
    // Add jitter: random 0-25% of delay
    const jitter = delay * Math.random() * 0.25;
    return Math.min(delay + jitter, maxDelay);
  });

  function retry(status?: number) {
    // Don't retry non-retryable status codes
    if (status !== undefined && nonRetryableStatuses.includes(status)) return;
    // Don't retry if max attempts reached
    if (!canRetry()) return;
    // Don't retry if already retrying
    if (isRetrying()) return;

    setIsRetrying(true);
    const delay = nextDelay();

    retryTimer = setTimeout(async () => {
      setRetryCount((prev) => prev + 1);
      setIsRetrying(false);
      try {
        await onRetry?.();
      } catch {
        // onRetry failure is handled by the caller
      }
    }, delay);
  }

  function resetRetryCount() {
    setRetryCount(0);
    setIsRetrying(false);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  return {
    retry,
    retryCount,
    isRetrying,
    canRetry,
    resetRetryCount,
    nextDelay
  };
}
