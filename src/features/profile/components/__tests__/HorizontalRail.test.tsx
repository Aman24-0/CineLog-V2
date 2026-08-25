import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@solidjs/testing-library";
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
    expect(scroll?.className).toContain("horizontal-rail-scroll");
    expect(container.querySelectorAll(".horizontal-rail-item")).toHaveLength(3);
    expect(
      container.querySelectorAll('[data-testid="rail-card"]')
    ).toHaveLength(3);
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
