// src/features/collections/components/RichUniverseHub.tsx
//
// CineLog V2 — Rich Universe Hub (Phase 9 Chunk 5a)
// ---------------------------------------------------------------------
// Renders the immersive, Disney+ Marvel-hub-style universe experience
// when a curated universe has rich admin-curated data:
//
//   • Lore paragraph
//   • Stats row (Total Entries, Phases count, Sub-universes count)
//   • Viewing Order Guide callout (admin-written)
//   • "Where to start" callout if any entry has is_entry_point = true
//   • Custom Viewing Order selector (dropdown that reorders the grid)
//   • Sub-universe filter chips
//   • Enhanced entry grid with:
//     - Story Note tooltip
//     - Key Events chips
//     - Entry Point badge
//     - Sub-universe badge
//     - Phase badge
//     - Incident year
//
// Mobile-first responsive: all grids stack to 1 column on mobile.
// This component is conditionally rendered by CollectionDetailPage
// ONLY when the universe has Phase 9 Chunk 5a data. Universes without
// that data fall through to the existing TimelineEngine.

import {
  For,
  Show,
  createSignal,
  createMemo,
  type Component
} from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type {
  Collection,
  CollectionEntry,
  UniverseViewingOrder
} from "~/shared/types";

interface RichUniverseHubProps {
  collection: Collection;
}

const FRANCHISE_TYPE_LABELS: Record<string, string> = {
  cinematic_universe: "Cinematic Universe",
  franchise: "Franchise",
  anthology: "Anthology",
  shared_universe: "Shared Universe",
  multiverse: "Multiverse"
};

