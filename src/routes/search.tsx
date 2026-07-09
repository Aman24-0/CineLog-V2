// src/routes/search.tsx
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const SearchPage = lazy(() => import("~/features/search/SearchPage"));

export default function SearchRoute() {
  return (
    <>
      <Title>CineLog — Search</Title>
      <SearchPage />
    </>
  );
}
