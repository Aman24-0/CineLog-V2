// src/features/collections/components/CollectionsFilters.tsx
import { Show, type Accessor } from "solid-js";
import FranchiseGrid from "./FranchiseGrid";
import UniverseSuggestions from "./UniverseSuggestions";
import CollectionsGrid from "./CollectionsGrid";
import type { Collection } from "~/shared/types";

/**
 * CollectionsFilters — the "Your Collections" section wrapper.
 *
 * Despite the name (kept to match the user's target architecture list),
 * this is the folder management section: header with New + Smart buttons,
 * inline create-folder bar (when open), and the folder grid itself.
 *
 * Also includes the Franchise Explorer + Universe Suggestions rails that
 * sit above the folder grid in the page layout.
 */
export interface CollectionsFiltersProps {
  loading: Accessor<boolean>;
  userCollections: Accessor<Collection[]>;
  showCreate: Accessor<boolean>;
  newName: Accessor<string>;
  onNewNameChange: (v: string) => void;
  onCreate: () => void;
  onCancelCreate: () => void;
  onShowCreate: () => void;
  onShowSmartBuilder: () => void;
}

export default function CollectionsFilters(props: CollectionsFiltersProps) {
  return (
    <>
      {/* === FRANCHISE EXPLORER (replaces flat "All Universes") === */}
      <section class="collections-fold">
        <div class="collections-fold-label">
          <span
            class="material-symbols-outlined"
            style={{"font-size":"12px","color":"var(--p)"}}
            aria-hidden="true"
          >
            auto_awesome
          </span>
          Explore Universes
        </div>
        <FranchiseGrid />
      </section>

      {/* === UNIVERSE SUGGESTIONS === */}
      <UniverseSuggestions />

      {/* === YOUR COLLECTIONS === */}
      <section class="collections-fold">
        <div class="collections-fold-label">
          <span
            class="material-symbols-outlined"
            style={{"font-size":"12px","color":"var(--p)"}}
            aria-hidden="true"
          >
            folder
          </span>
          Your Collections
          <button
            type="button"
            class="collections-fold-action"
            onClick={props.onShowCreate}
            aria-label="Create new collection"
          >
            <span
              class="material-symbols-outlined"
              style={{"font-size":"14px"}}
              aria-hidden="true"
            >
              add
            </span>
            New
          </button>
          <button
            type="button"
            class="collections-smart-btn"
            onClick={props.onShowSmartBuilder}
            aria-label="Create smart collection"
            style={{ "margin-left": "auto" }}
          >
            <span
              class="material-symbols-outlined"
              style={{"font-size":"12px"}}
              aria-hidden="true"
            >
              auto_awesome
            </span>
            Smart
          </button>
        </div>

        <Show when={props.showCreate()}>
          <div class="collections-create-bar">
            <input
              type="text"
              class="collections-create-input"
              placeholder="Collection name…"
              value={props.newName()}
              onInput={(e) => props.onNewNameChange(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onCreate();
                if (e.key === "Escape") props.onCancelCreate();
              }}
              aria-label="New collection name"
            />
            <button
              class="btn-primary"
              onClick={props.onCreate}
              disabled={!props.newName().trim()}
              style={{ "font-size": "0.5625rem" }}
            >
              Create
            </button>
            <button
              class="btn-ghost"
              onClick={props.onCancelCreate}
              style={{ "font-size": "0.5625rem" }}
            >
              Cancel
            </button>
          </div>
        </Show>

        <CollectionsGrid
          loading={props.loading}
          userCollections={props.userCollections}
        />
      </section>
    </>
  );
}
