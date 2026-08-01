// src/routes/admin/anime.tsx
//
// CineLog V2 — Admin Anime Settings Page (/admin/anime)
// ---------------------------------------------------------------------
// Phase 8 — Admin UI for the AniList integration. Lets the admin
// toggle anime features on/off, configure cache TTLs, and view
// mapping stats.
//
// Reads/writes /api/admin/anime-settings (service-role guarded).

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminAnimePage = lazy(
  () => import("~/features/admin/AdminAnimePage")
);

export default function AdminAnimeRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Anime Integration</Title>
      <AdminAnimePage />
    </AdminShell>
  );
}
