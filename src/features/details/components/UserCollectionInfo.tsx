// src/features/details/components/UserCollectionInfo.tsx
import { Show, createMemo, For, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import DetailSection from "./DetailSection";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { useCuratedUniverses } from "~/features/collections/hooks/useCuratedUniverses";
import { closeTitle } from "~/shared/hooks/useModalState";
import type { WatchlistItem } from "~/shared/types";

interface UserCollectionInfoProps {
  currentItem: WatchlistItem;
}

/**
 * UserCollectionInfo — shows user-owned collections for a title.
 *
 * ONLY displays the Collection section if the title exists inside a
 * user-created collection folder OR a user-subscribed universe folder
 * in Supabase. TMDB's `belongs_to_collection` is NOT rendered — it
 * often refers to franchise bundles that don't match the user's
 * personal organization.
 *
 * If no user collection or universe contains this title, the entire
 * section DOM node is hidden.
 *
 * Matching logic:
 *   - User folders: checks `collectionsForTitle(tmdbId, mediaType)`
 *     which scans all user-created collection entries.
 *   - Universe folders: scans subscribed universes' entries arrays
 *     for a matching (tmdbId, mediaType) pair.
 */
const UserCollectionInfo: Component<UserCollectionInfoProps> = (props) => {
  const navigate = useNavigate();
  const collections = useCollections();
  const { subscribedUniverses } = useCuratedUniverses();

  const tmdbId = () => String(props.currentItem.id);
  const mediaType = () => props.currentItem.media_type;

  /** User-created folders that contain this title. */
  const matchingFolders = createMemo(() =>
    collections.collectionsForTitle(tmdbId(), mediaType()).filter(
      (c) => !c.isFavorites // Exclude the auto-created Favorites folder
    )
  );

  /** Subscribed universes that contain this title. */
  const matchingUniverses = createMemo(() => {
    const id = tmdbId();
    const mt = mediaType();
    return subscribedUniverses().filter((uni) =>
      (uni.entries ?? []).some((e) => e.id === id && e.media_type === mt)
    );
  });

  /** All matching collections (folders + universes). */
  const allMatches = createMemo(() => [
    ...matchingFolders(),
    ...matchingUniverses()
  ]);

  return (
    <Show when={allMatches().length > 0}>
      <DetailSection label="Collection" icon="auto_awesome">
        <div class="flex flex-col gap-2">
          <For each={allMatches()}>
            {(col) => (
              <button
                type="button"
                class="franchise-trigger"
                onClick={() => {
                  // Close the DetailsModal FIRST so the user lands on
                  // the collection page seamlessly — no backdrop navigation
                  // bug where the collection page renders *behind* the modal.
                  closeTitle();
                  navigate(`/collections/${col.id}`);
                }}
                aria-label={`Open ${col.name} collection`}
              >
                <div class="franchise-trigger-icon">
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "24px", color: "var(--p)" }}
                    aria-hidden="true"
                  >
                    {col.type === "curated" ? "public" : "folder"}
                  </span>
                </div>
                <div class="franchise-trigger-text">
                  <p class="franchise-trigger-name">{col.name}</p>
                  <p class="franchise-trigger-meta">
                    {(col.entries ?? []).length} titles
                    {col.type === "curated" ? " · Universe" : " · Your folder"}·
                    View collection
                  </p>
                </div>
                <span
                  class="material-symbols-outlined franchise-trigger-chevron"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default UserCollectionInfo;
