// src/routes/admin/users.tsx
//
// CineLog V2 — Admin Users Page (/admin/users)
// ---------------------------------------------------------------------
// Search + list users, view details, disable/enable/delete/reset prefs.
// All mutations go through /api/admin/users and are audit-logged.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminUsersPage = lazy(() => import("~/features/admin/AdminUsersPage"));

export default function AdminUsersRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Users</Title>
      <AdminUsersPage />
    </AdminShell>
  );
}
