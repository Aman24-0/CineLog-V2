// src/routes/admin/tmdb-cache.tsx
//
// CineLog V2 — Admin TMDB Cache Route (/admin/tmdb-cache)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminTmdbCachePage = lazy(
  () => import("~/features/admin/AdminTmdbCachePage")
);

export default function AdminTmdbCacheRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — TMDB Cache</Title>
      <AdminTmdbCachePage />
    </AdminShell>
  );
}
