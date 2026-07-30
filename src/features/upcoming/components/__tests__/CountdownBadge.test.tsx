// src/features/upcoming/components/__tests__/CountdownBadge.test.tsx
//
// Tests for the CountdownBadge component, focusing on the v5
// `fallbackLabel` prop — used by UpcomingCard to show "RETURNING"
// instead of "OUT NOW" for TV series whose `first_air_date` is in
// the past but which have an upcoming episode in the window (per
// /discover/tv).

import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import type { JSX } from "solid-js";
import CountdownBadge from "../CountdownBadge";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderText(component: () => JSX.Element): string {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(component, div);
  const text = div.textContent ?? "";
  dispose();
  document.body.removeChild(div);
  return text.trim();
}

describe("CountdownBadge", () => {
  it("shows TODAY for today's date", () => {
    const text = renderText(() => <CountdownBadge date={todayStr()} />);
    expect(text).toBe("TODAY");
  });

  it("shows TOMORROW for tomorrow's date", () => {
    const text = renderText(() => (
      <CountdownBadge date={addDays(todayStr(), 1)} />
    ));
    expect(text).toBe("TOMORROW");
  });

  it("shows N DAYS for dates 2-7 days out", () => {
    const text = renderText(() => (
      <CountdownBadge date={addDays(todayStr(), 5)} />
    ));
    expect(text).toBe("5 DAYS");
  });

  it("shows OUT NOW for past dates when no fallbackLabel is provided", () => {
    const text = renderText(() => (
      <CountdownBadge date={addDays(todayStr(), -10)} />
    ));
    expect(text).toBe("OUT NOW");
  });

  it("shows fallbackLabel for past dates when provided", () => {
    const text = renderText(() => (
      <CountdownBadge
        date={addDays(todayStr(), -10)}
        fallbackLabel="RETURNING"
      />
    ));
    expect(text).toBe("RETURNING");
  });

  it("does NOT show fallbackLabel for today's date (fallback only applies to past)", () => {
    const text = renderText(() => (
      <CountdownBadge date={todayStr()} fallbackLabel="RETURNING" />
    ));
    expect(text).toBe("TODAY");
  });

  it("does NOT show fallbackLabel for future dates", () => {
    const text = renderText(() => (
      <CountdownBadge date={addDays(todayStr(), 5)} fallbackLabel="RETURNING" />
    ));
    expect(text).toBe("5 DAYS");
  });
});
