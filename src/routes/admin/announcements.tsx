// src/routes/admin/announcements.tsx
//
// CineLog V2 — Admin Announcements Route (/admin/announcements)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminAnnouncementsPage = lazy(
  () => import("~/features/admin/AdminAnnouncementsPage")
);

export default function AdminAnnouncementsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Announcements</Title>
      <AdminAnnouncementsPage />
    </AdminShell>
  );
}
