// src/shared/ui/states/__tests__/LoadMoreState.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { LoadMoreState } from "../LoadMoreState";

describe("LoadMoreState", () => {
  it("shows Load more button when hasMore=true and not loading", () => {
    const { getByText } = render(() => (
      <LoadMoreState hasMore={true} loading={false} />
    ));
    expect(getByText("Load more")).toBeTruthy();
  });

  it("shows spinner when loading=true", () => {
    const { getByText, queryByText } = render(() => (
      <LoadMoreState loading={true} hasMore={true} />
    ));
    expect(getByText(/Loading more/)).toBeTruthy();
    expect(queryByText("Load more")).toBeNull();
  });

  it("shows error message when error is set", () => {
    const { getByText } = render(() => (
      <LoadMoreState error="Couldn't load more items." loading={false} />
    ));
    expect(getByText("Couldn't load more items.")).toBeTruthy();
  });

  it("shows Try Again button on error with onRetry", () => {
    const { getByText } = render(() => (
      <LoadMoreState
        error="Failed"
        loading={false}
        onRetry={() => {}}
      />
    ));
    expect(getByText("Try Again")).toBeTruthy();
  });

  it("shows end message when hasMore=false", () => {
    const { getByText } = render(() => (
      <LoadMoreState hasMore={false} loading={false} />
    ));
    expect(getByText("You've reached the end.")).toBeTruthy();
  });

  it("shows custom end message", () => {
    const { getByText } = render(() => (
      <LoadMoreState
        hasMore={false}
        loading={false}
        endMessage="No more results."
      />
    ));
    expect(getByText("No more results.")).toBeTruthy();
  });

  it("has role=status and aria-live=polite", () => {
    const { container } = render(() => <LoadMoreState />);
    const el = container.querySelector("[role='status']");
    expect(el).toBeTruthy();
    expect(el?.getAttribute("aria-live")).toBe("polite");
  });
});
