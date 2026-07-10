// src/shared/ui/primitives/Section.tsx
import { ParentComponent, JSX, Show } from "solid-js";

interface SectionProps {
  /** Section title (shown in the section header). */
  title?: string;
  /** Optional eyebrow label above the title (small accent text). */
  eyebrow?: string;
  /** Optional icon name (Material Symbols) shown before the title. */
  icon?: string;
  /** Optional action label (e.g. "View All"). */
  actionLabel?: string;
  /** Called when the action button is clicked. */
  onAction?: () => void;
  /** Section spacing variant. "default" = space-y-6 between sections. */
  spacing?: "default" | "tight" | "loose";
  /** Override the section's bottom margin. */
  class?: string;
  style?: JSX.CSSProperties;
}

const spacingMap = {
  tight: "mb-4",
  default: "mb-6",
  loose: "mb-8"
} as const;

/**
 * Section — the universal building block for page content.
 *
 * Every page is a sequence of <Section> blocks. Each section has:
 *  - An optional header (eyebrow + title + icon + action)
 *  - A content area (children)
 *  - Consistent bottom margin for page rhythm
 *
 * The header uses the .section-header / .section-header-title / .section-header-action
 * CSS classes from globals.css, so all sections share one visual language.
 *
 * When `title` is omitted, the section renders as a bare content block with
 * only the spacing — useful for hero sections or full-bleed content.
 *
 * Usage:
 *   <Section title="Continue Watching" icon="play_circle" actionLabel="View All" onAction={...}>
 *     <Rail>{cards}</Rail>
 *   </Section>
 */
const Section: ParentComponent<SectionProps> = (props) => {
  const spacing = () => props.spacing ?? "default";

  return (
    <section
      class={`${spacingMap[spacing()]}${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
    >
      <Show when={props.title || props.eyebrow}>
        <div class="section-header">
          <div class="flex flex-col gap-0.5 min-w-0">
            <Show when={props.eyebrow}>
              <span class="type-eyebrow">{props.eyebrow}</span>
            </Show>
            <h3 class="section-header-title">
              <Show when={props.icon}>
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  {props.icon}
                </span>
              </Show>
              {props.title}
            </h3>
          </div>

          <Show when={props.actionLabel && props.onAction}>
            <button
              type="button"
              onClick={() => props.onAction?.()}
              class="section-header-action"
              aria-label={`${props.actionLabel} — ${props.title}`}
            >
              {props.actionLabel}
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px" }}
                aria-hidden="true"
              >
                arrow_forward
              </span>
            </button>
          </Show>
        </div>
      </Show>

      {props.children}
    </section>
  );
};

export default Section;
