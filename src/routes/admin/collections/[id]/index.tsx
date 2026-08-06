// src/routes/admin/collections/[id]/index.tsx
//
// CineLog V2 — Admin Collection Editor Route
// ---------------------------------------------------------------------
// Renders AdminCollectionEditorPage for /admin/collections/<slug-or-id>.
// The editor is admin-only and fully separate from the consumer
// /collections/<id>/edit page.
//
// Phase 1 audit fix (Maj-4):
//   Previously this route did NOT wrap with <AdminShell> and did NOT
//   call useAdminAuth(), unlike every other /admin/* route. Non-admin
//   visitors could therefore render the editor chrome (UI shell) even
//   though every API call was still server-side protected. Now this
//   route uses the same pattern as every sibling admin route — the
//   <AdminShell> component internally invokes useAdminAuth() and
//   redirects unauthenticated visitors to /admin/login, so the editor
//   chrome is gated the same way as the rest of the panel.

import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminCollectionEditorPage = lazy(
  () => import("~/features/admin/AdminCollectionEditorPage")
);

export default function AdminCollectionEditorRoute() {
  return (
    <AdminShell>
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
                background: "var(--glass-bg)",
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
    </AdminShell>
  );
}
