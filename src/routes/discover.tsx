// src/routes/discover.tsx
import { lazy } from "solid-js";

const DiscoverPage = lazy(() => import("~/features/discover/DiscoverPage"));

export default function DiscoverRoute() {
  return <DiscoverPage />;
}
