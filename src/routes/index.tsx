// src/routes/index.tsx
//
// Navigation restructure: the Home/Dashboard page has been removed.
// Its responsibilities (Recently Added, Continue Watching, Statistics)
// already exist in the Watchlist and Profile pages.
//
// The root route `/` now redirects to `/discover`, which is the new
// default landing page. Discover is the serendipitous entry point —
// it answers "what should I watch next?" without requiring the user to
// have a vault. This makes it the ideal first-screen experience for
// both new and returning users.
import { Navigate } from "@solidjs/router";

export default function HomeRedirect() {
  return <Navigate href="/discover" />;
}
