import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { MemoryRouter, Route } from "@solidjs/router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import HorizontalRail from "../HorizontalRail";

const profileCss = readFileSync(
  resolve(process.cwd(), "src/styles/features/profile.css"),
  "utf8"
);

afterEach(() => cleanup());

describe("HorizontalRail", () => {
  it("renders fixed non-shrinking items inside a native horizontal track", () => {
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
    expect(scroll?.getAttribute("role")).toBe("list");
    expect(scroll?.children).toHaveLength(3);
    expect(scroll?.querySelectorAll('[data-testid="rail-card"]')).toHaveLength(
      3
    );
    expect(container.querySelector(".empty-rail-state")).toBeNull();
  });

  it("renders a visible title-plus-arrow View All link when configured", () => {
    const { container } = render(() => (
      <MemoryRouter>
        <Route
          path="/*"
          component={() => (
            <HorizontalRail
              title="Favorites"
              items={[]}
              viewAllLink="/collections?filter=favorites"
              renderItem={() => <div />}
            />
          )}
        />
      </MemoryRouter>
    ));

    const link = container.querySelector(
      ".horizontal-rail-section-link"
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/collections?filter=favorites");
    expect(
      link?.querySelector(".horizontal-rail-section-title")?.textContent
    ).toBe("Favorites");
    expect(link?.querySelector(".material-symbols-outlined")?.textContent).toBe(
      "arrow_forward"
    );
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

  it("defines a native non-snapping rail contract", () => {
    const railBlock = profileCss.match(
      /\.horizontal-rail-scroll \{([\s\S]*?)\n\}/
    )?.[1];
    const childBlock = profileCss.match(
      /\.horizontal-rail-scroll > \* \{([\s\S]*?)\n\}/
    )?.[1];

    expect(railBlock).toContain("display: flex;");
    expect(railBlock).toContain("flex-direction: row;");
    expect(railBlock).toContain("flex-wrap: nowrap;");
    expect(railBlock).toContain("overflow-x: auto;");
    expect(railBlock).toContain("overflow-y: hidden;");
    expect(railBlock).toContain("width: 100%;");
    expect(railBlock).toContain("touch-action: pan-x pan-y;");
    expect(railBlock).not.toContain("scroll-snap");
    expect(childBlock).toContain("flex: 0 0 auto !important;");
    expect(childBlock).toContain("flex-shrink: 0 !important;");
    expect(childBlock).not.toContain("scroll-snap");
  });

  it("uses the desktop rail arrow to advance an overflowing track", () => {
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
      scrollLeft: { configurable: true, writable: true, value: 0 }
    });
    const scrollBy = vi.fn();
    scroll.scrollBy = scrollBy;
    fireEvent.scroll(scroll);

    const rightArrow = container.querySelector(
      ".horizontal-rail-nav-right"
    ) as HTMLButtonElement;
    expect(rightArrow.classList.contains("is-visible")).toBe(true);
    fireEvent.click(rightArrow);
    expect(scrollBy).toHaveBeenCalledWith({
      left: 240,
      behavior: "smooth"
    });
  });

  it("keeps an empty state outside the horizontal track and inside the viewport", () => {
    const { container } = render(() => (
      <MemoryRouter>
        <Route
          path="/*"
          component={() => (
            <HorizontalRail
              title="Lists"
              items={[]}
              renderItem={() => <div />}
              emptyIcon="collections_bookmark"
              emptyMessage="No lists yet. Go to Collections to create your first list!"
              emptyAction="Go to Collections"
              emptyActionLink="/collections"
            />
          )}
        />
      </MemoryRouter>
    ));

    const emptyState = container.querySelector(".empty-rail-state");
    expect(emptyState).not.toBeNull();
    expect(
      emptyState?.parentElement?.classList.contains(
        "horizontal-rail-empty-container"
      )
    ).toBe(true);
    expect(emptyState?.closest(".horizontal-rail-scroll")).toBeNull();
    expect(emptyState?.textContent).toContain("No lists yet");
    expect(emptyState?.textContent).toContain("Go to Collections");
    expect(container.querySelector(".horizontal-rail-scroll")).toBeNull();
  });
});
