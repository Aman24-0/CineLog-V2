// src/shared/ui/premium/layout/PremiumSectionContainer.tsx
import {
  ParentComponent,
  JSX,
  Show,
  createSignal,
  splitProps,
  onMount,
} from "solid-js";

/** Section spacing variant. Controls bottom margin between sections. */
type SectionSpacing = "tight" | "default" | "loose";

interface PremiumSectionContainerProps {
  /** Bottom margin variant. "tight" → mb-4, "default" → mb-6, "loose" → mb-8 */
  spacing?: SectionSpacing;
  /** Section title displayed in the header. */
  title?: string;
  /** Optional eyebrow label above the title (small accent text). */
  eyebrow?: string;
  /** Optional Material Symbols icon name shown before the title. */
  icon?: string;
  /** Optional action button label (e.g. "View All"). */
  actionLabel?: string;
  /** Called when the action button is clicked. */
  onAction?: () => void;
  /** Enable collapsible behavior. Clicking the header toggles children. */
  collapsible?: boolean;
  /** Initial collapsed state. Default: false. */
  defaultCollapsed?: boolean;
  /** Additional CSS class names. */
  class?: string;
  /** Inline style overrides. */
  style?: JSX.CSSProperties;
}

const spacingMap: Record<SectionSpacing, string> = {
  tight: "mb-4",
  default: "mb-6",
  loose: "mb-8",
};

/**
 * PremiumSectionContainer — a section wrapper with consistent spacing and optional header.
 *
 * Provides:
 *  - Consistent bottom margin for page rhythm (tight / default / loose)
 *  - Optional header with eyebrow + title + icon + action
 *  - Collapsible support: clicking the header toggles children visibility
 *    with animated height transition and aria-expanded
 *  - Keyboard navigation: Enter/Space toggles collapse when header is focused
 *  - Reduced motion: collapse animation uses instant toggle when preferred
 *
 * The header renders:
 *  - Eyebrow (small label text) above the title
 *  - Icon (Material Symbols) before the title
 *  - Title in display font
 *  - Action button on the right (when both actionLabel and onAction are provided)
 *  - Expand/collapse chevron when collapsible is true
 *
 * Usage:
 * ```tsx
 * <PremiumSectionContainer
 *   title="Continue Watching"
 *   icon="play_circle"
 *   actionLabel="View All"
 *   onAction={() => navigate("/watchlist")}
 * >
 *   <Rail>{cards}</Rail>
 * </PremiumSectionContainer>
 * ```
 */
const PremiumSectionContainer: ParentComponent<PremiumSectionContainerProps> = (
  props
) => {
  const [local, rest] = splitProps(props, [
    "spacing",
    "title",
    "eyebrow",
    "icon",
    "actionLabel",
    "onAction",
    "collapsible",
    "defaultCollapsed",
    "class",
    "style",
    "children",
  ]);

  const [collapsed, setCollapsed] = createSignal(
    local.defaultCollapsed ?? false
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = createSignal(false);

  onMount(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });

  const spacing = () => local.spacing ?? "default";
  const isCollapsible = () => local.collapsible ?? false;

  const toggleCollapse = () => {
    if (isCollapsible()) {
      setCollapsed((prev) => !prev);
    }
  };

  const handleHeaderKeyDown = (e: KeyboardEvent) => {
    if (isCollapsible() && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggleCollapse();
    }
  };

  const sectionClass = () => {
    const classes = [spacingMap[spacing()]];
    if (local.class) classes.push(local.class);
    return classes.join(" ");
  };

  const collapseTransitionStyle = (): JSX.CSSProperties => {
    if (prefersReducedMotion()) {
      return {
        transition: "none",
      };
    }
    return {
      transition: `max-height var(--dur-modal) var(--ease-smooth), opacity var(--dur-base) var(--ease-out)`,
    };
  };

  return (
    <section {...rest} class={sectionClass()} style={local.style}>
      <Show when={local.title || local.eyebrow}>
        <div
          class="flex items-center justify-between gap-2"
          role={isCollapsible() ? "button" : undefined}
          tabindex={isCollapsible() ? 0 : undefined}
          aria-expanded={isCollapsible() ? !collapsed() : undefined}
          aria-controls={
            isCollapsible() ? "section-content" : undefined
          }
          onClick={isCollapsible() ? toggleCollapse : undefined}
          onKeyDown={isCollapsible() ? handleHeaderKeyDown : undefined}
          classList={{
            "cursor-pointer select-none": isCollapsible(),
            "focus-ring": isCollapsible(),
            "rounded-sm": isCollapsible(),
          }}
        >
          <div class="flex flex-col gap-0.5 min-w-0">
            <Show when={local.eyebrow}>
              <span class="font-label text-2xs tracking-eyebrow uppercase text-primary">
                {local.eyebrow}
              </span>
            </Show>
            <h3 class="font-display text-xl text-text-strong flex items-center gap-2">
              <Show when={local.icon}>
                <span
                  class="material-symbols-outlined text-primary"
                  style={{ "font-size": "var(--font-size-md)" }}
                  aria-hidden="true"
                >
                  {local.icon}
                </span>
              </Show>
              {local.title}
            </h3>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <Show when={local.actionLabel && local.onAction && !isCollapsible()}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  local.onAction?.();
                }}
                class="font-label text-xs tracking-wide text-text-soft hover:text-primary transition-colors duration-fast ease-out focus-ring rounded-sm px-2 py-1"
                aria-label={`${local.actionLabel} — ${local.title}`}
              >
                {local.actionLabel}
                <span
                  class="material-symbols-outlined ml-1"
                  style={{ "font-size": "var(--font-size-2xs)" }}
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </button>
            </Show>

            <Show when={isCollapsible()}>
              <span
                class="material-symbols-outlined text-text-muted transition-transform duration-base ease-smooth"
                style={{
                  "font-size": "var(--font-size-md)",
                  transform: collapsed() ? "rotate(0deg)" : "rotate(180deg)",
                }}
                aria-hidden="true"
              >
                expand_more
              </span>
            </Show>
          </div>
        </div>
      </Show>

      <div
        id="section-content"
        role="region"
        aria-label={local.title ? `${local.title} content` : "Section content"}
        style={{
          ...collapseTransitionStyle(),
          "max-height": isCollapsible()
            ? collapsed()
              ? "0px"
              : "9999px"
            : undefined,
          overflow: isCollapsible() && collapsed() ? "hidden" : undefined,
          opacity: isCollapsible() && collapsed() ? "0" : "1",
        }}
      >
        <div classList={{ "mt-4": !!(local.title || local.eyebrow) }}>
          {local.children}
        </div>
      </div>
    </section>
  );
};

export { PremiumSectionContainer };
export default PremiumSectionContainer;
