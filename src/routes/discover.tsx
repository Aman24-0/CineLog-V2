// src/routes/discover.tsx
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const DiscoverPage = lazy(() => import("~/features/discover/DiscoverPage"));

export default function DiscoverRoute() {
  return (
    <>
      <Title>CineLog — Discover</Title>
      <DiscoverPage />
    </>
  );
}
