// src/routes/admin/content.tsx
//
// CineLog V2 — Admin Featured Content Route (/admin/content)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminContentPage = lazy(() => import("~/features/admin/AdminContentPage"));

export default function AdminContentRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Featured Content</Title>
      <AdminContentPage />
    </AdminShell>
  );
}
