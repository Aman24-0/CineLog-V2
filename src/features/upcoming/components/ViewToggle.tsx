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
  /**
   * Arrow-key navigation for the roving-tabindex tabs pattern.
   * Left/Right toggles between List and Calendar. Since there are
   * only two tabs, arrow keys act as a simple toggle.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.getAttribute("role") !== "tab") return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        props.onChange(props.value() === "list" ? "calendar" : "list");
        // Move focus to the now-active toggle so the roving tabindex
        // tracks the selection.
        requestAnimationFrame(() => {
          const container = e.currentTarget as HTMLElement;
          const activeTab = container.querySelector<HTMLButtonElement>(
            'button[role="tab"][aria-selected="true"]'
          );
          activeTab?.focus();
        });
        break;
      case "Home":
        e.preventDefault();
        props.onChange("list");
        requestAnimationFrame(() => {
          const container = e.currentTarget as HTMLElement;
          const firstTab =
            container.querySelector<HTMLButtonElement>('button[role="tab"]');
          firstTab?.focus();
        });
        break;
      case "End":
        e.preventDefault();
        props.onChange("calendar");
        requestAnimationFrame(() => {
          const container = e.currentTarget as HTMLElement;
          const tabs =
            container.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
          tabs[tabs.length - 1]?.focus();
        });
        break;
      default:
        return;
    }
  };

  return (
    <div
      class="upcoming-view-toggle"
      role="tablist"
      aria-label="Upcoming view"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.value() === "list"}
        aria-label="List view"
        title="List view"
        // Roving tabindex: only the active toggle button is in the tab
        // order so a single Tab lands on the current view.
        tabindex={props.value() === "list" ? 0 : -1}
        class={`upcoming-view-toggle-btn ${props.value() === "list" ? "is-active" : ""}`}
        onClick={() => props.onChange("list")}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          list
        </span>
        <span>List</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={props.value() === "calendar"}
        aria-label="Calendar view"
        title="Calendar view"
        tabindex={props.value() === "calendar" ? 0 : -1}
        class={`upcoming-view-toggle-btn ${props.value() === "calendar" ? "is-active" : ""}`}
        onClick={() => props.onChange("calendar")}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          calendar_month
        </span>
        <span>Calendar</span>
      </button>
    </div>
  );
};

export default ViewToggle;
