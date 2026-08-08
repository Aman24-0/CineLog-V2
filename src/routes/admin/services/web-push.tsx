// src/routes/admin/services/web-push.tsx
//
// CineLog V2 — Admin Web Push Services Hub Route (/admin/services/web-push)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const WebPushServicePage = lazy(
  () => import("~/features/admin/services/WebPushServicePage")
);

export default function AdminWebPushServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Web Push Service</Title>
      <WebPushServicePage />
    </AdminShell>
  );
}
