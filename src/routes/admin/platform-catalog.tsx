// src/routes/admin/platform-catalog.tsx
//
// CineLog V2 — Admin Platform Catalogue route (/admin/platform-catalog)
//
// The admin surface for managing the published JustWatch provider
// catalogue that powers the user-side Library Platform filter
// (Part 4 redesign).
//
// Workflow:
//   1. Admin picks a country.
//   2. Admin clicks "Fetch Catalogue" → server calls JustWatch and
//      returns a diff against the saved Supabase rows (SAVED / NEW /
//      UPDATED / REMOVED).
//   3. Admin publishes new / updated providers (Add / Add Selected /
//      Add All New).
//   4. Admin can deactivate providers that should no longer appear
//      in the user-side dropdown (the row is preserved for re-publish).
//   5. Admin can update individual provider metadata (clearName etc.).
//
// Country source for the dropdown: the JustWatch GraphQL `Country`
// enum is NOT introspectable on the public endpoint (introspection
// is disabled). We fall back to a documented, hand-curated list
// derived from JustWatch's publicly-known supported regions
// (verified via the official JustWatch apps + the GraphQL `Country`
// enum values that appear in query payloads). The list mirrors
// `SUPPORTED_DISCOVER_REGIONS` from `discoverRegion.ts` so the
// admin can publish catalogues for every country CineLog already
// supports as a profile country.
//
// See:
//   src/features/admin/AdminPlatformCatalogPage.tsx — the page UI
//   src/routes/api/admin/platform-catalog/* — the API routes

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminPlatformCatalogPage = lazy(
  () => import("~/features/admin/AdminPlatformCatalogPage")
);

export default function AdminPlatformCatalogRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — Platform Catalogue</Title>
      <AdminPlatformCatalogPage />
    </AdminShell>
  );
}
