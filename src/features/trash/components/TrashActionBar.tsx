// src/features/trash/components/TrashActionBar.tsx
//
// TrashActionBar — the action bar above the trash list.
//
// Two buttons, side-by-side:
//   • Restore All (count) — primary, restores every item in the trash.
//   • Clear Trash         — danger (red), permanently deletes every item.
//
// Both buttons trigger a confirmation dialog (handled by the parent)
// before performing the actual action — see TrashPage for the wiring.
//
// The action bar is hidden when the trash is empty (the empty state
// has its own CTA). It's also hidden during the initial load.

import { Component } from "solid-js";
import { GlassButton } from "~/shared/ui/glass";

export interface TrashActionBarProps {
  /** Total number of items in the trash. */
  count: number;
  /** Disable all buttons (during a mutation). */
  busy?: boolean;
  /** Called when the user clicks "Restore All". Parent shows confirm dialog. */
  onRestoreAll: () => void;
  /** Called when the user clicks "Clear Trash". Parent shows confirm dialog. */
  onClearTrash: () => void;
}

const TrashActionBar: Component<TrashActionBarProps> = (props) => {
  return (
    <div class="trash-action-bar">
      <GlassButton
        variant="secondary"
        size="default"
        fullWidth
        icon="restore"
        disabled={props.busy}
        onClick={() => props.onRestoreAll()}
        aria-label={`Restore all ${props.count} item${props.count === 1 ? "" : "s"} from trash`}
        class="trash-action-restore-all"
      >
        Restore All ({props.count})
      </GlassButton>

      <GlassButton
        variant="danger"
        size="default"
        fullWidth
        icon="delete_forever"
        disabled={props.busy}
        onClick={() => props.onClearTrash()}
        aria-label="Clear all trash permanently"
        class="trash-action-clear"
      >
        Clear Trash
      </GlassButton>
    </div>
  );
};

export default TrashActionBar;
