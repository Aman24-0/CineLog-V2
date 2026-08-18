// src/shared/hooks/__tests__/useAbortController.test.ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { useAbortController } from "../useAbortController";

describe("useAbortController", () => {
  it("creates an AbortController on init", () => {
    createRoot((dispose) => {
      const { abortController, isAborted } = useAbortController();
      expect(abortController()).toBeInstanceOf(AbortController);
      expect(isAborted()).toBe(false);
      dispose();
    });
  });

  it("resetAbort aborts current and creates new controller", () => {
    createRoot((dispose) => {
      const { abortController, resetAbort, isAborted } = useAbortController();
      const oldController = abortController();
      const newController = resetAbort();

      expect(oldController.signal.aborted).toBe(true);
      expect(newController).not.toBe(oldController);
      expect(abortController()).toBe(newController);
      dispose();
    });
  });

  it("isAborted reflects current controller state", () => {
    createRoot((dispose) => {
      const { isAborted, resetAbort } = useAbortController();
      expect(isAborted()).toBe(false);
      resetAbort();
      // The NEW controller is not aborted
      expect(isAborted()).toBe(false);
      dispose();
    });
  });
});
