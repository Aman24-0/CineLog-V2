// src/features/upcoming/components/DateRangePicker.tsx
//
// DateRangePicker — start + end date inputs with quick presets.
// The presets are mutually exclusive; selecting one sets both start
// and end dates. The "Custom" preset is implied when the user manually
// edits either date.
//
// All state is owned by the parent (this is a controlled component).
// The component calls onChange({start, end}) on any change.
//
// Display label: the human-readable "From — To" string is rendered
// via `Intl.DateTimeFormat` so users always see the current year
// (e.g. "30 Jul 2026 — 29 Aug 2026"), regardless of browser locale
// quirks with <input type="date">. The actual date inputs remain
// HTML5 native pickers for accessibility.

import { type Component, createMemo, For, Show } from "solid-js";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

type PresetKey = "today" | "7days" | "30days" | "90days" | "custom";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 Days" },
  { key: "30days", label: "30 Days" },
  { key: "90days", label: "90 Days" }
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function presetFor(value: DateRange): PresetKey {
  const today = todayStr();
  if (value.start === today && value.end === today) return "today";
  if (value.start === today && value.end === addDays(today, 7)) return "7days";
  if (value.start === today && value.end === addDays(today, 30))
    return "30days";
  if (value.start === today && value.end === addDays(today, 90))
    return "90days";
  return "custom";
}

/**
 * Shared "dd MMM yyyy" formatter (e.g. "30 Jul 2026").
 *
 * Built once and reused — `Intl.DateTimeFormat` is expensive to
 * construct on every call, so the singleton is the idiomatic pattern.
 * Uses the `en-GB` locale because it gives us day-first ordering
 * ("30 Jul 2026") which matches the previous date-fns `dd MMM yyyy`
 * format exactly. The app doesn't localize date strings here — this
 * label is informational only, and the underlying <input type="date">
 * already respects the user's locale for editing.
 */
const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

/**
 * Format a YYYY-MM-DD string as "dd MMM yyyy" (e.g. "30 Jul 2026").
 * Falls back to the raw string if parsing fails — never throws.
 */
function formatDisplay(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    // `new Date("YYYY-MM-DD")` parses as UTC midnight. We construct a
    // local-date version via `new Date(year, monthIdx, day)` so the
    // formatter doesn't shift the day backward in negative-offset
    // timezones (e.g. a UTC-7 user would otherwise see "29 Jul 2026"
    // for a "2026-07-30" input).
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return dateStr;
    }
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return dateStr;
    return DISPLAY_DATE_FORMATTER.format(d);
  } catch {
    return dateStr;
  }
}

const DateRangePicker: Component<DateRangePickerProps> = (props) => {
  const activePreset = createMemo(() => presetFor(props.value));

  // Human-readable range summary, e.g. "30 Jul 2026 — 29 Aug 2026".
  // Shown above the inputs so the user can always see the active
  // window at a glance without having to interpret the native date
  // input UI (which varies wildly across browsers).
  const rangeLabel = createMemo(() => {
    return `${formatDisplay(props.value.start)} — ${formatDisplay(props.value.end)}`;
  });

  const applyPreset = (key: PresetKey) => {
    const today = todayStr();
    if (key === "today") {
      props.onChange({ start: today, end: today });
    } else if (key === "7days") {
      props.onChange({ start: today, end: addDays(today, 7) });
    } else if (key === "30days") {
      props.onChange({ start: today, end: addDays(today, 30) });
    } else if (key === "90days") {
      props.onChange({ start: today, end: addDays(today, 90) });
    }
  };

  return (
    <div class="upcoming-date-range">
      <div
        class="upcoming-date-presets"
        role="group"
        aria-label="Quick date range presets"
      >
        <For each={PRESETS}>
          {(p) => (
            <button
              type="button"
              class={`upcoming-date-preset ${activePreset() === p.key ? "is-active" : ""}`}
              onClick={() => applyPreset(p.key)}
              aria-pressed={activePreset() === p.key}
            >
              {p.label}
            </button>
          )}
        </For>
      </div>
      <Show when={activePreset() === "custom"}>
        <p class="upcoming-date-range-label" aria-live="polite">
          {rangeLabel()}
        </p>
      </Show>
      <div class="upcoming-date-inputs">
        <label class="upcoming-date-input-wrap">
          <span class="upcoming-date-input-label">From</span>
          <input
            type="date"
            class="upcoming-date-input"
            value={props.value.start}
            onChange={(e) => {
              const next = e.currentTarget.value;
              if (next > props.value.end) {
                props.onChange({ start: next, end: next });
              } else {
                props.onChange({ start: next, end: props.value.end });
              }
            }}
          />
        </label>
        <label class="upcoming-date-input-wrap">
          <span class="upcoming-date-input-label">To</span>
          <input
            type="date"
            class="upcoming-date-input"
            value={props.value.end}
            onChange={(e) => {
              const next = e.currentTarget.value;
              if (next < props.value.start) {
                props.onChange({ start: next, end: next });
              } else {
                props.onChange({ start: props.value.start, end: next });
              }
            }}
          />
        </label>
      </div>
    </div>
  );
};

export default DateRangePicker;
