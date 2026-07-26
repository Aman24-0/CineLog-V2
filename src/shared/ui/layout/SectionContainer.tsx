// src/shared/ui/layout/SectionContainer.tsx
import { ParentComponent, JSX, Show, splitProps, createSignal } from "solid-js";
import { GlassSectionHeader } from "~/shared/ui/glass/GlassSectionHeader";

/** Visual variant for the section header. */
type SectionVariant = "default" | "compact" | "large";

/** Accent decoration for the section header. */
type SectionAccent = "none" | "bar" | "dot" | "glow";

interface SectionContainerProps extends Omit<JSX.HTMLAttributes<HTMLElement>, "ref"> {
  /** Optional title to render a GlassSectionHeader. */
  title?: string;
  /** Eyebrow text above the title. */
  eyebrow?: string;
  /** Icon name (Material Symbols) before the title. */
  icon?: string;
  /** Optional description text below the title. */
  description?: string;
  /** Label for an optional right-aligned action button. */
  actionLabel?: string;
  /** Callback when the action button is clicked. */
  onAction?: () => void;
  /** Visual variant of the header (controls spacing and font size). @default "default" */
  variant?: SectionVariant;
  /** Accent decoration type. @default "none" */
  accent?: SectionAccent;
  /**
   * If true, makes the section collapsible.
   * Renders a chevron icon next to the title instead of an action button.
   * @default false
   */
  collapsible?: boolean;
  /**
   * Only applicable if `collapsible` is true.
   * Sets the initial expanded state. @default true
   */
  defaultExpanded?: boolean;
}

/**
 * SectionContainer — a section wrapper with consistent spacing and optional header.
 * Replaces PremiumSectionContainer.
 */
const SectionContainer: ParentComponent<SectionContainerProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "title",
    "eyebrow",
    "icon",
    "description",
    "actionLabel",
    "onAction",
    "variant",
    "accent",
    "collapsible",
    "defaultExpanded",
    "class",
    "children",
  ]);

  const [expanded, setExpanded] = createSignal(local.defaultExpanded ?? true);

  const isCollapsible = () => local.collapsible;

  const handleToggle = () => {
    if (isCollapsible()) setExpanded((prev) => !prev);
  };

  const handleAction = () => {
    if (isCollapsible()) {
      handleToggle();
    } else if (local.onAction) {
      local.onAction();
    }
  };

  const hasHeader = () => !!(local.title || local.eyebrow);

  const resolvedActionLabel = () => {
    if (isCollapsible()) {
      return expanded() ? "Hide" : "Show";
    }
    return local.actionLabel;
  };

  const resolvedOnAction = () => {
    if (isCollapsible()) return handleAction;
    return local.onAction;
  };

  return (
    <section
      {...rest}
      class={`flex flex-col w-full ${local.class || ""}`}
      aria-label={local.title || "Section"}
    >
      <Show when={hasHeader()}>
        <GlassSectionHeader
          title={local.title || ""}
          eyebrow={local.eyebrow}
          icon={local.icon}
          description={local.description}
          variant={local.variant}
          accent={local.accent}
          actionLabel={resolvedActionLabel()}
          onAction={resolvedOnAction()}
        />
      </Show>

      {/*
        If collapsible, render an animated container.
        Otherwise, render children directly with standard top gap.
      */}
      <Show
        when={isCollapsible()}
        fallback={
          <div class={hasHeader() ? "mt-4" : ""}>
            {local.children}
          </div>
        }
      >
        <div
          class="grid transition-all duration-base ease-spring"
          style={{
            "grid-template-rows": expanded() ? "1fr" : "0fr",
            "opacity": expanded() ? "1" : "0",
            "visibility": expanded() ? "visible" : "hidden",
          }}
          // `inert` when collapsed — removes all focusable descendants
          // from the tab order AND hides them from AT. We do NOT use
          // `aria-hidden` here because the audit flags "ARIA hidden
          // element must not be focusable" — `inert` handles both
          // AT hiding and focus removal in one attribute.
          inert={expanded() ? undefined : true}
        >
          <div class={`overflow-hidden ${hasHeader() ? "pt-2" : ""}`}>
            {local.children}
          </div>
        </div>
      </Show>
    </section>
  );
};

export { SectionContainer };
export default SectionContainer;
