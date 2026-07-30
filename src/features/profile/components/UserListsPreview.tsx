// src/features/profile/components/UserListsPreview.tsx
//
// UserListsPreview — horizontal-scroll carousel of the user's
// non-archived collections (excluding the Favorites folder, which
// has its own dedicated tab on the Profile page).
//
// Each card: cover (first poster from the collection's entries, or a
// gradient fallback), title, item count. Click navigates to the
// collection detail page.
//
// Uses useCollections to read the user's collections (already loaded
// by the CollectionsProvider at the app root, so no extra fetch).

import { Show, For, createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useCollections } from "~/features/collections/hooks/useCollections";

const UserListsPreview: Component = () => {
  const collections = useCollections();
  const navigate = useNavigate();

  // Show non-archived user collections, Favorites last (since it has
  // its own tab). Limit to 10 for the preview.
  const lists = createMemo(() => {
    const all = collections.userCollections();
    return all.filter((c) => !c.isFavorites).slice(0, 10);
  });

  const coverOf = (
    entries: { poster_path?: string | null }[] | undefined
  ): string | null => {
    if (!entries || entries.length === 0) return null;
    const first = entries.find((e) => e?.poster_path);
    return first?.poster_path ?? null;
  };

  return (
    <div class="profile-lists-preview-v3" aria-label="Your lists">
      <Show when={collections.loading() && lists().length === 0}>
        <div class="profile-lists-preview-v3-skeleton">
          <For each={Array.from({ length: 3 })}>
            {() => (
              <GlassSkeleton class="profile-lists-preview-v3-skeleton-card" />
            )}
          </For>
        </div>
      </Show>

      <Show when={!collections.loading() && lists().length === 0}>
        <GlassEmptyState
          icon="video_library"
          title="No lists yet"
          message="Create a collection on the Collections page to organise your titles by theme, franchise, or mood."
          variant="compact"
        />
      </Show>

      <Show when={lists().length > 0}>
        <div class="profile-lists-preview-v3-rail" role="list">
          <For each={lists()}>
            {(col) => {
              const cover = coverOf(col.entries);
              const count = (col.entries ?? []).length;
              return (
                <button
                  type="button"
                  class="profile-lists-preview-v3-card focus-ring"
                  role="listitem"
                  onClick={() => navigate(`/collections/${col.id}`)}
                  aria-label={`${col.name}: ${count} titles`}
                >
                  <Show
                    when={cover}
                    fallback={
                      <div
                        class="profile-lists-preview-v3-cover-fallback"
                        aria-hidden="true"
                      >
                        <span
                          class="material-symbols-outlined"
                          aria-hidden="true"
                        >
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
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </Show>
                  <div
                    class="profile-lists-preview-v3-overlay"
                    aria-hidden="true"
                  />
                  <div class="profile-lists-preview-v3-meta">
                    <p class="profile-lists-preview-v3-name">{col.name}</p>
                    <p class="profile-lists-preview-v3-count">
                      {count} {count === 1 ? "title" : "titles"}
                    </p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default UserListsPreview;
