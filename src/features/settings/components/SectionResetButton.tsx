// src/features/settings/components/SectionResetButton.tsx
//
// Phase 6 Part 3 — Task 3.
//
// Small "Reset to defaults" button rendered at the bottom of each
// settings section panel. Calls `state.handleResetSection(sectionId)`
// on click.
//
// The button is intentionally subtle (ghost style, small icon) so it
// doesn't compete with the section's primary actions. The user
// confirms via the success toast (no inline confirmation dialog —
// the reset is easily reversible by re-toggling the prefs).

import { type Component, Show } from "solid-js";
import type { SettingsState } from "~/features/settings/sections/types";

export interface SectionResetButtonProps {
  state: SettingsState;
  sectionId: string;
  /** Optional label override. Defaults to "Reset to defaults". */
  label?: string;
}

const SectionResetButton: Component<SectionResetButtonProps> = (props) => {
  return (
    <Show when={props.state.handleResetSection}>
      <div class="settings-section-reset-row">
        <button
          type="button"
          class="settings-section-reset-btn focus-ring"
          onClick={() => props.state.handleResetSection(props.sectionId)}
          aria-label={props.label ?? "Reset this section to defaults"}
        >
          <span
            class="material-symbols-outlined"
            aria-hidden="true"
            style={{ "font-size": "14px" }}
          >
            restart_alt
          </span>
          <span>{props.label ?? "Reset to defaults"}</span>
        </button>
      </div>
    </Show>
  );
};

export default SectionResetButton;
