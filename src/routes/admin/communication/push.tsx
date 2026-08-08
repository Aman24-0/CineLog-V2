// src/routes/admin/communication/push.tsx
//
// CineLog V2 — Admin Communication Hub → Web Push route

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const PushPage = lazy(
  () => import("~/features/admin/communication/PushPage")
);

export default function PushRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Web Push</Title>
      <PushPage />
    </AdminShell>
  );
}
