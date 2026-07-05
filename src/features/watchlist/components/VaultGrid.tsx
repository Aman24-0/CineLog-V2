// src/features/watchlist/components/VaultGrid.tsx
import { For, Show } from "solid-js";
import MovieCard from "~/shared/ui/MovieCard";
import type { WatchlistItem } from "~/shared/types";
import EmptyState from "./EmptyState";

interface VaultGridProps {
  items: WatchlistItem[];
  isGuest: boolean;
  onOpenMovie: (id: string) => void;
  onLogin: () => void;
  onClearFilters: () => void;
}

export default function VaultGrid(props: VaultGridProps) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={
        <EmptyState
          isGuest={props.isGuest}
          onLogin={props.onLogin}
          title={props.isGuest ? "Vault is Empty" : "No Matches"}
          message={props.isGuest ? "Sign in to start tracking movies and series." : "No titles match your current filters. Try adjusting or clearing them."}
          actionText={props.isGuest ? "Sign In to Begin" : "Clear Filters"}
          onAction={props.isGuest ? props.onLogin : props.onClearFilters}
        />
      }
    >
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-fade-in" role="list" aria-label="Vault grid">
        <For each={props.items}>
          {(m) => (
            <div role="listitem">
              <MovieCard movie={m} onClick={() => props.onOpenMovie(m.id)} />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
