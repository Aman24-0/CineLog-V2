// src/features/trash/components/TrashHeader.tsx
//
// TrashHeader — the page-level header for the Trash page.
//
// Layout:
//   [← Back]   TRASH · Recycle Bin   [count badge]
//
// The back arrow links to /profile (the page the user came from).
// The count badge shows the total number of items currently in the
// trash and disappears when the trash is empty.
//
// The eyebrow ("TRASH") and title ("Recycle Bin") follow the same
// visual hierarchy as other secondary pages (Stats, Settings, etc.)
// so the Trash page feels like a first-class citizen rather than a
// hidden utility.

import { Component, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { GlassBadge } from "~/shared/ui/glass";

export interface TrashHeaderProps {
  /** Total number of items in the trash (vault + collections). */
  count: number;
  /** When true, the page is loading and the count badge is hidden. */
  loading?: boolean;
}

const TrashHeader: Component<TrashHeaderProps> = (props) => {
  const navigate = useNavigate();

  return (
    <header class="trash-header sec-fade-in">
      <div class="trash-header-top-row">
        <button
          type="button"
          class="trash-back-btn focus-ring"
          onClick={() => navigate("/profile")}
          aria-label="Back to profile"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            arrow_back
          </span>
          <span>Profile</span>
        </button>

        <Show when={!props.loading && props.count > 0}>
          <GlassBadge
            intent="default"
            size="compact"
            icon="delete"
            label={`${props.count} item${props.count === 1 ? "" : "s"}`}
            class="trash-header-count"
          />
        </Show>
      </div>

      <div class="trash-header-titles">
        <p class="sec-eyebrow">Trash</p>
        <h1 class="sec-title">Recycle Bin</h1>
        <p class="sec-subtitle">
          Deleted items are kept for 30 days. Restore them, or clear the trash to free up space.
        </p>
      </div>
    </header>
  );
};

export default TrashHeader;
