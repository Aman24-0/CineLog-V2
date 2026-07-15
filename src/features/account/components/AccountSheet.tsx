// src/features/account/components/AccountSheet.tsx
//
// AccountSheet — shared bottom-sheet wrapper for Account-page dialogs.
//
// All Account-page sheets (UpdateEmail, ChangePassword, DeactivateAccount,
// LinkProvider, etc.) share the same visual chrome — only the body
// content differs. This wrapper factors out the shared layout:
//
//   • Portal to <body> so the sheet overlays everything
//   • Dark glass backdrop with blur
//   • Bottom-sheet on mobile, centered modal on desktop
//   • Drag handle (mobile only)
//   • Close button (top-right)
//   • Optional header (icon + title + subtitle)
//   • Scrollable body
//
// The wrapper owns the body-overflow-lock + ESC-to-close behaviour.
// Consumers pass `title`, `icon`, optional `subtitle`, optional `danger`
// flag (red header), and the body JSX.

import { Show, onMount, onCleanup, on, createEffect, type Component, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  subtitle?: string;
  /** Red header variant — for destructive actions. */
  danger?: boolean;
  /** Lock the close button + ESC (e.g. during an in-flight request). */
  busy?: boolean;
  /** Optional max-width override. Default: max-w-md (28rem). */
  maxWidth?: string;
  children: JSX.Element;
}

const AccountSheet: Component<AccountSheetProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (props.open) document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !props.busy) props.onClose();
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    });
  });

  // Lock body overflow whenever `open` changes.
  createEffect(on(
    () => props.open,
    (isOpen) => {
      if (isOpen) document.body.style.overflow = "hidden";
      else document.body.style.overflow = "";
    },
  ));

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
          style={{
            background: "rgba(0,0,0,0.85)",
            "backdrop-filter": "blur(12px)",
            "-webkit-backdrop-filter": "blur(12px)",
            "padding-bottom": "var(--nav-total-height)",
          }}
          onClick={() => !props.busy && props.onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <div
            ref={containerRef}
            class={`w-full ${props.maxWidth ?? "max-w-md"} rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter relative`}
            style={{
              "max-height": "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
              "min-height": "0",
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "blur(28px)",
              "-webkit-backdrop-filter": "blur(28px)",
              border: props.danger
                ? "1px solid rgba(248, 113, 113, 0.3)"
                : "1px solid var(--hairline-2)",
              "box-shadow": "var(--shadow-elevated)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile only) */}
            <div
              class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0"
              style={{ background: "var(--hairline-2)" }}
              aria-hidden="true"
            />

            {/* Close button — top right, hidden when busy */}
            <Show when={!props.busy}>
              <button
                onClick={() => props.onClose()}
                class="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 z-10"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-soft)",
                  border: "1px solid var(--hairline)",
                }}
                aria-label="Close"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                  close
                </span>
              </button>
            </Show>

            {/* Header */}
            <div class="px-6 pt-5 pb-3 flex-shrink-0" style={{ "border-bottom": "1px solid var(--hairline)" }}>
              <div class="flex items-center gap-2">
                <Show when={props.icon}>
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "20px",
                      color: props.danger ? "#f87171" : "var(--p)",
                    }}
                    aria-hidden="true"
                  >
                    {props.icon}
                  </span>
                </Show>
                <h3
                  class="type-headline"
                  style={{
                    "font-size": "1.0625rem",
                    margin: 0,
                    color: props.danger ? "#fca5a5" : "var(--text-strong)",
                  }}
                >
                  {props.title}
                </h3>
              </div>
              <Show when={props.subtitle}>
                <p class="type-body-soft" style={{ margin: "0.5rem 0 0", "font-size": "0.8125rem" }}>
                  {props.subtitle}
                </p>
              </Show>
            </div>

            {/* Body — scrollable */}
            <div class="flex-1 overflow-y-auto px-6 pt-4 pb-5" style={{ "overscroll-behavior": "contain" }}>
              {props.children}
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default AccountSheet;
