// src/routes/admin/developer.tsx
//
// CineLog V2 — Admin Developer Tools Page (/admin/developer)
// ---------------------------------------------------------------------
// Moved from /settings/about → /admin/developer so developer tools
// live with the rest of the admin panel (gated behind admin auth)
// instead of being accessible to regular users.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminDeveloperPage = lazy(
  () => import("~/features/admin/AdminDeveloperPage")
);

export default function AdminDeveloperRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Developer Tools</Title>
      <AdminDeveloperPage />
    </AdminShell>
  );
}
