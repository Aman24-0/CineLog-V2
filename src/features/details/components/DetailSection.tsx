// src/features/details/components/DetailSection.tsx
import { ParentComponent, JSX, Show } from "solid-js";

interface DetailSectionProps {
  label?: string;
  icon?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * DetailSection — consistent content section wrapper for the Details page.
 *
 * Every content section below the ActionDock wraps its content in
 * DetailSection. This guarantees:
 *  - Consistent horizontal padding (1.5rem mobile, 2rem desktop)
 *  - Consistent top margin (1.5rem) between sections
 *  - Optional label with accent bar (using .detail-section-label CSS)
 *
 * The label uses the accent-bar pattern from the V2 design system, creating
 * a visual rhythm that ties all sections together.
 *
 * Usage:
 *   <DetailSection label="Overview" icon="description">
 *     <p>{overview}</p>
 *   </DetailSection>
 */
const DetailSection: ParentComponent<DetailSectionProps> = (props) => {
  return (
    <section
      class={`detail-section${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
    >
      <Show when={props.label}>
        <div class="detail-section-label">
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
        </div>
      </Show>
      {props.children}
    </section>
  );
};

export default DetailSection;
