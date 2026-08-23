import TitleDetailPage from "~/features/details/TitleDetailPage";

/** Canonical dedicated movie detail page: /movie/:id. */
export default function MovieDetailRoute() {
  return <TitleDetailPage mediaType="movie" />;
}
