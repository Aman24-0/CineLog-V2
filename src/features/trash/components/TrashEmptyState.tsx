// src/features/trash/components/TrashEmptyState.tsx
//
// TrashEmptyState — the friendly empty state shown when the trash
// has no items.
//
// Layout (centered):
//   ┌─────────────────────────────────────────┐
//   │                  ╭───╮                  │
//   │                  │ 🗑 │                  │
//   │                  ╰───╯                  │
//   │           Trash is Empty                │
//   │   Deleted items will appear here for    │
//   │             30 days.                    │
//   │         [ Go to Library ]             │
//   └─────────────────────────────────────────┘
//
// The CTA takes the user to the Library page (the most useful next
// destination from the Trash — they likely came from there to clean
// up, and now want to get back to their library).

import { Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { GlassEmptyState, GlassButton } from "~/shared/ui/glass";

const TrashEmptyState: Component = () => {
  const navigate = useNavigate();

  return (
    <div class="trash-empty-state-wrapper">
      <GlassEmptyState
        icon="delete"
        title="Trash is Empty"
        message="Deleted items will appear here for 30 days. Restore them anytime, or they'll be permanently removed automatically."
        variant="large"
        surface
        action={
          <GlassButton
            variant="primary"
            size="default"
            icon="bookmark"
            onClick={() => navigate("/library")}
            aria-label="Go to Library"
          >
            Go to Library
          </GlassButton>
        }
        class="trash-empty-state"
      />
    </div>
  );
};

export default TrashEmptyState;
