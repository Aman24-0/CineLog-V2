import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { WatchlistItem } from "~/shared/types";
import ExpandableStatsCard from "../ExpandableStatsCard";

afterEach(() => cleanup());

function title(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "title-1",
    media_type: "movie",
    status: "Completed",
    ...overrides
  };
}

describe("ExpandableStatsCard", () => {
  it("renders separated counts, expands runtimes, and cycles all runtimes together", () => {
    const { container } = render(() => (
      <ExpandableStatsCard
        titles={() => [
          title({ runtime: 121, genresList: ["Drama"] }),
          title({
            id: "series",
            media_type: "tv",
            runtime: 60,
            genresList: ["Comedy"]
          }),
          title({ id: "anime", runtime: 90, genresList: ["Animation"] })
        ]}
      />
    ));

    expect(
      container.querySelector(".profile-stats-category-grid")?.textContent
    ).toContain("1");
    expect(
      container.querySelector(".profile-stats-category-grid")?.textContent
    ).toContain("Movies");
    expect(
      container.querySelector(".profile-stats-category-grid")?.textContent
    ).toContain("Anime");

    const expandButton = container.querySelector(
      ".profile-stats-expand-toggle"
    ) as HTMLButtonElement;
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expandButton);
    expect(expandButton.getAttribute("aria-expanded")).toBe("true");

    const runtimeButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".profile-runtime-value")
    );
    expect(runtimeButtons).toHaveLength(3);
    expect(runtimeButtons[0].textContent).toContain("2:01");

    fireEvent.click(runtimeButtons[0]);
    expect(runtimeButtons[0].textContent).toContain("7,260s");
    expect(runtimeButtons[1].textContent).toContain("3,600s");
    expect(runtimeButtons[2].textContent).toContain("5,400s");
  });
});
