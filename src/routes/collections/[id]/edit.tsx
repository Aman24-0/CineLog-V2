// src/routes/collections/[id]/edit.tsx
import { clientOnly } from "@solidjs/start";

const UniverseEditPage = clientOnly(() => import("~/features/collections/components/UniverseEditPage"));

export default function UniverseEditRoute() {
  return <UniverseEditPage />;
}
