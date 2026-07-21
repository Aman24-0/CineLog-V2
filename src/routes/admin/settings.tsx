// src/routes/admin/settings.tsx
//
// CineLog V2 — Admin Settings Route (/admin/settings)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminSettingsPage = lazy(() => import("~/features/admin/AdminSettingsPage"));

export default function AdminSettingsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Settings</Title>
      <AdminSettingsPage />
    </AdminShell>
  );
}
