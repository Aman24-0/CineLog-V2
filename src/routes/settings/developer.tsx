// src/routes/settings/developer.tsx
//
// Developer tools have moved to /admin/developer (the admin panel's
// dedicated developer page). This file is kept as a redirect so old
// bookmarks/links still work — anyone visiting /settings/developer is
// forwarded to the new location. The admin developer page is gated
// by AdminShell's useAdminAuth() check, so non-admin visitors land
// on /admin/login instead of seeing a forbidden screen.

import { Navigate } from "@solidjs/router";

export default function DeveloperRedirect() {
  return <Navigate href="/admin/developer" />;
}
