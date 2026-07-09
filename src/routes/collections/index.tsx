// src/routes/collections/index.tsx
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const CollectionsPage = lazy(() => import("~/features/collections/CollectionsPage"));

export default function CollectionsRoute() {
  return (
    <>
      <Title>CineLog — Collections</Title>
      <CollectionsPage />
    </>
  );
}
