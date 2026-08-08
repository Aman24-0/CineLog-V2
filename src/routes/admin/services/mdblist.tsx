// src/routes/admin/services/mdblist.tsx
//
// CineLog V2 — Admin MDBList Services Hub Route (/admin/services/mdblist)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const MdblistServicePage = lazy(
  () => import("~/features/admin/services/MdblistServicePage")
);

export default function AdminMdblistServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — MDBList Service</Title>
      <MdblistServicePage />
    </AdminShell>
  );
}
