// src/routes/admin/communication/notifications.tsx
//
// CineLog V2 — Admin Communication Hub → Global Notification Settings route

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const NotificationsPage = lazy(
  () => import("~/features/admin/communication/NotificationsPage")
);

export default function NotificationsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Global Notification Settings</Title>
      <NotificationsPage />
    </AdminShell>
  );
}
