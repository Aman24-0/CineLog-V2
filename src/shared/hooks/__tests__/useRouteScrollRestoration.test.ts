import { describe, expect, it } from "vitest";
import { createRouteScrollStore } from "../useRouteScrollRestoration";

describe("createRouteScrollStore", () => {
  it("keeps scroll positions isolated by route and persists them", () => {
    const storage = sessionStorage;
    const first = createRouteScrollStore(storage);
    first.save("/watchlist", 1842.7);
    first.save("/discover", 320);

    const second = createRouteScrollStore(storage);
    expect(second.get("/watchlist")).toBe(1842);
    expect(second.get("/discover")).toBe(320);
    expect(second.get("/settings")).toBe(0);
  });

  it("ignores invalid positions and bounds stored route history", () => {
    const storage = sessionStorage;
    const store = createRouteScrollStore(storage);
    store.save("/watchlist", -10);
    store.save("/discover", Number.NaN);
    for (let i = 0; i < 25; i += 1) store.save(`/route-${i}`, i);

    const restored = createRouteScrollStore(storage);
    expect(restored.get("/watchlist")).toBe(0);
    expect(restored.get("/discover")).toBe(0);
    expect(restored.get("/route-0")).toBe(0);
    expect(restored.get("/route-1")).toBe(1);
    expect(restored.get("/route-24")).toBe(24);
  });
});
