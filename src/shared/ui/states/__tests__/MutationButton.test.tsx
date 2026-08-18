// src/shared/ui/states/__tests__/MutationButton.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { MutationButton } from "../MutationButton";

describe("MutationButton", () => {
  it("renders idle label by default", () => {
    const { getByText, queryByText } = render(() => (
      <MutationButton
        status="idle"
        onClick={() => {}}
        idleLabel="Save Changes"
      />
    ));
    expect(getByText("Save Changes")).toBeTruthy();
    expect(queryByText("Saving...")).toBeNull();
  });

  it("shows submitting label when status=submitting", () => {
    const { getByText, queryByText } = render(() => (
      <MutationButton
        status="submitting"
        onClick={() => {}}
        idleLabel="Save"
        submittingLabel="Saving..."
      />
    ));
    expect(getByText("Saving...")).toBeTruthy();
    expect(queryByText("Save")).toBeNull();
  });

  it("shows success label when status=success", () => {
    const { getByText } = render(() => (
      <MutationButton
        status="success"
        onClick={() => {}}
        successLabel="Saved!"
      />
    ));
    expect(getByText("Saved!")).toBeTruthy();
  });

  it("shows error label when status=error", () => {
    const { getByText } = render(() => (
      <MutationButton
        status="error"
        onClick={() => {}}
        errorLabel="Failed"
      />
    ));
    expect(getByText("Failed")).toBeTruthy();
  });

  it("disables button during submitting", () => {
    const { getByRole } = render(() => (
      <MutationButton
        status="submitting"
        onClick={() => {}}
        idleLabel="Save"
      />
    ));
    const button = getByRole("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables button during success", () => {
    const { getByRole } = render(() => (
      <MutationButton
        status="success"
        onClick={() => {}}
        idleLabel="Save"
      />
    ));
    const button = getByRole("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows click when status is idle", () => {
    let clicked = false;
    const { getByRole } = render(() => (
      <MutationButton
        status="idle"
        onClick={() => { clicked = true; }}
        idleLabel="Save"
      />
    ));
    getByRole("button").click();
    expect(clicked).toBe(true);
  });

  it("allows click when status is error (retry)", () => {
    let clicked = false;
    const { getByRole } = render(() => (
      <MutationButton
        status="error"
        onClick={() => { clicked = true; }}
        idleLabel="Save"
      />
    ));
    getByRole("button").click();
    expect(clicked).toBe(true);
  });

  it("has aria-busy when submitting", () => {
    const { getByRole } = render(() => (
      <MutationButton
        status="submitting"
        onClick={() => {}}
        idleLabel="Save"
      />
    ));
    const button = getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
