// src/routes/admin/services/anilist.tsx
//
// CineLog V2 — Admin AniList Services Hub Route (/admin/services/anilist)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AnilistServicePage = lazy(
  () => import("~/features/admin/services/AnilistServicePage")
);

export default function AdminAnilistServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — AniList Service</Title>
      <AnilistServicePage />
    </AdminShell>
  );
}
