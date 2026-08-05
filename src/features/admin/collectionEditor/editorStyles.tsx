// src/features/admin/collectionEditor/editorStyles.tsx
//
// Shared style constants + small sub-components for the Admin Collection
// Editor Page.
//
// Extracted from AdminCollectionEditorPage.tsx (Phase 8 Chunk 3) so the
// styles can be reused by other admin pages and the page component file
// can stay focused on the page-level layout + state.
//
// All styles use CSS custom properties (var(--*)) so they pick up the
// global theme tokens defined in app.css.

import { type JSX } from "solid-js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A labelled form field wrapper. */
export function Field(props: {
  label: string;
  /** Optional hint text shown beneath the label (e.g. character count). */
  hint?: string;
  children: JSX.Element;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          "font-size": "0.75rem",
          color: "var(--text-muted)",
          "margin-bottom": "var(--sp-1)",
          "font-weight": "500"
        }}
      >
        {props.label}
      </label>
      {props.children}
      {props.hint ? (
        <div
          style={{
            "font-size": "0.7rem",
            color: "var(--text-muted)",
            "margin-top": "var(--sp-1)",
            opacity: 0.85
          }}
        >
          {props.hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compute the inline style for the floating toast notification.
 *
 * @param success  When true, the toast is green (success); when false, red (error).
 */
export function toastStyle(success: boolean): JSX.CSSProperties {
  return {
    position: "fixed",
    bottom: "var(--sp-6)",
    right: "var(--sp-6)",
    "z-index": 400,
    background: success ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
    color: "white",
    padding: "var(--sp-3) var(--sp-4)",
    "border-radius": "var(--radius-md)",
    "font-size": "0.875rem",
    "font-weight": "600",
    "box-shadow": "0 10px 25px rgba(0,0,0,0.3)"
  };
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

export const cardStyle: JSX.CSSProperties = {
  background: "var(--tier-1, rgba(255,255,255,0.04))",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)"
};

export const alertErrorStyle: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)"
};

export const inputStyle: JSX.CSSProperties = {
  width: "100%",
  background: "var(--tier-2, rgba(255,255,255,0.02))",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-2) var(--sp-3)",
  color: "var(--text)",
  "font-size": "0.875rem",
  "font-family": "inherit",
  "box-sizing": "border-box"
};

export const btnPrimaryStyle: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.8125rem",
  cursor: "pointer"
};

export const btnSecondaryStyle: JSX.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.8125rem",
  cursor: "pointer"
};

export const sortBtn: JSX.CSSProperties = {
  background: "var(--tier-2, rgba(255,255,255,0.02))",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-size": "0.75rem",
  "font-weight": "500",
  cursor: "pointer"
};

export const sortBtnActive: JSX.CSSProperties = {
  ...sortBtn,
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  "border-color": "transparent",
  "font-weight": "600"
};
