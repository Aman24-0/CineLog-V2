// src/routes/search.tsx
//
// Search is a first-class page in CineLog — the INTENTIONAL discovery
// path (vs Discover, which is the SERENDIPITOUS path). The /search route
// renders the SearchPage component directly. It does NOT redirect to
// /discover; that would merge two intentionally separate experiences.
//
// See src/features/search/SearchPage.tsx for the design philosophy.
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const SearchPage = lazy(() => import("~/features/search/SearchPage"));

export default function SearchRoute() {
  return (
    <>
      <Title>Search · CineLog</Title>
      <SearchPage />
    </>
  );
}
