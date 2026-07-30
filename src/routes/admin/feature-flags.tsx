// src/routes/admin/feature-flags.tsx
//
// CineLog V2 — Admin Feature Flags Page (/admin/feature-flags)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminFeatureFlagsPage = lazy(
  () => import("~/features/admin/AdminFeatureFlagsPage")
);

export default function AdminFeatureFlagsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Feature Flags</Title>
      <AdminFeatureFlagsPage />
    </AdminShell>
  );
}
