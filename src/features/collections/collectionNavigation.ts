import type { Collection } from "~/shared/types";

/**
 * Resolve collection filter links to the concrete collection detail route.
 * The Favorites folder is an auto-created collection, so its id is the only
 * stable route target; the query string is intentionally consumed here.
 */
export function collectionRouteForFilter(
  filter: string | undefined,
  collections: Collection[]
): string | null {
  if (filter !== "favorites") return null;
  const favorites = collections.find((collection) => collection.isFavorites);
  return favorites ? `/collections/${favorites.id}` : null;
}
