// src/routes/admin/services/resend.tsx
//
// CineLog V2 — Admin Resend Services Hub Route (/admin/services/resend)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const ResendServicePage = lazy(
  () => import("~/features/admin/services/ResendServicePage")
);

export default function AdminResendServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Resend Service</Title>
      <ResendServicePage />
    </AdminShell>
  );
}
