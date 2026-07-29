// src/features/collections/components/AddUniverseModal.tsx
import { For, Show, createSignal, createMemo, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import { useCuratedUniverses } from "../hooks/useCuratedUniverses";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * AddUniverseModal — full-screen modal for browsing and subscribing
 * to developer-curated universes.
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
 *   curated_universes from Supabase → user taps Subscribe on a
 *   universe → addUniverseToPrefs() creates a user_universe_subscriptions
 *   row → the universe appears on the Collections page.
 *
 * Redesign (v3): replaced the dense bottom-sheet list with a full-
 * screen grid that mirrors the visual language of the Collections
 * grid. Each universe card shows a tall poster, name, description
 * preview, and a large Subscribe / Subscribed button. A search bar
 * at the top filters by name.
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
    return all.filter((c) => {
      const name = c.name.toLowerCase();
      const desc = (c.description ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
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
        class="fixed inset-0 z-[999998] flex flex-col"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Browse curated universes"
      >
        <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.85)", "backdrop-filter": "blur(12px)", "-webkit-backdrop-filter": "blur(12px)" }} />

        <div
          class="relative z-10 w-full flex flex-col flex-1 modal-sheet-enter"
          style={{
            background: "var(--glass-bg-strong, rgba(20, 22, 30, 0.92))",
            "backdrop-filter": "blur(28px)",
            "-webkit-backdrop-filter": "blur(28px)",
            "max-width": "1100px",
            margin: "0 auto",
            "max-height": "100vh",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — sticky, glass */}
          <div
            class="flex items-center justify-between flex-shrink-0"
            style={{
              padding: "var(--sp-4) var(--sp-5)",
              "border-bottom": "1px solid var(--hairline)",
              "background": "var(--glass-bg-strong, rgba(20, 22, 30, 0.92))",
              "position": "sticky",
              "top": "0",
              "z-index": "10",
            }}
          >
            <div>
              <h2 class="type-headline" style={{ "font-size": "1.25rem", margin: "0", "color": "var(--text-strong, #fff)" }}>
                Curated Universes
              </h2>
              <p style={{ "font-size": "0.75rem", color: "var(--text-dim)", margin: "2px 0 0" }}>
                Subscribe to admin-curated cinematic timelines.
              </p>
            </div>
            <button
              type="button"
              class="focus-ring"
              onClick={props.onClose}
              aria-label="Close"
              style={{
                width: "40px",
                height: "40px",
                "border-radius": "999px",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--hairline)",
                color: "var(--text-soft)",
              }}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">close</span>
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: "var(--sp-4) var(--sp-5) var(--sp-2)" }} class="flex-shrink-0">
            <div
              class="flex items-center gap-2"
              style={{
                padding: "10px 14px",
                "border-radius": "999px",
                background: "var(--tier-2, rgba(255,255,255,0.04))",
                border: "1px solid var(--hairline)",
              }}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--text-dim)" }} aria-hidden="true">search</span>
              <input
                type="text"
                placeholder="Search universes by name or description…"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                aria-label="Search universes"
                style={{
                  flex: "1",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-strong, #fff)",
                  "font-family": "'Outfit', sans-serif",
                  "font-size": "0.8125rem",
                }}
              />
              <Show when={search()}>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    padding: "0",
                  }}
                >
                  <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">close</span>
                </button>
              </Show>
            </div>
          </div>

          {/* Universe grid */}
          <div class="flex-1 overflow-y-auto" style={{ padding: "var(--sp-3) var(--sp-5) var(--sp-6)", "overscroll-behavior": "contain" }}>
            <Show
              when={!loading()}
              fallback={
                <div class="collections-folder-grid">
                  <For each={[0, 1, 2, 3]}>
                    {() => (
                      <div class="collection-card" style={{ "min-height": "260px" }}>
                        <div class="skeleton-base" style={{ width: "100%", height: "180px" }} />
                        <div style={{ padding: "var(--sp-3)" }}>
                          <div class="skeleton-base" style={{ width: "70%", height: "0.875rem", margin: "0 0 var(--sp-2)" }} />
                          <div class="skeleton-base" style={{ width: "40%", height: "0.625rem" }} />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              <Show
                when={filtered().length > 0}
                fallback={
                  <div class="collections-empty-folders" style={{ "padding": "var(--sp-12) var(--sp-4)" }}>
                    <div class="collections-empty-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "40px", color: "var(--p)" }}
                        aria-hidden="true"
                      >
                        public
                      </span>
                    </div>
                    <p class="collections-empty-title">No universes available</p>
                    <p class="collections-empty-desc">
                      The admin hasn't created any curated universes yet. Check back later.
                    </p>
                  </div>
                }
              >
                <div class="collections-folder-grid">
                  <For each={filtered()}>
                    {(col) => (
                      <UniverseSubscribeCard
                        col={col}
                        subscribed={subscribedIds().has(col.id)}
                        adding={adding() === col.id}
                        onSubscribe={() => handleAdd(col)}
                      />
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

interface UniverseSubscribeCardProps {
  col: Collection;
  subscribed: boolean;
  adding: boolean;
  onSubscribe: () => void;
}

function UniverseSubscribeCard(props: UniverseSubscribeCardProps) {
  const cover = () => {
    const p = props.col.poster_path ?? props.col.backdrop_path;
    if (!p) return null;
    return p.startsWith("http") ? p : tmdbImage(p, "w500");
  };

  const entryCount = () => (props.col.entries ?? []).length;

  return (
    <div
      class="collection-card"
      style={{ "min-height": "280px", "display": "flex", "flex-direction": "column" }}
    >
      <div class="collection-card-collage-area" style={{ "aspect-ratio": "3/4" }}>
        <Show
          when={cover()}
          fallback={
            <div class="collection-card-empty-art" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "36px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                public
              </span>
            </div>
          }
        >
          <img
            src={cover()!}
            class="collage-img"
            style={{ width: "100%", height: "100%", "object-fit": "cover" }}
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </Show>

        <div class="collection-card-badges">
          <span class="collection-badge" title="Curated Universe">
            <span class="material-symbols-outlined" style={{ "font-size": "10px", color: "var(--p)" }} aria-hidden="true">public</span>
          </span>
        </div>
      </div>

      <div class="collection-card-info" style={{ flex: "1", "display": "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
        <p class="collection-card-name">{props.col.name}</p>

        <Show when={props.col.description}>
          <p class="collection-card-desc" style={{ "-webkit-line-clamp": "3", "max-height": "3.6em" }}>
            {props.col.description}
          </p>
        </Show>

        <div class="collection-card-stats">
          <span class="collection-card-stats-text">
            {entryCount()} {entryCount() !== 1 ? "titles" : "title"}
          </span>
        </div>

        <Show
          when={!props.subscribed}
          fallback={
            <button
              type="button"
              class="focus-ring"
              disabled
              style={{
                "margin-top": "auto",
                padding: "8px 12px",
                "border-radius": "999px",
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.4)",
                color: "#86efac",
                "font-family": "'Outfit', sans-serif",
                "font-size": "0.75rem",
                "font-weight": "600",
                cursor: "default",
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                gap: "6px",
              }}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">check_circle</span>
              Subscribed
            </button>
          }
        >
          <button
            type="button"
            class="btn-primary focus-ring"
            onClick={(e) => {
              e.stopPropagation();
              props.onSubscribe();
            }}
            disabled={props.adding}
            aria-label={`Subscribe to ${props.col.name}`}
            style={{
              "margin-top": "auto",
              "font-size": "0.75rem",
              padding: "8px 14px",
              "border-radius": "999px",
              display: "inline-flex",
              "align-items": "center",
              "justify-content": "center",
              gap: "6px",
            }}
          >
            <Show
              when={!props.adding}
              fallback={
                <>
                  <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">hourglass_top</span>
                  Subscribing…
                </>
              }
            >
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">add</span>
              Subscribe
            </Show>
          </button>
        </Show>
      </div>
    </div>
  );
}

export default AddUniverseModal;
