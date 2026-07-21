// src/routes/admin/homepage.tsx
//
// CineLog V2 — Admin Homepage Sections Route (/admin/homepage)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminHomepagePage = lazy(() => import("~/features/admin/AdminHomepagePage"));

export default function AdminHomepageRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Homepage Sections</Title>
      <AdminHomepagePage />
    </AdminShell>
  );
}
