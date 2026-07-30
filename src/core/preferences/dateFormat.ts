// src/core/preferences/dateFormat.ts
// Date Format — DD/MM/YYYY / MM/DD/YYYY / YYYY-MM-DD

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored } from "./_storage";

export type DateFormat = "dmy" | "mdy" | "ymd";

const DATE_FORMAT_KEY = "cinelog_date_format";

function isDateFormat(v: string | null): v is DateFormat {
  return v === "dmy" || v === "mdy" || v === "ymd";
}

const storedDF = readStored<string>(DATE_FORMAT_KEY, "dmy");

export const [dateFormat, setDateFormat] = createSignal<DateFormat>(
  isDateFormat(storedDF) ? storedDF : "dmy"
);

createEffect(() => {
  writeStored(DATE_FORMAT_KEY, dateFormat());
});

const DATE_SEPARATORS: Record<DateFormat, string> = {
  dmy: "/",
  mdy: "/",
  ymd: "-"
};
const DATE_ORDER: Record<DateFormat, ("y" | "m" | "d")[]> = {
  dmy: ["d", "m", "y"],
  mdy: ["m", "d", "y"],
  ymd: ["y", "m", "d"]
};

/**
 * Format a date string (YYYY-MM-DD or ISO) per the user's chosen format.
 * Used wherever a short date is shown (cards, lists, detail modal).
 */
export function formatDateUser(dateStr: string): string {
  if (!dateStr) return "";
  const d =
    dateStr.length <= 10 ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const parts: Record<"y" | "m" | "d", string> = {
    y: String(yyyy),
    m: mm,
    d: dd
  };
  const fmt = dateFormat();
  return DATE_ORDER[fmt].map((k) => parts[k]).join(DATE_SEPARATORS[fmt]);
}
