// src/routes/admin/cron.tsx
//
// CineLog V2 — Admin Cron Jobs Route (/admin/cron)
// ---------------------------------------------------------------------
// Phase 9 Chunk 7: new route for the pg_cron job inspector + manual
// trigger UI. Lives in the Developer group of the admin sidebar.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminCronPage = lazy(() => import("~/features/admin/AdminCronPage"));

export default function AdminCronRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Cron Jobs</Title>
      <AdminCronPage />
    </AdminShell>
  );
}
