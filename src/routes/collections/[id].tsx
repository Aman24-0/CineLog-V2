// src/routes/collections/[id].tsx
import { clientOnly } from "@solidjs/start";

// clientOnly prevents SSR hydration mismatches on the collection detail page
// which depends on Supabase auth state and dynamic collection data.
const CollectionDetailPage = clientOnly(() => import("~/features/collections/CollectionDetailPage"));

export default function CollectionDetailRoute() {
  return <CollectionDetailPage />;
}
