// src/routes/admin/collections/[id].tsx
//
// CineLog V2 — Admin Collection Editor Route
// ---------------------------------------------------------------------
// Renders AdminCollectionEditorPage for /admin/collections/<slug-or-id>.
// The editor is admin-only and fully separate from the consumer
// /collections/<id>/edit page.

import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary } from "solid-js";
const AdminCollectionEditorPage = lazy(
  () => import("~/features/admin/AdminCollectionEditorPage")
);

export default function AdminCollectionEditorRoute() {
  return (
    <>
      <Title>CineLog Admin — Collection Editor</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div style={{ padding: "var(--sp-8)", color: "var(--text)" }}>
            <h2 style={{ color: "#f87171", "margin-bottom": "var(--sp-2)" }}>
              Couldn't load collection editor
            </h2>
            <p
              style={{
                color: "var(--text-muted)",
                "margin-bottom": "var(--sp-4)"
              }}
            >
              {error.message || "Unknown error"}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "var(--tier-2)",
                color: "var(--text)",
                border: "1px solid var(--hairline)",
                padding: "var(--sp-2) var(--sp-4)",
                "border-radius": "var(--radius-md)",
                cursor: "pointer"
              }}
            >
              Retry
            </button>
          </div>
        )}
      >
        <AdminCollectionEditorPage />
      </ErrorBoundary>
    </>
  );
}
