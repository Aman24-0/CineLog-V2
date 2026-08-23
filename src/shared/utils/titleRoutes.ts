import type { TMDBTitle, WatchlistItem } from "~/shared/types";

export type TitleRouteItem = Pick<
  WatchlistItem | TMDBTitle,
  "id" | "media_type"
>;

/** Canonical detail URL for a movie or TV title. */
export function titleDetailPath(item: TitleRouteItem): string {
  return `/${item.media_type === "tv" ? "tv" : "movie"}/${item.id}`;
}
