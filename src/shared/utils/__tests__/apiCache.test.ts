// src/shared/utils/__tests__/apiCache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCacheKey,
  getCached,
  setCached,
  getInFlight,
  setInFlight,
  cachedFetch,
  clearCache,
  TMDB_TTL
} from "../apiCache";

describe("buildCacheKey", () => {
  it("returns endpoint only when no params", () => {
    expect(buildCacheKey("tmdb:movie/123")).toBe("tmdb:movie/123");
  });

  it("appends sorted params as query string", () => {
    const key = buildCacheKey("tmdb:search", { q: "batman", page: 1 });
    expect(key).toBe("tmdb:search?page=1&q=batman");
  });

  it("sorts params alphabetically regardless of input order", () => {
    const k1 = buildCacheKey("ep", { z: "1", a: "2", m: "3" });
    const k2 = buildCacheKey("ep", { a: "2", m: "3", z: "1" });
    expect(k1).toBe(k2);
  });

  it("handles undefined param values (empty string)", () => {
    const key = buildCacheKey("ep", { a: undefined });
    expect(key).toBe("ep?a=");
  });

  it("handles numeric param values", () => {
    const key = buildCacheKey("ep", { page: 5 });
    expect(key).toBe("ep?page=5");
  });
});

describe("getCached / setCached", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns undefined for uncached key", () => {
    expect(getCached("missing")).toBeUndefined();
  });

  it("returns cached value after setCached", () => {
    setCached("key1", { data: "hello" }, TMDB_TTL);
    expect(getCached("key1")).toEqual({ data: "hello" });
  });

  it("returns undefined for expired entry", () => {
    // Set with TTL of 0 → expires immediately (Date.now() > expiresAt)
    setCached("key1", "value", -1);
    expect(getCached("key1")).toBeUndefined();
  });

  it("preserves value type through cache", () => {
    const obj = { a: 1, b: ["x", "y"] };
    setCached("key1", obj, TMDB_TTL);
    expect(getCached("key1")).toEqual(obj);
  });
});

describe("getInFlight / setInFlight", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns undefined when no in-flight request", () => {
    expect(getInFlight("missing")).toBeUndefined();
  });

  it("returns the registered promise", async () => {
    const p = Promise.resolve("result");
    setInFlight("key1", p);
    expect(getInFlight("key1")).toBe(p);
    await p;
  });

  it("cleans up in-flight entry after resolution", async () => {
    const p = Promise.resolve("result");
    setInFlight("key1", p);
    await p;
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(getInFlight("key1")).toBeUndefined();
  });

  it("cleans up in-flight entry after rejection", async () => {
    // The original `promise.finally()` in setInFlight created a derived
    // promise that re-rejected with the original error (causing
    // "Uncaught (in promise)" in the browser console). The fix uses
    // `.then(onFulfilled, onRejected)` instead — both handlers return
    // undefined so the derived promise resolves cleanly.
    //
    // We attach our own rejection handler BEFORE setInFlight so the
    // original promise is "handled" from the start; this lets us
    // verify the cleanup happens without relying on Node's
    // unhandledRejection suppression.
    const p = Promise.reject(new Error("fail"));
    const handled = p.catch(() => "handled");
    setInFlight("key1", p as Promise<unknown>);
    await handled;
    await new Promise((r) => setTimeout(r, 0));
    expect(getInFlight("key1")).toBeUndefined();
  });

  it("does NOT create an uncaught derived promise on rejection (regression)", async () => {
    // Regression test for the "Uncaught (in promise) TMDBError: 404"
    // console flood. The bug was: `promise.finally(() => cleanup())`
    // returns a derived promise that RE-REJECTS with the original
    // error, and nobody awaits it → "Uncaught (in promise)".
    //
    // The fix uses `.then(onFulfilled, onRejected)` — the onRejected
    // handler returns undefined, so the derived promise RESOLVES.
    //
    // We verify by attaching a handler to the derived promise returned
    // from `.then(...)` and asserting it resolves (not rejects).
    // We do NOT attach any handler to the original promise — that
    // mirrors the production scenario where setInFlight is the only
    // place that touches the promise's settlement.
    let unhandledRejection: unknown = null;
    const onUnhandled = (err: unknown) => {
      unhandledRejection = err;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      // Suppress the original promise's rejection so Node doesn't kill
      // the test process — but do this AFTER setInFlight so we test
      // the actual production code path.
      const p: Promise<unknown> = new Promise((_, reject) => {
        // Defer rejection to a microtask so setInFlight runs first.
        queueMicrotask(() => reject(new Error("simulated 404")));
      });
      setInFlight("regression-key", p);

      // Swallow the original rejection so it doesn't surface as an
      // unhandled rejection itself (we only care about the DERIVED
      // promise from .then()/.finally() inside setInFlight).
      p.catch(() => {});

      // Wait for microtasks + a macrotask to flush.
      await new Promise((r) => setTimeout(r, 10));

      // No unhandled rejection should have been emitted. If the bug
      // were still present, the .finally() derived promise would have
      // fired unhandledRejection with "simulated 404".
      expect(unhandledRejection).toBeNull();

      // Cleanup also happened.
      expect(getInFlight("regression-key")).toBeUndefined();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("cachedFetch", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns cached value without calling fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    setCached("key1", "cached", TMDB_TTL);
    const result = await cachedFetch("key1", TMDB_TTL, fetcher);
    expect(result).toBe("cached");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetcher when not cached", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    const result = await cachedFetch("key1", TMDB_TTL, fetcher);
    expect(result).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches the result after fetching", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    await cachedFetch("key1", TMDB_TTL, fetcher);
    expect(getCached("key1")).toBe("fresh");
  });

  it("deduplicates concurrent in-flight requests", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    // Fire two requests concurrently before either resolves
    const [a, b] = await Promise.all([
      cachedFetch("key1", TMDB_TTL, fetcher),
      cachedFetch("key1", TMDB_TTL, fetcher)
    ]);
    expect(a).toBe("fresh");
    expect(b).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache errors — allows retry", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("fail");
      return "success";
    });

    // First call fails — cachedFetch re-throws after cleaning up the
    // in-flight entry. The setInFlight fix (`.then(onFulfilled,
    // onRejected)` instead of `.finally()`) means no unhandled rejection
    // is emitted, so we don't need a process.on("unhandledRejection")
    // swallower here anymore.
    await expect(cachedFetch("key1", TMDB_TTL, fetcher)).rejects.toThrow(
      "fail"
    );
    await new Promise((r) => setTimeout(r, 10));
    // Second call retries and succeeds
    const result = await cachedFetch("key1", TMDB_TTL, fetcher);
    expect(result).toBe("success");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns cached value on subsequent calls (no re-fetch)", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    await cachedFetch("key1", TMDB_TTL, fetcher);
    await cachedFetch("key1", TMDB_TTL, fetcher);
    await cachedFetch("key1", TMDB_TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("TTL constants", () => {
  it("TMDB_TTL is 10 minutes", () => {
    expect(TMDB_TTL).toBe(10 * 60 * 1000);
  });


});

describe("clearCache", () => {
  it("removes all cached entries", () => {
    setCached("key1", "a", TMDB_TTL);
    setCached("key2", "b", TMDB_TTL);
    clearCache();
    expect(getCached("key1")).toBeUndefined();
    expect(getCached("key2")).toBeUndefined();
  });
});
