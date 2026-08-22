import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import GenreExplorer from "../GenreExplorer";

afterEach(cleanup);

describe("GenreExplorer initial render", () => {
  it("renders the complete genre tab list without interaction", () => {
    render(() => <GenreExplorer onSelect={() => undefined} />);
    const tabs = screen.getAllByRole("tab");

    expect(tabs.length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /browse action movies and series/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /browse drama movies and series/i })).toBeTruthy();
  });
});
