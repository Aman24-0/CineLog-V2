// src/shared/ui/states/__tests__/ErrorState.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { ErrorState } from "../ErrorState";

describe("ErrorState", () => {
  it("renders with default props", () => {
    const { container } = render(() => <ErrorState />);
    expect(container.querySelector("[role='alert']")).toBeTruthy();
    expect(container.textContent).toContain("Something went wrong");
  });

  it("shows custom title and message", () => {
    const { getByText } = render(() => (
      <ErrorState
        title="Couldn't load movies"
        message="The server didn't respond."
      />
    ));
    expect(getByText("Couldn't load movies")).toBeTruthy();
    expect(getByText("The server didn't respond.")).toBeTruthy();
  });

  it("shows retry button when retryable=true and onRetry provided", () => {
    const { getByText } = render(() => (
      <ErrorState
        retryable={true}
        onRetry={() => {}}
        retryLabel="Try Again"
      />
    ));
    expect(getByText("Try Again")).toBeTruthy();
  });

  it("hides retry button when retryable=false", () => {
    const { queryByText } = render(() => (
      <ErrorState
        retryable={false}
        onRetry={() => {}}
        retryLabel="Try Again"
      />
    ));
    expect(queryByText("Try Again")).toBeNull();
  });

  it("has role=alert and aria-live=assertive", () => {
    const { container } = render(() => <ErrorState />);
    const el = container.querySelector("[role='alert']");
    expect(el).toBeTruthy();
    expect(el?.getAttribute("aria-live")).toBe("assertive");
  });

  it("calls onRetry when retry button is clicked", () => {
    let retried = false;
    const { getByText } = render(() => (
      <ErrorState
        onRetry={() => { retried = true; }}
        retryLabel="Retry"
      />
    ));
    getByText("Retry").click();
    expect(retried).toBe(true);
  });

  it("renders page variant with larger sizing", () => {
    const { container } = render(() => (
      <ErrorState variant="page" title="Page Error" />
    ));
    expect(container.textContent).toContain("Page Error");
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("min-h");
  });
});
