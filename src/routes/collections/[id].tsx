// src/routes/collections/[id].tsx
import { lazy } from "solid-js";

const CollectionDetailPage = lazy(() => import("~/features/collections/CollectionDetailPage"));

export default function CollectionDetailRoute() {
  return <CollectionDetailPage />;
}
