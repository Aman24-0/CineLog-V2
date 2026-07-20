// src/routes/admin/collections.tsx
//
// CineLog V2 — Admin Collections Route (/admin/collections)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminCollectionsPage = lazy(() => import("~/features/admin/AdminCollectionsPage"));

export default function AdminCollectionsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Curated Universes</Title>
      <AdminCollectionsPage />
    </AdminShell>
  );
}
