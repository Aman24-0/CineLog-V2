// src/routes/admin/feature-flags.tsx
//
// CineLog V2 — Admin Feature Flags Page (/admin/feature-flags)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy, ErrorBoundary } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";
import { ErrorState } from "~/shared/ui/states";

const AdminFeatureFlagsPage = lazy(
  () => import("~/features/admin/AdminFeatureFlagsPage")
);

export default function AdminFeatureFlagsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Feature Flags</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <ErrorState
            title="Feature flags page error"
            message={error.message}
            variant="section"
            onRetry={() => reset()}
          />
        )}
      >
        <AdminFeatureFlagsPage />
      </ErrorBoundary>
    </AdminShell>
  );
}