const RichUniverseHub: Component<RichUniverseHubProps> = (props) => {
  // ─── State: custom viewing order + sub-universe filter ────────────
  const [selectedOrderId, setSelectedOrderId] = createSignal<string | null>(
    null
  );
  const [selectedSubUniverse, setSelectedSubUniverse] = createSignal<string>(
    "all"
  );

  // ─── Derived data ─────────────────────────────────────────────────
  const entries = () => props.collection.entries ?? [];

  const customOrders = (): UniverseViewingOrder[] =>
    props.collection.customViewingOrders ?? [];

  // Default order = the order with isDefault=true, else the first one.
  const defaultOrder = createMemo(() => {
    const orders = customOrders();
    if (orders.length === 0) return null;
    return orders.find((o) => o.isDefault) ?? orders[0];
  });

  // Initialize selectedOrderId once the orders load.
  // (createEffect would re-fire; we just want a one-time init.)
  // Use a memo that has the side effect of seeding the signal.
  const initOnce = createMemo(() => {
    const d = defaultOrder();
    if (d && !selectedOrderId()) {
      setSelectedOrderId(d.id);
    }
    return d?.id ?? null;
  });
  // touch the memo so it runs.
  void initOnce();

  // Map entry rowId → entry, for viewing-order lookups.
  const entriesByRowId = createMemo(() => {
    const map = new Map<string, CollectionEntry>();
    for (const e of entries()) {
      if (e.rowId) map.set(e.rowId, e);
    }
    return map;
  });

  // Unique sub-universes from entries (excluding "main" if it's the
  // only one — keep "main" if there are multiple sub-universes).
  const subUniverses = createMemo(() => {
    const set = new Set<string>();
    for (const e of entries()) {
      const su = e.subUniverse ?? "main";
      if (su) set.add(su);
    }
    return Array.from(set).sort();
  });

  const hasMultipleSubUniverses = () => subUniverses().length > 1;

  // ─── Active ordering ─────────────────────────────────────────────
  // If a custom viewing order is selected, reorder entries to match.
  // Otherwise, fall back to the default order (position).
  const orderedEntries = createMemo(() => {
    const all = entries();
    const orderId = selectedOrderId();
    if (!orderId) return all;

    const order = customOrders().find((o) => o.id === orderId);
    if (!order || order.entryIds.length === 0) return all;

    const byRowId = entriesByRowId();
    const ordered: CollectionEntry[] = [];
    const seen = new Set<string>();

    for (const rowId of order.entryIds) {
      const e = byRowId.get(rowId);
      if (e) {
        ordered.push(e);
        if (e.rowId) seen.add(e.rowId);
        else seen.add(e.id);
      }
    }
    // Append any entries not in the order (e.g. added after the order
    // was last edited) so nothing is silently hidden.
    for (const e of all) {
      const key = e.rowId ?? e.id;
      if (!seen.has(key)) ordered.push(e);
    }
    return ordered;
  });

  // Apply sub-universe filter.
  const visibleEntries = createMemo(() => {
    const su = selectedSubUniverse();
    if (su === "all") return orderedEntries();
    return orderedEntries().filter(
      (e) => (e.subUniverse ?? "main") === su
    );
  });

  // ─── Stats ────────────────────────────────────────────────────────
  const phaseCount = () => (props.collection.phases ?? []).length;
  const totalEntries = () =>
    props.collection.totalEntries ?? entries().length;
  const entryPoints = () => entries().filter((e) => e.isEntryPoint);

  // ─── Helpers ─────────────────────────────────────────────────────
  const accent = () =>
    props.collection.colorTheme ??
    props.collection.accentColor ??
    "var(--p, #7c3aed)";

  return (
    <div class="rich-universe-hub">
      {/* ─── Lore + Stats + Franchise Type ──────────────────────── */}
      <Show when={props.collection.lore}>
        <div
          style={{
            "margin-top": "var(--sp-4)",
            padding: "var(--sp-4) var(--sp-5)",
            "border-radius": "var(--radius-md)",
            background: `linear-gradient(135deg, color-mix(in srgb, ${accent()} 10%, transparent), transparent 70%)`,
            border: `1px solid color-mix(in srgb, ${accent()} 25%, transparent)`,
            "backdrop-filter": "blur(8px)"
          }}
        >
          <Show when={props.collection.franchiseType}>
            <span
              style={{
                display: "inline-block",
                "font-size": "0.65rem",
                "text-transform": "uppercase",
                "letter-spacing": "0.1em",
                "font-weight": "700",
                padding: "3px 8px",
                "border-radius": "4px",
                "margin-bottom": "var(--sp-2)",
                background: `color-mix(in srgb, ${accent()} 20%, transparent)`,
                color: accent()
              }}
            >
              {FRANCHISE_TYPE_LABELS[props.collection.franchiseType!] ??
                props.collection.franchiseType}
            </span>
          </Show>
          <p
            style={{
              margin: 0,
              "font-size": "0.9rem",
              "line-height": "1.7",
              color: "var(--text)",
              "max-width": "70ch"
            }}
          >
            {props.collection.lore}
          </p>
        </div>
      </Show>

      {/* ─── Stats row ──────────────────────────────────────────── */}
      <div
        style={{
          "margin-top": "var(--sp-3)",
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(110px, 1fr))",
          gap: "var(--sp-2)"
        }}
      >
        <StatBox
          label="Entries"
          value={String(totalEntries())}
          icon="movie"
        />
        <StatBox
          label="Phases"
          value={String(phaseCount())}
          icon="layers"
        />
        <Show when={hasMultipleSubUniverses()}>
          <StatBox
            label="Sub-universes"
            value={String(subUniverses().length)}
            icon="hub"
          />
        </Show>
        <StatBox
          label="Viewing orders"
          value={String(customOrders().length)}
          icon="format_list_numbered"
        />
      </div>

      {/* ─── Viewing Order Guide callout ───────────────────────── */}
      <Show when={props.collection.viewingOrderGuide}>
        <div
          style={{
            "margin-top": "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
            "border-radius": "var(--radius-md)",
            background: `color-mix(in srgb, ${accent()} 6%, var(--glass-bg, rgba(255,255,255,0.02)))`,
            border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--hairline))`,
            "border-left": `3px solid ${accent()}`
          }}
        >
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--sp-2)",
              "font-size": "0.7rem",
              "text-transform": "uppercase",
              "letter-spacing": "0.08em",
              color: "var(--text-muted)",
              "margin-bottom": "var(--sp-1)",
              "font-weight": "600"
            }}
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px", color: accent() }}
              aria-hidden="true"
            >
              auto_stories
            </span>
            Viewing Order Guide
          </div>
          <p
            style={{
              margin: 0,
              "font-size": "0.85rem",
              "line-height": "1.6",
              color: "var(--text)"
            }}
          >
            {props.collection.viewingOrderGuide}
          </p>
        </div>
      </Show>

      {/* ─── "Where to start" callout ──────────────────────────── */}
      <Show when={entryPoints().length > 0}>
        <div
          style={{
            "margin-top": "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
            "border-radius": "var(--radius-md)",
            background: "rgba(34, 197, 94, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.25)",
            "border-left": "3px solid rgb(34, 197, 94)"
          }}
        >
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--sp-2)",
              "font-size": "0.7rem",
              "text-transform": "uppercase",
              "letter-spacing": "0.08em",
              color: "rgb(134, 239, 172)",
              "margin-bottom": "var(--sp-1)",
              "font-weight": "600"
            }}
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px" }}
              aria-hidden="true"
            >
              play_circle
            </span>
            Where to start
          </div>
          <p
            style={{
              margin: 0,
              "font-size": "0.85rem",
              "line-height": "1.6",
              color: "var(--text)"
            }}
          >
            New to this universe? Start with{" "}
            <For each={entryPoints()}>
              {(e, i) => (
                <>
                  <Show when={i() > 0}> · </Show>
                  <strong>{e.title ?? e.name ?? "Unknown"}</strong>
                  <Show when={e.storyNote}>
                    <span style={{ opacity: 0.75 }}> — {e.storyNote}</span>
                  </Show>
                </>
              )}
            </For>
            .
          </p>
        </div>
      </Show>

      {/* ─── Custom Viewing Order Selector + Sub-universe filter ── */}
      <Show when={customOrders().length > 0 || hasMultipleSubUniverses()}>
        <div
          style={{
            "margin-top": "var(--sp-4)",
            display: "flex",
            "flex-wrap": "wrap",
            gap: "var(--sp-3)",
            "align-items": "center",
            "justify-content": "space-between"
          }}
        >
          <Show when={customOrders().length > 0}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-2)",
                "flex-wrap": "wrap"
              }}
            >
              <label
                style={{
                  "font-size": "0.7rem",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.08em",
                  color: "var(--text-muted)",
                  "font-weight": "600"
                }}
              >
                Watch order
              </label>
              <select
                value={selectedOrderId() ?? ""}
                onChange={(e) =>
                  setSelectedOrderId(e.currentTarget.value || null)
                }
                style={{
                  padding: "6px 10px",
                  "border-radius": "var(--radius-sm)",
                  background: "var(--glass-bg, rgba(255,255,255,0.02))",
                  border: "1px solid var(--hairline)",
                  color: "var(--text)",
                  "font-size": "0.8rem",
                  "font-family": "inherit",
                  cursor: "pointer"
                }}
                aria-label="Select viewing order"
              >
                <option value="">Default (admin position)</option>
                <For each={customOrders()}>
                  {(o) => (
                    <option value={o.id}>
                      {o.name}
                      {o.isDefault ? " (default)" : ""}
                    </option>
                  )}
                </For>
              </select>
              <Show
                when={
                  selectedOrderId() &&
                  customOrders().find((o) => o.id === selectedOrderId())
                    ?.description
                }
              >
                <span
                  style={{
                    "font-size": "0.7rem",
                    color: "var(--text-muted)",
                    "font-style": "italic",
                    "max-width": "300px",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap"
                  }}
                  title={
                    customOrders().find((o) => o.id === selectedOrderId())
                      ?.description ?? ""
                  }
                >
                  {
                    customOrders().find((o) => o.id === selectedOrderId())
                      ?.description
                  }
                </span>
              </Show>
            </div>
          </Show>

          <Show when={hasMultipleSubUniverses()}>
            <div
              style={{
                display: "flex",
                gap: "var(--sp-1)",
                "flex-wrap": "wrap",
                "align-items": "center"
              }}
            >
              <span
                style={{
                  "font-size": "0.7rem",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.08em",
                  color: "var(--text-muted)",
                  "margin-right": "var(--sp-1)",
                  "font-weight": "600"
                }}
              >
                Sub-universe
              </span>
              <For each={["all", ...subUniverses()]}>
                {(su) => (
                  <button
                    type="button"
                    onClick={() => setSelectedSubUniverse(su)}
                    style={{
                      padding: "3px 10px",
                      "border-radius": "999px",
                      "font-size": "0.7rem",
                      cursor: "pointer",
                      "font-family": "inherit",
                      border:
                        selectedSubUniverse() === su
                          ? `1px solid ${accent()}`
                          : "1px solid var(--hairline)",
                      background:
                        selectedSubUniverse() === su
                          ? `color-mix(in srgb, ${accent()} 15%, transparent)`
                          : "transparent",
                      color:
                        selectedSubUniverse() === su
                          ? accent()
                          : "var(--text-muted)",
                      "font-weight": selectedSubUniverse() === su ? 600 : 400
                    }}
                  >
                    {su === "all" ? "All" : su}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* ─── Enhanced Entry Grid ──────────────────────────────── */}
      <div
        style={{
          "margin-top": "var(--sp-4)",
          display: "grid",
          "grid-template-columns": "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "var(--sp-3)"
        }}
        class="rich-universe-grid"
      >
        <For each={visibleEntries()}>
          {(entry, i) => (
            <RichEntryCard
              entry={entry}
              index={i() + 1}
              accent={accent()}
              showOrder={selectedOrderId() !== null}
              phaseLabel={phaseLabelForEntry(entry, props.collection)}
            />
          )}
        </For>
      </div>
    </div>
  );
};

// ─── Helper sub-components ──────────────────────────────────────

function StatBox(props: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        padding: "var(--sp-2) var(--sp-3)",
        "border-radius": "var(--radius-md)",
        background: "var(--glass-bg, rgba(255,255,255,0.02))",
        border: "1px solid var(--hairline)",
        display: "flex",
        "flex-direction": "column",
        gap: "2px"
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--sp-1)",
          "font-size": "0.65rem",
          "text-transform": "uppercase",
          "letter-spacing": "0.08em",
          color: "var(--text-muted)",
          "font-weight": "600"
        }}
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "12px" }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
        {props.label}
      </div>
      <strong
        style={{
          "font-size": "1.05rem",
          color: "var(--text)",
          "font-family": "'Bebas Neue', cursive",
          "letter-spacing": "0.02em"
        }}
      >
        {props.value}
      </strong>
    </div>
  );
}

function RichEntryCard(props: {
  entry: CollectionEntry;
  index: number;
  accent: string;
  showOrder: boolean;
  phaseLabel?: string | null;
}) {
  const posterSrc = () => {
    const p = props.entry.poster_path;
    if (!p) return null;
    return tmdbImage(p, "w185");
  };

  const yearLabel = () => {
    if (props.entry.incidentYear) {
      return `${props.entry.incidentYear}`;
    }
    const d = props.entry.release_date ?? props.entry.first_air_date;
    if (d) return d.slice(0, 4);
    return "";
  };

  return (
    <div
      style={{
        position: "relative",
        "border-radius": "var(--radius-md)",
        overflow: "hidden",
        background: "var(--glass-bg, rgba(255,255,255,0.02))",
        border: "1px solid var(--hairline)",
        cursor: "pointer",
        transition: "transform 0.15s ease, box-shadow 0.15s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
      title={props.entry.storyNote ?? props.entry.title}
    >
      {/* Poster */}
      <div
        style={{
          "aspect-ratio": "2/3",
          background: "var(--glass-bg, rgba(255,255,255,0.04))",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <Show
          when={posterSrc()}
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                color: "var(--text-dim)",
                "font-size": "1.5rem"
              }}
            >
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{ "font-size": "32px", opacity: 0.4 }}
              >
                movie
              </span>
            </div>
          }
        >
          <img
            src={posterSrc()!}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              "object-fit": "cover"
            }}
            onError={(e) => {
              e.currentTarget.style.opacity = "0.2";
            }}
          />
        </Show>

        {/* Order position badge */}
        <Show when={props.showOrder}>
          <div
            style={{
              position: "absolute",
              top: "6px",
              left: "6px",
              "font-family": "'Bebas Neue', cursive",
              "font-size": "0.9rem",
              "font-weight": "700",
              color: "white",
              background: `linear-gradient(135deg, ${props.accent}, color-mix(in srgb, ${props.accent} 60%, black))`,
              width: "22px",
              height: "22px",
              "border-radius": "50%",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "box-shadow": "0 1px 3px rgba(0,0,0,0.4)"
            }}
          >
            {props.index}
          </div>
        </Show>

        {/* Entry Point badge */}
        <Show when={props.entry.isEntryPoint}>
          <div
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              background: "rgba(34, 197, 94, 0.9)",
              color: "white",
              "font-size": "0.6rem",
              "font-weight": "700",
              padding: "2px 6px",
              "border-radius": "3px",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em"
            }}
            title="Recommended starting point"
          >
            Start
          </div>
        </Show>
      </div>

      {/* Info */}
      <div style={{ padding: "var(--sp-2)" }}>
        <div
          style={{
            "font-size": "0.8rem",
            "font-weight": "600",
            color: "var(--text)",
            "line-height": "1.3",
            "margin-bottom": "4px",
            display: "-webkit-box",
            "-webkit-line-clamp": "2",
            "-webkit-box-orient": "vertical",
            overflow: "hidden"
          }}
        >
          {props.entry.title ?? props.entry.name ?? "Unknown"}
        </div>

        {/* Year + phase + sub-universe badges */}
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "4px",
            "margin-bottom": "6px"
          }}
        >
          <Show when={yearLabel()}>
            <span
              style={{
                "font-size": "0.65rem",
                color: "var(--text-muted)",
                "font-family": "monospace"
              }}
            >
              {yearLabel()}
            </span>
          </Show>
          <Show when={props.phaseLabel}>
            <span
              style={{
                "font-size": "0.6rem",
                padding: "1px 5px",
                "border-radius": "3px",
                background: `color-mix(in srgb, ${props.accent} 18%, transparent)`,
                color: "var(--text-muted)"
              }}
            >
              {props.phaseLabel}
            </span>
          </Show>
          <Show
            when={
              props.entry.subUniverse &&
              props.entry.subUniverse !== "main"
            }
          >
            <span
              style={{
                "font-size": "0.6rem",
                padding: "1px 5px",
                "border-radius": "3px",
                background: "var(--glass-bg, rgba(255,255,255,0.04))",
                border: "1px solid var(--hairline)",
                color: "var(--text-muted)"
              }}
            >
              {props.entry.subUniverse}
            </span>
          </Show>
        </div>

        {/* Key events chips */}
        <Show when={(props.entry.keyEvents ?? []).length > 0}>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              gap: "3px",
              "margin-bottom": "4px"
            }}
          >
            <For each={(props.entry.keyEvents ?? []).slice(0, 2)}>
              {(ev) => (
                <span
                  style={{
                    "font-size": "0.55rem",
                    padding: "1px 4px",
                    "border-radius": "2px",
                    background: `color-mix(in srgb, ${props.accent} 10%, transparent)`,
                    color: "var(--text-muted)",
                    "max-width": "100%",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap"
                  }}
                  title={ev}
                >
                  {ev}
                </span>
              )}
            </For>
            <Show when={(props.entry.keyEvents ?? []).length > 2}>
              <span
                style={{
                  "font-size": "0.55rem",
                  color: "var(--text-muted)",
                  opacity: 0.7
                }}
                title={(props.entry.keyEvents ?? []).slice(2).join(", ")}
              >
                +{(props.entry.keyEvents ?? []).length - 2}
              </span>
            </Show>
          </div>
        </Show>

        {/* Story note (truncated) */}
        <Show when={props.entry.storyNote}>
          <div
            style={{
              "font-size": "0.65rem",
              color: "var(--text-muted)",
              "line-height": "1.4",
              "font-style": "italic",
              display: "-webkit-box",
              "-webkit-line-clamp": "2",
              "-webkit-box-orient": "vertical",
              overflow: "hidden"
            }}
            title={props.entry.storyNote}
          >
            {props.entry.storyNote}
          </div>
        </Show>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Find the phase label whose `beforeEntryId` matches the entry's rowId.
 * Returns null if no phase is associated with this entry.
 */
function phaseLabelForEntry(
  entry: CollectionEntry,
  collection: Collection
): string | null {
  const phases = collection.phases ?? [];
  if (phases.length === 0) return null;
  if (!entry.rowId) return null;
  // A phase "labels" the entry that comes BEFORE it... actually the
  // phase's `beforeEntryId` means "this phase appears before this entry".
  // So a phase with beforeEntryId === entry.rowId labels THIS entry
  // (i.e. this entry is the first one in that phase).
  const matching = phases.find((p) => p.beforeEntryId === entry.rowId);
  return matching?.label ?? null;
}

export default RichUniverseHub;
