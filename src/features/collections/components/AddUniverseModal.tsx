// src/features/collections/components/AddUniverseModal.tsx
import { For, Show, createSignal, createMemo, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * AddUniverseModal — a bottom-sheet modal for browsing and adding
 * developer-curated universes.
 *
 * Architecture (BUG 3 + BUG 5 fix):
 *   - Curated universes are READ-ONLY, managed by developers.
 *   - Users SUBSCRIBE to them via user_universe_subscriptions.
 *   - This modal is the ONLY entry point for adding curated universes.
 *   - The Collections page shows user collections PRIMARILY; curated
 *     universes are secondary, accessed via this "Add Universe" button.
 *
 * Features:
 *   - Search by name
 *   - Category filter (franchise groups)
 *   - Add button per universe (calls addUniverseToPrefs)
 *   - Already-added universes show a checkmark
 */
interface AddUniverseModalProps {
  onClose: () => void;
}

const AddUniverseModal: Component<AddUniverseModalProps> = (props) => {
  const { addedUniverses, addUniverseToPrefs } = useCollections();
  const [search, setSearch] = createSignal("");

  // Already-added universe IDs
  const addedIds = createMemo(() => new Set(addedUniverses().map((u) => u.id)));

  // Filter curated collections by search
  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return CURATED_COLLECTIONS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  const handleAdd = (col: Collection) => {
    addUniverseToPrefs(col.id);
  };

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[999998] flex items-end sm:items-center justify-center"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Add Universe"
      >
        <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)" }} />

        <div
          class="w-full max-w-xl lg:max-w-[600px] relative z-10 max-h-[85vh] flex flex-col"
          style={{
            background: "var(--surface, #111)",
            "border-radius": "var(--radius-xl, 1rem) var(--radius-xl, 1rem) 0 0",
            "border-top": "1px solid var(--hairline)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            class="flex items-center justify-between"
            style={{ padding: "var(--sp-4)", "border-bottom": "1px solid var(--hairline)" }}
          >
            <h2 class="type-card-title" style={{ "font-size": "1rem" }}>
              Add Universe
            </h2>
            <button
              type="button"
              class="btn-ghost"
              onClick={props.onClose}
              aria-label="Close"
              style={{ padding: "var(--sp-2)" }}
            >
              <span class="material-symbols-outlined" style={{"font-size":"20px"}} aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: "var(--sp-3) var(--sp-4)" }}>
            <input
              type="text"
              class="collections-create-input"
              placeholder="Search universes…"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              aria-label="Search universes"
              style={{ width: "100%" }}
            />
          </div>

          {/* Universe list */}
          <div class="flex-1 overflow-y-auto" style={{ padding: "0 var(--sp-4) var(--sp-4)" }}>
            <Show
              when={filtered().length > 0}
              fallback={
                <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
                  No universes found.
                </p>
              }
            >
              <div class="flex flex-col gap-2">
                <For each={filtered()}>
                  {(col) => (
                    <div
                      class="flex items-center gap-3"
                      style={{
                        padding: "var(--sp-3)",
                        "border-radius": "var(--radius-md)",
                        background: "var(--tier-2, #1a1a24)",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      {/* Backdrop thumbnail */}
                      <Show when={col.backdrop_path}>
                        <img
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                          src={tmdbImage(col.backdrop_path, "w92")}
                          style={{
                            width: "48px",
                            height: "32px",
                            "object-fit": "cover",
                            "border-radius": "4px",
                            "flex-shrink": "0",
                          }}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          aria-hidden="true"
                        />
                      </Show>

                      {/* Name + description */}
                      <div class="flex-1 min-width-0" style={{ "min-width": "0" }}>
                        <p class="type-card-title" style={{ margin: "0", "font-size": "0.875rem" }}>
                          {col.name}
                        </p>
                        <Show when={col.description}>
                          <p
                            class="type-subtitle"
                            style={{
                              margin: "0",
                              "font-size": "0.6875rem",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                              "white-space": "nowrap",
                            }}
                          >
                            {col.description}
                          </p>
                        </Show>
                      </div>

                      {/* Add / Added button */}
                      <Show
                        when={!addedIds().has(col.id)}
                        fallback={
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "20px", color: "var(--p)", "flex-shrink": "0" }}
                            aria-label="Added"
                          >
                            check_circle
                          </span>
                        }
                      >
                        <button
                          type="button"
                          class="btn-primary"
                          onClick={() => handleAdd(col)}
                          aria-label={`Add ${col.name}`}
                          style={{
                            "font-size": "0.625rem",
                            padding: "var(--sp-2) var(--sp-3)",
                            "flex-shrink": "0",
                          }}
                        >
                          <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">
                            add
                          </span>
                          Add
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AddUniverseModal;
