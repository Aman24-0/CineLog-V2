// src/features/sync/components/StorageStats.tsx
//
// StorageStats — friendly statistics about the user's library.
//
// Answers: "How much have I built up?" without database terminology.
// Shows counts for: Movies, Series, Collections, Ratings, Reviews, Notes.

import { createMemo, For, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";

const StorageStats: Component = () => {
  const library = useUserLibrary();

  const stats = createMemo(() => {
    const list = library.watchlist();
    return {
      movies: list.filter((m) => m.media_type === "movie").length,
      series: list.filter((m) => m.media_type === "tv").length,
      ratings: list.filter((m) => m.rating != null && m.rating > 0).length,
      notes: list.filter((m) => m.notes && m.notes.trim().length > 0).length,
      completed: list.filter((m) => m.status === "Completed").length,
      watching: list.filter((m) => m.status === "Watching").length,
    };
  });

  const tiles: { icon: string; label: string; value: () => number }[] = [
    { icon: "movie", label: "Movies", value: () => stats().movies },
    { icon: "tv", label: "Series", value: () => stats().series },
    { icon: "star", label: "Ratings", value: () => stats().ratings },
    { icon: "sticky_note_2", label: "Notes", value: () => stats().notes },
    { icon: "check_circle", label: "Completed", value: () => stats().completed },
    { icon: "play_circle", label: "Watching", value: () => stats().watching },
  ];

  return (
    <div class="sync-storage-grid">
      <For each={tiles}>
        {(tile) => (
          <div class="sync-storage-tile">
            <div class="sync-storage-tile-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "18px", color: "var(--p)" }} aria-hidden="true">{tile.icon}</span>
            </div>
            <span class="sync-storage-tile-value">{tile.value()}</span>
            <span class="sync-storage-tile-label">{tile.label}</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default StorageStats;
