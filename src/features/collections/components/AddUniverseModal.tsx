// src/features/collections/components/AddUniverseModal.tsx
import { For, Show, createSignal, createMemo, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import { useCuratedUniverses } from "../hooks/useCuratedUniverses";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * AddUniverseModal — a bottom-sheet modal for browsing and adding
 * developer-curated universes.
 *
 * ARCHITECTURE (Database Bible):
 *   This modal is the ONLY entry point for adding curated universes.
 *   It lists universes from the `curated_universes` table via Supabase —
 *   NO hardcoded lists, NO constants, NO franchiseHierarchy.
 *
 *   - If the admin has created zero universes → dialog shows empty state.
 *   - If the admin creates one → it immediately appears.
 *   - If the admin removes one → it disappears automatically.
 *   - No frontend changes are required when universes change.
 *
 * Flow:
 *   User taps "Add Universe" → this modal opens → fetches ALL
 *   curated_universes from Supabase → user taps Add on a universe →
 *   addUniverseToPrefs() creates a user_universe_subscriptions row →
 *   the universe appears on the Collections page.
 */
interface AddUniverseModalProps {
  onClose: () => void;
}

const AddUniverseModal: Component<AddUniverseModalProps> = (props) => {
  const { addUniverseToPrefs } = useCollections();
  const { allCuratedUniverses, subscribedIds, loading, refresh } = useCuratedUniverses();
  const [search, setSearch] = createSignal("");
  const [adding, setAdding] = createSignal<string | null>(null);

  // Filter curated collections by search.
  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const all = allCuratedUniverses();
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  });

  const handleAdd = async (col: Collection) => {
    setAdding(col.id);
    await addUniverseToPrefs(col.id);
    await refresh();
    setAdding(null);
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

          {/* Universe list — from Supabase curated_universes */}
          <div class="flex-1 overflow-y-auto" style={{ padding: "0 var(--sp-4) var(--sp-4)" }}>
            <Show
              when={!loading()}
              fallback={
                <div style={{ padding: "var(--sp-6)", "text-align": "center" }}>
                  <div class="skeleton-base" style={{ width: "60%", height: "3rem", margin: "0 auto var(--sp-3)" }} />
                  <div class="skeleton-base" style={{ width: "80%", height: "3rem", margin: "0 auto var(--sp-3)" }} />
                  <div class="skeleton-base" style={{ width: "50%", height: "3rem", margin: "0 auto" }} />
                </div>
              }
            >
              <Show
                when={filtered().length > 0}
                fallback={
                  <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
                    No universes available. The admin hasn't created any curated universes yet.
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
                        <div class="flex-1" style={{ "min-width": "0" }}>
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
                          when={!subscribedIds().has(col.id)}
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
                            disabled={adding() === col.id}
                            aria-label={`Add ${col.name}`}
                            style={{
                              "font-size": "0.625rem",
                              padding: "var(--sp-2) var(--sp-3)",
                              "flex-shrink": "0",
                            }}
                          >
                            <Show
                              when={adding() !== col.id}
                              fallback={
                                <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">
                                  hourglass_top
                                </span>
                              }
                            >
                              <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">
                                add
                              </span>
                              Add
                            </Show>
                          </button>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AddUniverseModal;
