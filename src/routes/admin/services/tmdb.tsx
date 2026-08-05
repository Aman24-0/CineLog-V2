// src/routes/admin/services/tmdb.tsx
//
// CineLog V2 — Admin TMDB Services Hub Route (/admin/services/tmdb)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const TmdbServicePage = lazy(
  () => import("~/features/admin/services/TmdbServicePage")
);

export default function AdminTmdbServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — TMDB Service</Title>
      <TmdbServicePage />
    </AdminShell>
  );
}
