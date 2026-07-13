// src/routes/search.tsx
//
// Search has been merged into the Discover page (search bar at top of
// Discover, with the Genre Explorer right below it). The /search route
// now redirects to /discover so any existing links, bookmarks, or
// history entries keep working instead of 404'ing.
import { Navigate } from "@solidjs/router";

export default function SearchRedirect() {
  return <Navigate href="/discover" />;
}
