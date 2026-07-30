// src/features/upcoming/components/ViewToggle.tsx
//
// ViewToggle — two-button segmented control that switches the Upcoming
// page between List view (default) and Calendar view. The selection is
// persisted to localStorage so a user who navigates away and back lands
// on the same view.

import { type Component, type Accessor } from "solid-js";
import type { UpcomingView } from "../hooks/useUpcomingData";

const STORAGE_KEY = "cinelog:upcoming:view";

export function loadUpcomingView(): UpcomingView {
  if (typeof window === "undefined") return "list";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}

export function saveUpcomingView(v: UpcomingView) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v);
    }
  } catch {
    // ignore — private mode etc.
  }
}

interface ViewToggleProps {
  value: Accessor<UpcomingView>;
  onChange: (v: UpcomingView) => void;
}

const ViewToggle: Component<ViewToggleProps> = (props) => {
  return (
    <div
      class="upcoming-view-toggle"
      role="tablist"
      aria-label="Upcoming view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.value() === "list"}
        aria-label="List view"
        title="List view"
        class={`upcoming-view-toggle-btn ${props.value() === "list" ? "is-active" : ""}`}
        onClick={() => props.onChange("list")}
      >
        <span class="material-symbols-outlined" aria-hidden="true">list</span>
        <span>List</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={props.value() === "calendar"}
        aria-label="Calendar view"
        title="Calendar view"
        class={`upcoming-view-toggle-btn ${props.value() === "calendar" ? "is-active" : ""}`}
        onClick={() => props.onChange("calendar")}
      >
        <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
        <span>Calendar</span>
      </button>
    </div>
  );
};

export default ViewToggle;
