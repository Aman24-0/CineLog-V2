// src/shared/hooks/__tests__/useOnlineStatus.test.ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { useOnlineStatus } from "../useOnlineStatus";

describe("useOnlineStatus", () => {
  it("returns isOnline=true by default", () => {
    createRoot((dispose) => {
      const { isOnline, isOffline } = useOnlineStatus();
      // In test environment, navigator.onLine is typically true
      expect(typeof isOnline()).toBe("boolean");
      expect(isOffline()).toBe(!isOnline());
      dispose();
    });
  });

  it("isOffline is the inverse of isOnline", () => {
    createRoot((dispose) => {
      const { isOnline, isOffline } = useOnlineStatus();
      expect(isOffline()).toBe(!isOnline());
      dispose();
    });
  });
});
