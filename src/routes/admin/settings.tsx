// src/routes/admin/settings.tsx
//
// CineLog V2 — Admin Settings Route (/admin/settings)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";
import { ErrorState } from "~/shared/ui/states";

const AdminSettingsPage = lazy(
  () => import("~/features/admin/AdminSettingsPage")
);

export default function AdminSettingsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Settings</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <ErrorState
            title="Settings page error"
            message={error.message}
            variant="section"
            onRetry={() => reset()}
          />
        )}
      >
        <AdminSettingsPage />
      </ErrorBoundary>
    </AdminShell>
  );
}
