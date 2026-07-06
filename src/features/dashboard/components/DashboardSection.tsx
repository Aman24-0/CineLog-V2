// src/features/dashboard/components/DashboardSection.tsx
import { ParentComponent, JSX, Show } from "solid-js";

interface DashboardSectionProps {
  label: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * DashboardSection — consistent section wrapper for the Dashboard.
 *
 * Inherits the accent-bar label pattern from the Details page's DetailSection,
 * but uses dashboard-specific CSS (.dashboard-section*) for the Dashboard's
 * spacing rhythm.
 *
 * Layout: [accent bar] Label ........ [Action]
 *
 * Usage:
 *   <DashboardSection label="Continue Watching" icon="play_circle">
 *     <ContinueRail ... />
 *   </DashboardSection>
 */
const DashboardSection: ParentComponent<DashboardSectionProps> = (props) => {
  return (
    <section
      class={`dashboard-section${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
    >
      <div class="dashboard-section-label">
        <span class="dashboard-section-label-text">
          <Show when={props.icon}>
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px", color: "var(--p)" }}
              aria-hidden="true"
            >
              {props.icon}
            </span>
          </Show>
          {props.label}
        </span>

        <Show when={props.actionLabel && props.onAction}>
          <button
            type="button"
            onClick={() => props.onAction?.()}
            class="dashboard-section-action"
            aria-label={`${props.actionLabel} — ${props.label}`}
          >
            {props.actionLabel}
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "10px" }}
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </button>
        </Show>
      </div>

      {props.children}
    </section>
  );
};

export default DashboardSection;
