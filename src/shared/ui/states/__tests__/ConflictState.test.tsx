// src/shared/ui/states/__tests__/ConflictState.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { ConflictState } from "../ConflictState";

describe("ConflictState", () => {
  it("renders with default message", () => {
    const { container, getByText } = render(() => <ConflictState />);
    expect(container.querySelector("[role='alert']")).toBeTruthy();
    expect(getByText("Content changed")).toBeTruthy();
    expect(
      getByText("This item was modified elsewhere. Refresh to see the latest version.")
    ).toBeTruthy();
  });

  it("shows refresh button when onRefresh provided", () => {
    const { getByText } = render(() => (
      <ConflictState
        onRefresh={() => {}}
        refreshLabel="Refresh Now"
      />
    ));
    expect(getByText("Refresh Now")).toBeTruthy();
  });

  it("has role=alert and aria-live=assertive", () => {
    const { container } = render(() => <ConflictState />);
    const el = container.querySelector("[role='alert']");
    expect(el).toBeTruthy();
    expect(el?.getAttribute("aria-live")).toBe("assertive");
  });

  it("shows custom message", () => {
    const { getByText } = render(() => (
      <ConflictState message="Someone else edited this movie." />
    ));
    expect(getByText("Someone else edited this movie.")).toBeTruthy();
  });

  it("hides refresh button when onRefresh is not provided", () => {
    const { queryByText } = render(() => (
      <ConflictState refreshLabel="Refresh" />
    ));
    expect(queryByText("Refresh")).toBeNull();
  });

  it("calls onRefresh when refresh button is clicked", () => {
    let refreshed = false;
    const { getByText } = render(() => (
      <ConflictState
        onRefresh={() => { refreshed = true; }}
        refreshLabel="Refresh"
      />
    ));
    getByText("Refresh").click();
    expect(refreshed).toBe(true);
  });

  it("renders page variant with larger sizing", () => {
    const { container } = render(() => (
      <ConflictState variant="page" />
    ));
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("min-h");
  });
});
