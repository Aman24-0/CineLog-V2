import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import HorizontalRail from "../HorizontalRail";

afterEach(() => cleanup());

describe("HorizontalRail", () => {
  it("renders a horizontally scrollable container with non-shrinking rail items", () => {
    const { container } = render(() => (
      <HorizontalRail
        title="Favorites"
        items={["Dark", "Game of Thrones", "Breaking Bad"]}
        renderItem={(title) => (
          <article data-testid="rail-card">{title}</article>
        )}
      />
    ));

    const scroll = container.querySelector(".horizontal-rail-scroll");
    expect(scroll).not.toBeNull();
    expect(container.querySelectorAll(".horizontal-rail-item")).toHaveLength(3);
    expect(
      container.querySelectorAll('[data-testid="rail-card"]')
    ).toHaveLength(3);
  });

  it("moves wheel input horizontally without trapping page scrolling at the edge", () => {
    const { container } = render(() => (
      <HorizontalRail
        title="Favorites"
        items={["One", "Two", "Three"]}
        renderItem={(title) => <article>{title}</article>}
      />
    ));

    const scroll = container.querySelector(
      ".horizontal-rail-scroll"
    ) as HTMLDivElement;
    Object.defineProperties(scroll, {
      scrollWidth: { configurable: true, value: 900 },
      clientWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, writable: true, value: 300 }
    });
    scroll.scrollBy = () => undefined;

    const middleEvent = new WheelEvent("wheel", {
      deltaY: 120,
      cancelable: true
    });
    fireEvent(scroll, middleEvent);
    expect(middleEvent.defaultPrevented).toBe(true);

    Object.defineProperty(scroll, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 600
    });
    const edgeEvent = new WheelEvent("wheel", {
      deltaY: 120,
      cancelable: true
    });
    fireEvent(scroll, edgeEvent);
    expect(edgeEvent.defaultPrevented).toBe(false);
  });

  it("renders the helpful empty state when a rail has no items", () => {
    const { container } = render(() => (
      <HorizontalRail
        title="Recent Activity"
        items={[]}
        renderItem={() => <div />}
        emptyIcon="history"
        emptyMessage="No recent activity yet"
      />
    ));

    expect(container.querySelector(".empty-rail-state")?.textContent).toContain(
      "No recent activity yet"
    );
  });
});
