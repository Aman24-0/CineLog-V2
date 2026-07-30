// src/features/upcoming/components/SortDropdown.tsx
//
// SortDropdown — a compact <select> styled to match the glass design
// system. Options: Date (asc), Rating (desc), Popularity (desc),
// Title (asc). Persisted to localStorage.

import { type Component, type Accessor } from "solid-js";
import type { UpcomingSort } from "../hooks/useUpcomingData";

const STORAGE_KEY = "cinelog:upcoming:sort";

export function loadUpcomingSort(): UpcomingSort {
  if (typeof window === "undefined") return "date";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "rating" || v === "popularity" || v === "title") return v;
    return "date";
  } catch {
    return "date";
  }
}

export function saveUpcomingSort(v: UpcomingSort) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v);
    }
  } catch {
    // ignore
  }
}

interface SortDropdownProps {
  value: Accessor<UpcomingSort>;
  onChange: (v: UpcomingSort) => void;
}

const OPTIONS: { value: UpcomingSort; label: string; icon: string }[] = [
  { value: "date", label: "Release Date", icon: "event" },
  { value: "rating", label: "Rating", icon: "star" },
  { value: "popularity", label: "Popularity", icon: "trending_up" },
  { value: "title", label: "Title (A–Z)", icon: "sort_by_alpha" },
];

const SortDropdown: Component<SortDropdownProps> = (props) => {
  return (
    <label class="upcoming-sort-dropdown">
      <span class="material-symbols-outlined upcoming-sort-icon" aria-hidden="true">
        sort
      </span>
      <select
        class="upcoming-sort-select"
        value={props.value()}
        onChange={(e) => props.onChange(e.currentTarget.value as UpcomingSort)}
        aria-label="Sort upcoming titles"
      >
        {OPTIONS.map((o) => (
          <option value={o.value}>{o.label}</option>
        ))}
      </select>
      <span class="material-symbols-outlined upcoming-sort-chevron" aria-hidden="true">
        expand_more
      </span>
    </label>
  );
};

export default SortDropdown;
