// src/shared/hooks/__tests__/useRequestState.test.ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { useRequestState } from "../useRequestState";

describe("useRequestState", () => {
  it("starts in idle phase", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      expect(req.phase()).toBe("idle");
      expect(req.isIdle()).toBe(true);
      expect(req.isLoading()).toBe(false);
      expect(req.hasData()).toBe(false);
      expect(req.hasError()).toBe(false);
      dispose();
    });
  });

  it("transitions idle → loading → success", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      expect(req.phase()).toBe("loading");
      expect(req.isLoading()).toBe(true);

      req.success(["movie1", "movie2"]);
      expect(req.phase()).toBe("success");
      expect(req.isSuccess()).toBe(true);
      expect(req.hasData()).toBe(true);
      expect(req.data()).toEqual(["movie1", "movie2"]);
      dispose();
    });
  });

  it("transitions idle → loading → error", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.fail(new Error("Network error"));
      expect(req.phase()).toBe("error");
      expect(req.hasError()).toBe(true);
      expect(req.error()?.message).toBe("Network error");
      expect(req.hasData()).toBe(false);
      dispose();
    });
  });

  it("transitions idle → loading → timeout", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.timeout();
      expect(req.phase()).toBe("timeout");
      expect(req.hasTimeout()).toBe(true);
      expect(req.error()?.isTimeout).toBe(true);
      dispose();
    });
  });

  it("isRefreshing is true when refreshing with existing data", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.success(["movie1"]);
      // Now refresh
      req.start();
      expect(req.phase()).toBe("refreshing");
      expect(req.isRefreshing()).toBe(true);
      expect(req.previousData()).toEqual(["movie1"]);
      dispose();
    });
  });

  it("previousData is available during error after refresh", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.success(["movie1"]);
      req.start(); // refresh
      req.fail(new Error("Refresh failed"));
      expect(req.hasError()).toBe(true);
      expect(req.previousData()).toEqual(["movie1"]);
      dispose();
    });
  });

  it("isEmpty is true when success with empty array", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.success([]);
      expect(req.isSuccess()).toBe(true);
      expect(req.isEmpty()).toBe(true);
      expect(req.hasData()).toBe(true);
      dispose();
    });
  });

  it("isEmpty is false when success with non-empty array", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.success(["item"]);
      expect(req.isEmpty()).toBe(false);
      dispose();
    });
  });

  it("error type helpers work correctly", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.fail(new Error("Not found"), 404);
      expect(req.isNotFound()).toBe(true);
      expect(req.isRateLimit()).toBe(false);

      req.start();
      req.fail(new Error("Rate limited"), 429);
      expect(req.isRateLimit()).toBe(true);

      req.start();
      req.fail(new Error("Forbidden"), 403);
      expect(req.isForbidden()).toBe(true);

      req.start();
      req.fail(new Error("Unauthorized"), 401);
      expect(req.isUnauthorized()).toBe(true);

      req.start();
      req.fail(new Error("Server error"), 500);
      expect(req.isServerError()).toBe(true);
      dispose();
    });
  });

  it("reset returns to idle state", () => {
    createRoot((dispose) => {
      const req = useRequestState<string[]>();
      req.start();
      req.success(["data"]);
      req.reset();
      expect(req.phase()).toBe("idle");
      expect(req.data()).toBeNull();
      expect(req.error()).toBeNull();
      dispose();
    });
  });
});
