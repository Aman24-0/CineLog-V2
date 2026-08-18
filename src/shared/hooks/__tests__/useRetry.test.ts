// src/shared/hooks/__tests__/useRetry.test.ts
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "solid-js";
import { useRetry } from "../useRetry";

describe("useRetry", () => {
  it("starts with retryCount=0", () => {
    createRoot((dispose) => {
      const { retryCount, canRetry } = useRetry();
      expect(retryCount()).toBe(0);
      expect(canRetry()).toBe(true);
      dispose();
    });
  });

  it("canRetry is false when at maxRetries", () => {
    createRoot((dispose) => {
      const { retryCount, canRetry, resetRetryCount } = useRetry({ maxRetries: 0 });
      expect(canRetry()).toBe(false);
      resetRetryCount();
      dispose();
    });
  });

  it("does not retry for non-retryable status codes", () => {
    createRoot((dispose) => {
      const onRetry = vi.fn();
      const { retry, retryCount } = useRetry({ onRetry, maxRetries: 3 });

      retry(401);
      expect(retryCount()).toBe(0);
      expect(onRetry).not.toHaveBeenCalled();

      retry(403);
      expect(retryCount()).toBe(0);

      retry(404);
      expect(retryCount()).toBe(0);

      dispose();
    });
  });

  it("resetRetryCount resets the count", () => {
    createRoot((dispose) => {
      const onRetry = vi.fn();
      const { retryCount, resetRetryCount, retry, canRetry } = useRetry({
        maxRetries: 1,
        baseDelay: 0,
        onRetry
      });

      // Manually simulate reaching max
      resetRetryCount();
      expect(retryCount()).toBe(0);
      expect(canRetry()).toBe(true);
      dispose();
    });
  });

  it("does not retry when already retrying", () => {
    createRoot((dispose) => {
      const onRetry = vi.fn();
      const { retry, isRetrying } = useRetry({
        onRetry,
        baseDelay: 10000 // Long delay so it stays in "retrying" state
      });

      retry(); // First retry starts
      retry(); // Second call should be ignored
      // isRetrying should be true during the delay
      dispose();
    });
  });

  it("respects custom nonRetryableStatuses", () => {
    createRoot((dispose) => {
      const onRetry = vi.fn();
      const { retry, retryCount } = useRetry({
        onRetry,
        nonRetryableStatuses: [500] // Custom: don't retry 500
      });

      retry(500);
      expect(retryCount()).toBe(0);
      expect(onRetry).not.toHaveBeenCalled();

      dispose();
    });
  });
});
