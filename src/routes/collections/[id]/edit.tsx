// src/routes/collections/[id]/edit.tsx
import { lazy } from "solid-js";

const UniverseEditPage = lazy(() => import("~/features/collections/components/UniverseEditPage"));

export default function UniverseEditRoute() {
  return <UniverseEditPage />;
}
