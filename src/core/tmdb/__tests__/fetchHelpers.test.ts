// src/core/tmdb/__tests__/fetchHelpers.test.ts
import { describe, it, expect } from "vitest";
import {
  TMDBError,
  TMDBRateLimitError,
  TMDBTimeoutError,
  TMDB_FETCH_TIMEOUT_MS
} from "../fetchHelpers";

describe("TMDBError classes", () => {
  it("TMDBRateLimitError is instanceof TMDBError", () => {
    // TMDBRateLimitError(endpoint, retryAfterSec)
    const err = new TMDBRateLimitError("/test", 30);
    expect(err).toBeInstanceOf(TMDBError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect(err.message).toContain("429");
  });

  it("TMDBRateLimitError defaults retryAfterSec to null", () => {
    const err = new TMDBRateLimitError("/test");
    expect(err.retryAfterSec).toBeNull();
  });

  it("TMDBTimeoutError is instanceof Error", () => {
    // TMDBTimeoutError(url)
    const err = new TMDBTimeoutError("/test");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("timed out");
    expect(err.url).toBe("/test");
  });

  it("TMDBError carries status and endpoint", () => {
    // TMDBError(status, endpoint)
    const err = new TMDBError(500, "/api/test");
    expect(err.status).toBe(500);
    expect(err.endpoint).toBe("/api/test");
  });
});

describe("TMDB_FETCH_TIMEOUT_MS", () => {
  it("is a positive number", () => {
    expect(TMDB_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(typeof TMDB_FETCH_TIMEOUT_MS).toBe("number");
  });

  it("defaults to 10 seconds", () => {
    expect(TMDB_FETCH_TIMEOUT_MS).toBe(10000);
  });
});
