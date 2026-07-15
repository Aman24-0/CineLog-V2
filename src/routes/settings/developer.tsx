// src/routes/settings/developer.tsx
//
// Developer tools have moved to /settings/about (under the "Developer" section).
// This file is kept as a redirect so old bookmarks/links still work.

import { Navigate } from "@solidjs/router";

export default function DeveloperRedirect() {
  return <Navigate href="/settings/about" />;
}
