import type { TMDBTitle, WatchlistItem } from "~/shared/types";

export type TitleRouteItem = Pick<
  WatchlistItem | TMDBTitle,
  "id" | "media_type"
>;

/** Canonical detail URL for a movie or TV title. */
export function titleDetailPath(item: TitleRouteItem): string {
  return `/${item.media_type === "tv" ? "tv" : "movie"}/${item.id}`;
}

/**
 * Canonical detail URL for notification metadata.
 *
 * The reminder schema uses `series`, while the router intentionally uses the
 * TMDB-facing `tv` segment. Keeping this translation in one helper prevents
 * notification clicks from navigating to the non-existent `/series/:id` path.
 */
export function relatedTitleDetailPath(
  relatedId: string | number,
  relatedType: string | null | undefined
): string {
  const segment =
    relatedType === "series" || relatedType === "tv" || relatedType === "episode"
      ? "tv"
      : "movie";
  return `/${segment}/${encodeURIComponent(String(relatedId))}`;
}
