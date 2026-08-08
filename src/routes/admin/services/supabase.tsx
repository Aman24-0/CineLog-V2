// src/routes/admin/services/supabase.tsx
//
// CineLog V2 — Admin Supabase Services Hub Route (/admin/services/supabase)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const SupabaseServicePage = lazy(
  () => import("~/features/admin/services/SupabaseServicePage")
);

export default function AdminSupabaseServiceRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Supabase Service</Title>
      <SupabaseServicePage />
    </AdminShell>
  );
}
