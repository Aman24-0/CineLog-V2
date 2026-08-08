// src/routes/admin/database.tsx
//
// CineLog V2 — Admin Database Inspector Route (/admin/database)
// ---------------------------------------------------------------------
// Phase 9 Chunk 7: new route for the read-only public-schema table
// inspector + RLS policy viewer. Lives in the Developer group.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminDatabasePage = lazy(
  () => import("~/features/admin/AdminDatabasePage")
);

export default function AdminDatabaseRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Database Inspector</Title>
      <AdminDatabasePage />
    </AdminShell>
  );
}
