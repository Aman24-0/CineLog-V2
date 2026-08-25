// src/features/profile/components/UserListsPreview.tsx
//
// UserListsPreview renders the user's non-Favorites collections in the shared
// horizontal rail, with collection covers, title counts, and full-page links.

import { Show, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useCollections } from "~/features/collections/hooks/useCollections";
import HorizontalRail from "./HorizontalRail";

type UserCollection = ReturnType<
  ReturnType<typeof useCollections>["userCollections"]
>[number];

const UserListsPreview: Component = () => {
  const collections = useCollections();
  const navigate = useNavigate();

  const lists = createMemo(() =>
    collections
      .userCollections()
      .filter((collection) => !collection.isFavorites)
      .slice(0, 10)
  );

  const coverOf = (entries: { poster_path?: string | null }[] | undefined) =>
    entries?.find((entry) => entry?.poster_path)?.poster_path ?? null;

  const listCard = (collection: UserCollection) => {
    const cover = coverOf(collection.entries);
    const count = (collection.entries ?? []).length;
    return (
      <button
        type="button"
        class="profile-lists-preview-v3-card focus-ring"
        role="listitem"
        onClick={() => navigate(`/collections/${collection.id}`)}
        aria-label={`${collection.name}: ${count} titles`}
      >
        <Show
          when={cover}
          fallback={
            <div
              class="profile-lists-preview-v3-cover-fallback"
              aria-hidden="true"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                video_library
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(cover!, "w185")}
            class="profile-lists-preview-v3-cover"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </Show>
        <div class="profile-lists-preview-v3-overlay" aria-hidden="true" />
        <div class="profile-lists-preview-v3-meta">
          <p class="profile-lists-preview-v3-name">{collection.name}</p>
          <p class="profile-lists-preview-v3-count">
            {count} {count === 1 ? "title" : "titles"}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div class="profile-lists-preview-v3">
      <HorizontalRail
        title="Lists"
        items={lists}
        viewAllLink="/collections"
        ariaLabel="Your lists"
        renderItem={listCard}
        loading={collections.loading()}
        emptyIcon="video_library"
        emptyMessage="No lists yet. Go to Collections to create your first list."
        emptyAction="Go to Collections"
        emptyActionLink="/collections"
      />
    </div>
  );
};

export default UserListsPreview;
