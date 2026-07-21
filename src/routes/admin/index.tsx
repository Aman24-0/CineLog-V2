// src/routes/admin/index.tsx
//
// CineLog V2 — Admin Dashboard Route (/admin)
// ---------------------------------------------------------------------
// This route is the entry point for /admin. It renders the AdminShell
// layout, which gates access behind a valid admin session. If the user
// is not authenticated, the shell redirects to /admin/login.
//
// The dashboard page shows 8 metrics:
//   1. Total users
//   2. Active users (24h / 7d / 30d)
//   3. Total watchlist entries
//   4. Movies vs TV Shows
//   5. TMDB cache statistics
//   6. API request count (placeholder for now)
//   7. Server status (live check)
//   8. Database size (via Supabase Management API)

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminDashboard = lazy(() => import("~/features/admin/AdminDashboard"));

export default function AdminIndexRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Dashboard</Title>
      <AdminDashboard />
    </AdminShell>
  );
}
