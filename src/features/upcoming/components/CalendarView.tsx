// src/features/upcoming/components/CalendarView.tsx
//
// CalendarView — monthly calendar grid showing days with releases as
// highlighted tiles. Days outside the current month are dimmed. Today
// is outlined. The user can tap a day to select it; the parent decides
// what to do with the selection (typically scroll the list to that
// date, or render a sub-list below the calendar).
//
// Month navigation: prev/next arrows in the header. The calendar
// starts on Monday (ISO week) to match the DateRangePicker's grouping.

import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import type { TMDBTitle } from "~/shared/types";

interface CalendarViewProps {
  /** Map of YYYY-MM-DD → titles for that day. */
  buckets: () => Map<string, TMDBTitle[]>;
  /** Called when the user taps a day cell. */
  onSelectDay?: (dateStr: string) => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayStr(): string {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

const CalendarView: Component<CalendarViewProps> = (props) => {
  const today = todayStr();
  const [cursorDate, setCursorDate] = createSignal<Date>(new Date());

  const monthLabel = createMemo(() => {
    const d = cursorDate();
    return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  });

  // Build the 6×7 grid (42 cells) covering the visible month. Days
  // outside the month are flagged as such for dimming.
  const cells = createMemo(() => {
    const d = cursorDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // 0=Sun in JS, we want 0=Mon. Shift Sunday to 6.
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const out: {
      dateStr: string;
      day: number;
      inMonth: boolean;
      isToday: boolean;
      count: number;
    }[] = [];

    // Leading days from the previous month.
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prev = new Date(year, month - 1, 1);
      out.push({
        dateStr: ymd(prev.getFullYear(), prev.getMonth(), day),
        day,
        inMonth: false,
        isToday: false,
        count: 0
      });
    }
    // Current month days.
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = ymd(year, month, day);
      out.push({
        dateStr: ds,
        day,
        inMonth: true,
        isToday: ds === today,
        count: props.buckets().get(ds)?.length ?? 0
      });
    }
    // Trailing days from the next month to fill the 42-cell grid.
    while (out.length < 42) {
      const idx = out.length - (firstWeekday + daysInMonth);
      const next = new Date(year, month + 1, 1);
      const day = idx + 1;
      out.push({
        dateStr: ymd(next.getFullYear(), next.getMonth(), day),
        day,
        inMonth: false,
        isToday: false,
        count: 0
      });
    }
    return out;
  });

  const prevMonth = () => {
    const d = cursorDate();
    setCursorDate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    const d = cursorDate();
    setCursorDate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const goToday = () => {
    const d = new Date();
    setCursorDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleClick = (dateStr: string) => {
    props.onSelectDay?.(dateStr);
  };

  return (
    <div class="upcoming-calendar">
      <div class="upcoming-calendar-header">
        <button
          type="button"
          class="upcoming-calendar-nav focus-ring"
          onClick={prevMonth}
          aria-label="Previous month"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
        </button>
        <button
          type="button"
          class="upcoming-calendar-title focus-ring"
          onClick={goToday}
          aria-label="Jump to today"
        >
          {monthLabel()}
        </button>
        <button
          type="button"
          class="upcoming-calendar-nav focus-ring"
          onClick={nextMonth}
          aria-label="Next month"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>
      <div class="upcoming-calendar-weekdays" role="row">
        <For each={WEEKDAY_LABELS}>
          {(w) => (
            <div class="upcoming-calendar-weekday" role="columnheader">
              {w}
            </div>
          )}
        </For>
      </div>
      <div class="upcoming-calendar-grid" role="grid">
        <For each={cells()}>
          {(cell) => (
            <button
              type="button"
              class={`upcoming-calendar-cell ${
                cell.inMonth ? "" : "is-outside"
              } ${cell.isToday ? "is-today" : ""} ${
                cell.count > 0 ? "has-releases" : ""
              }`}
              onClick={() => handleClick(cell.dateStr)}
              aria-label={`${cell.dateStr}${cell.count > 0 ? `, ${cell.count} release${cell.count > 1 ? "s" : ""}` : ""}`}
              disabled={!cell.inMonth && cell.count === 0}
            >
              <span class="upcoming-calendar-day">{cell.day}</span>
              <Show when={cell.count > 0}>
                <span class="upcoming-calendar-dot" aria-hidden="true">
                  {cell.count}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

export default CalendarView;
