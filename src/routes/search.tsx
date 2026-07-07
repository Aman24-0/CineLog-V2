// src/routes/search.tsx
import { lazy } from "solid-js";

const SearchPage = lazy(() => import("~/features/search/SearchPage"));

export default function SearchRoute() {
  return <SearchPage />;
}
