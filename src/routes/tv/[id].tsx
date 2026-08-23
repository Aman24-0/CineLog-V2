import TitleDetailPage from "~/features/details/TitleDetailPage";

/** Canonical dedicated TV/series detail page: /tv/:id. */
export default function TvDetailRoute() {
  return <TitleDetailPage mediaType="tv" />;
}
