// src/routes/collections.tsx
import { lazy } from "solid-js";

const CollectionsPage = lazy(() => import("~/features/collections/CollectionsPage"));

export default function CollectionsRoute() {
  return <CollectionsPage />;
}
