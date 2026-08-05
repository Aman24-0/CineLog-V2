// src/routes/admin/services/vercel.tsx
//
// CineLog V2 — Admin Vercel Services Hub Route (/admin/services/vercel)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const VercelServicePage = lazy(
  () => import("~/features/admin/services/VercelServicePage")
);

export default function AdminVercelServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Vercel Service</Title>
      <VercelServicePage />
    </AdminShell>
  );
}
