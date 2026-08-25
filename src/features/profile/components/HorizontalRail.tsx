import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  onCleanup,
  onMount,
  type Accessor,
  type JSX
} from "solid-js";
import { A } from "@solidjs/router";

export interface HorizontalRailProps<T> {
  title: string;
  items: T[] | Accessor<T[]>;
  renderItem: (item: T) => JSX.Element;
  viewAllLink?: string;
  showNavigation?: boolean;
  ariaLabel?: string;
  class?: string;
  loading?: boolean;
  emptyIcon?: string;
  emptyMessage?: string;
  emptyAction?: string;
  emptyActionLink?: string;
}

const HorizontalRail = <T,>(props: HorizontalRailProps<T>): JSX.Element => {
  let scrollRef: HTMLDivElement | undefined;
  const [showLeftArrow, setShowLeftArrow] = createSignal(false);
  const [showRightArrow, setShowRightArrow] = createSignal(false);

  const items = createMemo(() =>
    typeof props.items === "function" ? props.items() : props.items
  );

  const checkScrollPosition = () => {
    const element = scrollRef;
    if (!element) return;
    const maxScrollLeft = Math.max(
      0,
      element.scrollWidth - element.clientWidth
    );
    setShowLeftArrow(element.scrollLeft > 4);
    setShowRightArrow(element.scrollLeft < maxScrollLeft - 4);
  };

  const scroll = (direction: "left" | "right") => {
    const element = scrollRef;
    if (!element) return;
    const amount = Math.max(element.clientWidth * 0.8, 240);
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth"
    });
  };

  const handleWheel = (event: WheelEvent) => {
    const element = scrollRef;
    if (
      !element ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
      element.scrollWidth <= element.clientWidth
    ) {
      return;
    }

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const scrollingRight = event.deltaY > 0;
    const canConsumeWheel = scrollingRight
      ? element.scrollLeft < maxScrollLeft - 1
      : element.scrollLeft > 1;

    // Release the wheel at either horizontal edge so the page can keep
    // scrolling vertically instead of becoming trapped in the rail.
    if (!canConsumeWheel) return;

    event.preventDefault();
    element.scrollBy({ left: event.deltaY, behavior: "auto" });
  };

  onMount(() => {
    checkScrollPosition();
    const frame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(checkScrollPosition)
        : null;
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(checkScrollPosition)
        : null;
    if (scrollRef) observer?.observe(scrollRef);
    window.addEventListener("resize", checkScrollPosition);
    onCleanup(() => {
      if (frame !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      window.removeEventListener("resize", checkScrollPosition);
    });
  });

  createEffect(() => {
    const hasItems = items().length > 0;
    queueMicrotask(() => {
      if (hasItems) {
        checkScrollPosition();
      } else {
        setShowLeftArrow(false);
        setShowRightArrow(false);
      }
    });
  });

  return (
    <section
      class={`horizontal-rail-section${props.class ? ` ${props.class}` : ""}`}
      aria-label={props.ariaLabel ?? props.title}
    >
      <div class="horizontal-rail-section-header">
        <Show
          when={props.viewAllLink}
          fallback={
            <h2 class="horizontal-rail-section-title">{props.title}</h2>
          }
        >
          <A
            href={props.viewAllLink!}
            class="horizontal-rail-section-link focus-ring"
            aria-label={`View all ${props.title}`}
          >
            <h2 class="horizontal-rail-section-title">{props.title}</h2>
            <span class="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </A>
        </Show>
      </div>

      <div class="horizontal-rail-container">
        <Show
          when={items().length > 0}
          fallback={
            <Show
              when={!props.loading}
              fallback={
                <div class="empty-rail-state" aria-busy="true">
                  <span
                    class="material-symbols-outlined empty-rail-icon"
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                  <p class="empty-message">Loading…</p>
                </div>
              }
            >
              <div class="empty-rail-state">
                <span
                  class="material-symbols-outlined empty-rail-icon"
                  aria-hidden="true"
                >
                  {props.emptyIcon ?? "history"}
                </span>
                <p class="empty-message">
                  {props.emptyMessage ?? "Nothing here yet"}
                </p>
                <Show when={props.emptyAction && props.emptyActionLink}>
                  <A
                    href={props.emptyActionLink!}
                    class="empty-action-link focus-ring"
                  >
                    {props.emptyAction}
                  </A>
                </Show>
              </div>
            </Show>
          }
        >
          <div
            ref={scrollRef}
            class="horizontal-rail-scroll"
            onScroll={checkScrollPosition}
            onWheel={handleWheel}
            role="list"
            tabindex={0}
            aria-label={`${props.title} items`}
          >
            <For each={items()}>{(item) => props.renderItem(item)}</For>
          </div>
        </Show>

        <button
          type="button"
          class="horizontal-rail-nav horizontal-rail-nav-left focus-ring"
          classList={{
            "is-visible": props.showNavigation !== false && showLeftArrow()
          }}
          onClick={() => scroll("left")}
          aria-label={`Scroll ${props.title} left`}
          tabindex={props.showNavigation !== false && showLeftArrow() ? 0 : -1}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
        </button>

        <button
          type="button"
          class="horizontal-rail-nav horizontal-rail-nav-right focus-ring"
          classList={{
            "is-visible": props.showNavigation !== false && showRightArrow()
          }}
          onClick={() => scroll("right")}
          aria-label={`Scroll ${props.title} right`}
          tabindex={props.showNavigation !== false && showRightArrow() ? 0 : -1}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>
    </section>
  );
};

export default HorizontalRail;
