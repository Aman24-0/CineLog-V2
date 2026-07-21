// src/routes/admin/analytics.tsx
//
// CineLog V2 — Admin Analytics Route (/admin/analytics)
// ---------------------------------------------------------------------

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminAnalyticsPage = lazy(() => import("~/features/admin/AdminAnalyticsPage"));

export default function AdminAnalyticsRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Analytics</Title>
      <AdminAnalyticsPage />
    </AdminShell>
  );
}
