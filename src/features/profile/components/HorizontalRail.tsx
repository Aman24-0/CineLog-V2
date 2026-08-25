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
  const [isDragging, setIsDragging] = createSignal(false);
  let pointerId: number | null = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerStartScrollLeft = 0;
  let touchActive = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartScrollLeft = 0;
  let touchDragging = false;

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

  // Desktop mouse dragging is kept separate from touch handling so a
  // vertical page gesture is never hijacked by the rail.
  const handlePointerDown = (event: PointerEvent) => {
    const element = scrollRef;
    if (
      !element ||
      element.scrollWidth <= element.clientWidth ||
      event.pointerType === "touch" ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerStartScrollLeft = element.scrollLeft;
    setIsDragging(false);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const element = scrollRef;
    if (
      !element ||
      pointerId !== event.pointerId ||
      event.pointerType === "touch"
    ) {
      return;
    }

    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;
    if (!isDragging()) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        pointerId = null;
        return;
      }
      setIsDragging(true);
      element.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    element.scrollLeft = pointerStartScrollLeft - deltaX;
  };

  const endPointerDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    scrollRef?.releasePointerCapture?.(event.pointerId);
    pointerId = null;
    setIsDragging(false);
  };

  // Some mobile browsers expose touch gestures through TouchEvent rather
  // than a draggable native overflow surface. Once horizontal intent is
  // clear, take over the gesture and move the rail directly.
  const handleTouchStart = (event: TouchEvent) => {
    const element = scrollRef;
    const touch = event.touches[0];
    if (!element || !touch || element.scrollWidth <= element.clientWidth) {
      return;
    }
    touchActive = true;
    touchDragging = false;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartScrollLeft = element.scrollLeft;
  };

  const handleTouchMove = (event: TouchEvent) => {
    const element = scrollRef;
    const touch = event.touches[0];
    if (!element || !touch || !touchActive) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (!touchDragging) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        touchActive = false;
        return;
      }
      touchDragging = true;
      setIsDragging(true);
    }
    event.preventDefault();
    element.scrollLeft = touchStartScrollLeft - deltaX;
  };

  const endTouchDrag = () => {
    touchActive = false;
    touchDragging = false;
    setIsDragging(false);
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
            <div class="horizontal-rail-empty-container">
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
            </div>
          }
        >
          <div
            ref={scrollRef}
            class="horizontal-rail-scroll"
            classList={{ "is-dragging": isDragging() }}
            data-dragging={isDragging() ? "true" : "false"}
            onScroll={checkScrollPosition}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointerDrag}
            onPointerCancel={endPointerDrag}
            on:touchstart={handleTouchStart}
            on:touchmove={handleTouchMove}
            on:touchend={endTouchDrag}
            on:touchcancel={endTouchDrag}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") endPointerDrag(event);
            }}
            onDragStart={(event) => event.preventDefault()}
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
