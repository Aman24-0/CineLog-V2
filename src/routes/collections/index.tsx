// src/routes/collections/index.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

// clientOnly prevents SSR hydration mismatches — the Collections page
// depends on Supabase auth state and data that are only available on
// the client. Without this guard, SolidJS tries to bind $$click event
// handlers to DOM elements that don't exist during SSR, causing:
//   TypeError: Cannot set properties of null (setting '$$click')
const CollectionsPage = clientOnly(() => import("~/features/collections/CollectionsPage"));

export default function CollectionsRoute() {
  return (
    <>
      <Title>CineLog — Collections</Title>
      <CollectionsPage />
    </>
  );
}
