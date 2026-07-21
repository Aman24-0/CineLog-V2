// src/routes/admin/logs.tsx
//
// CineLog V2 — Admin Audit Logs Page (/admin/logs)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminLogsPage = lazy(() => import("~/features/admin/AdminLogsPage"));

export default function AdminLogsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Audit Logs</Title>
      <AdminLogsPage />
    </AdminShell>
  );
}
