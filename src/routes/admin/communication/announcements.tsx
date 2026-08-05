// src/routes/admin/communication/announcements.tsx
//
// CineLog V2 — Admin Communication Hub → Announcements route
// ---------------------------------------------------------------------
// Phase 9 Chunk 4: this is the canonical URL for announcement
// management. The legacy /admin/announcements.tsx route still
// exists but redirects here (zero duplication — see that file).

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AnnouncementsPage = lazy(
  () => import("~/features/admin/communication/AnnouncementsPage")
);

export default function AnnouncementsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Announcements</Title>
      <AnnouncementsPage />
    </AdminShell>
  );
}
