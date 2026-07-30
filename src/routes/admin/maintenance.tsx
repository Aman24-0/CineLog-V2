// src/routes/admin/maintenance.tsx
//
// CineLog V2 — Admin Maintenance Route (/admin/maintenance)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminMaintenancePage = lazy(
  () => import("~/features/admin/AdminMaintenancePage")
);

export default function AdminMaintenanceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Maintenance</Title>
      <AdminMaintenancePage />
    </AdminShell>
  );
}
