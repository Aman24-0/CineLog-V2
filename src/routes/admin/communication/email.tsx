// src/routes/admin/communication/email.tsx
//
// CineLog V2 — Admin Communication Hub → Email route

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const EmailPage = lazy(
  () => import("~/features/admin/communication/EmailPage")
);

export default function EmailRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Email</Title>
      <EmailPage />
    </AdminShell>
  );
}
