// src/features/admin/collectionEditor/EntryRow.tsx
//
// CineLog V2 — Admin: Collection Entry Row
// ---------------------------------------------------------------------
// A single entry in the admin collection editor.
//
// Simplified (v3): the sort indices are NO LONGER editable here.
// Phase 4 Task 6 dropped the legacy release_position / story_position /
// timeline_position DB columns; only `position` remains (admin's primary
// manual order, edited via drag-and-drop on the list, not per-row).
//   - Release sort uses TMDB release_date (auto)
//   - Franchise sort uses title-derived franchise (auto)
//   - Storyline sort uses the single `incident_year` field below
//
// Per row:
//   - Poster thumbnail + title + year + TMDB id
//   - Inline editor for `incident_year` (the in-universe year the
//     movie takes place — e.g. 1943 for Captain America: The First
//     Avenger) and an admin-only note
//   - Edit / Save / Cancel toggle
//   - Delete button
//
// The row is "controlled" — it calls back up to the parent for any
// mutation. Local state is used only for the edit-form fields.

import { Show, For, createSignal, type Component } from "solid-js";
import { posterUrl, releaseYear, type AdminEntry } from "./types";

interface Props {
  entry: AdminEntry;
  /** Position in the current sort (1-based) — used only for display. */
  displayIndex: number;
  /** When sort=storyline, this is the incident_year (or "—" if unset).
   *  When sort=release, this is the release year. When sort=franchise,
   *  this is the index within the franchise group. */
  leftBadge: string;
  onSave: (entry: AdminEntry, updates: Partial<AdminEntry>) => Promise<void>;
  onDelete: (entry: AdminEntry) => Promise<void>;
}

const EntryRow: Component<Props> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  // Edit-form state (only populated when editing starts)
  const [fIncidentYear, setFIncidentYear] = createSignal<string>("");
  const [fNote, setFNote] = createSignal("");
  // Phase 9 Chunk 5a: rich entry fields
  const [fSubUniverse, setFSubUniverse] = createSignal("");
  const [fViewingOrder, setFViewingOrder] = createSignal<string>("");
  const [fStoryNote, setFStoryNote] = createSignal("");
  const [fKeyEvents, setFKeyEvents] = createSignal("");
  const [fIsEntryPoint, setFIsEntryPoint] = createSignal(false);

  const startEdit = () => {
    setFIncidentYear(
      props.entry.incident_year !== null
        ? String(props.entry.incident_year)
        : ""
    );
    setFNote(props.entry.note ?? "");
    setFSubUniverse(props.entry.sub_universe ?? "main");
    setFViewingOrder(
      props.entry.viewing_order !== null
        ? String(props.entry.viewing_order)
        : ""
    );
    setFStoryNote(props.entry.story_note ?? "");
    setFKeyEvents((props.entry.key_events ?? []).join(", "));
    setFIsEntryPoint(props.entry.is_entry_point === true);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Parse incident_year — empty string means "clear" (null).
      const raw = fIncidentYear().trim();
      let incidentYear: number | null = null;
      if (raw) {
        const n = parseInt(raw, 10);
        incidentYear = Number.isFinite(n) ? n : null;
      }
      // Parse viewing_order — empty string means "0" (default).
      const voRaw = fViewingOrder().trim();
      let viewingOrder: number | null = null;
      if (voRaw) {
        const n = parseInt(voRaw, 10);
        viewingOrder = Number.isFinite(n) ? n : null;
      }
      // Parse key_events — comma-separated string → string[].
      const keyEvents = fKeyEvents()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await props.onSave(props.entry, {
        incident_year: incidentYear,
        note: fNote().trim() || null,
        sub_universe: fSubUniverse().trim() || "main",
        viewing_order: viewingOrder ?? 0,
        story_note: fStoryNote().trim() || null,
        key_events: keyEvents,
        is_entry_point: fIsEntryPoint()
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `Remove "${props.entry.title ?? `TMDB ${props.entry.tmdb_id}`}" from this universe?`
      )
    )
      return;
    setDeleting(true);
    try {
      await props.onDelete(props.entry);
    } finally {
      setDeleting(false);
    }
  };

  const numInputStyle = {
    width: "100px",
    padding: "var(--sp-1) var(--sp-2)",
    background: "var(--tier-3, rgba(255,255,255,0.04))",
    border: "1px solid var(--hairline)",
    "border-radius": "var(--radius-sm)",
    color: "var(--text)",
    "font-size": "0.75rem",
    "text-align": "center",
    "font-family": "monospace"
  } as const;

  const labelStyle = {
    "font-size": "0.7rem",
    color: "var(--text-muted)",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    "margin-bottom": "2px"
  } as const;

  return (
    <div
      role="listitem"
      style={{
        display: "flex",
        gap: "var(--sp-3)",
        padding: "var(--sp-3)",
        "border-radius": "var(--radius-md)",
        background: "var(--tier-2, rgba(255,255,255,0.02))",
        border: "1px solid var(--hairline)",
        "align-items": "flex-start",
        transition: "background 0.1s ease, opacity 0.1s ease"
      }}
    >
      {/* Left badge — incident_year (storyline), release year (release),
          or index within group (franchise). Visual confirmation of where
          this entry sits in the active sort. */}
      <div
        style={{
          "flex-shrink": 0,
          "min-width": "44px",
          "padding-top": "var(--sp-2)",
          "text-align": "center"
        }}
      >
        <div
          style={{
            "font-size": "0.65rem",
            color: "var(--text-muted)",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
            "margin-bottom": "2px"
          }}
        >
          {props.leftBadge === "—" ? "—" : ""}
        </div>
        <div
          style={{
            "font-family": "'Bebas Neue', cursive",
            "font-size": "1.05rem",
            color: "var(--text-strong)",
            "line-height": "1"
          }}
        >
          {props.leftBadge}
        </div>
      </div>

      {/* Poster thumbnail */}
      <div
        style={{
          width: "48px",
          height: "72px",
          "flex-shrink": 0,
          "border-radius": "var(--radius-sm)",
          overflow: "hidden",
          background: "var(--tier-3, rgba(255,255,255,0.04))",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "font-size": "0.8rem",
          color: "var(--text-muted)"
        }}
      >
        <Show when={props.entry.poster_path} fallback="🎬">
          <img
            src={posterUrl(props.entry.poster_path, "w92")}
            alt=""
            style={{ width: "100%", height: "100%", "object-fit": "cover" }}
            loading="lazy"
          />
        </Show>
      </div>

      {/* Title + incident year */}
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            "font-weight": "600",
            "font-size": "0.9rem",
            color: "var(--text)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis"
          }}
        >
          {props.entry.title ?? `TMDB #${props.entry.tmdb_id}`}
        </div>
        <div
          style={{
            "font-size": "0.7rem",
            color: "var(--text-muted)",
            "margin-top": "2px"
          }}
        >
          <span
            style={{
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "font-weight": "600",
              "margin-right": "var(--sp-2)"
            }}
          >
            {props.entry.media_type}
          </span>
          <Show when={releaseYear(props.entry.release_date)}>
            <span style={{ "margin-right": "var(--sp-2)" }}>
              {releaseYear(props.entry.release_date)}
            </span>
          </Show>
          <span style={{ opacity: 0.7 }}>TMDB {props.entry.tmdb_id}</span>
        </div>

        {/* Display / edit incident_year + note + Phase 9 Chunk 5a rich fields */}
        <Show
          when={editing()}
          fallback={
            <div
              style={{
                display: "flex",
                gap: "var(--sp-2) var(--sp-3)",
                "margin-top": "var(--sp-2)",
                "font-size": "0.7rem",
                color: "var(--text-muted)",
                "flex-wrap": "wrap",
                "align-items": "center"
              }}
            >
              <span>
                Incident year:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {props.entry.incident_year !== null
                    ? props.entry.incident_year
                    : "—"}
                </strong>
              </span>
              <Show when={props.entry.sub_universe && props.entry.sub_universe !== "main"}>
                <span
                  style={{
                    padding: "1px 6px",
                    "border-radius": "3px",
                    background:
                      "color-mix(in srgb, var(--p, #7c3aed) 18%, transparent)",
                    color: "var(--text)",
                    "font-weight": 600
                  }}
                >
                  {props.entry.sub_universe}
                </span>
              </Show>
              <Show when={props.entry.is_entry_point}>
                <span
                  style={{
                    padding: "1px 6px",
                    "border-radius": "3px",
                    background: "rgba(34, 197, 94, 0.2)",
                    color: "rgb(134, 239, 172)",
                    "font-weight": 600
                  }}
                  title="Recommended starting point for new viewers"
                >
                  ★ Entry Point
                </span>
              </Show>
              <Show when={props.entry.viewing_order !== null && props.entry.viewing_order !== 0}>
                <span>Order: {props.entry.viewing_order}</span>
              </Show>
              <Show when={props.entry.note}>
                <span style={{ "font-style": "italic", opacity: 0.85 }}>
                  📝 {props.entry.note}
                </span>
              </Show>
              <Show when={props.entry.story_note}>
                <span style={{ "font-style": "italic", opacity: 0.85 }}>
                  📖 {props.entry.story_note}
                </span>
              </Show>
              <Show when={(props.entry.key_events ?? []).length > 0}>
                <span style={{ display: "inline-flex", gap: "4px", "flex-wrap": "wrap" }}>
                  <For each={(props.entry.key_events ?? []).slice(0, 3)}>
                    {(ev) => (
                      <span
                        style={{
                          padding: "1px 6px",
                          "border-radius": "3px",
                          background: "var(--tier-3, rgba(255,255,255,0.04))",
                          border: "1px solid var(--hairline)"
                        }}
                      >
                        {ev}
                      </span>
                    )}
                  </For>
                  <Show when={(props.entry.key_events ?? []).length > 3}>
                    <span style={{ opacity: 0.7 }}>
                      +{(props.entry.key_events ?? []).length - 3} more
                    </span>
                  </Show>
                </span>
              </Show>
            </div>
          }
        >
          <div
            style={{
              display: "grid",
              "grid-template-columns": "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--sp-2)",
              "margin-top": "var(--sp-2)"
            }}
          >
            <div>
              <div style={labelStyle}>Incident year</div>
              <input
                type="number"
                value={fIncidentYear()}
                onInput={(e) => setFIncidentYear(e.currentTarget.value)}
                placeholder="e.g. 1943"
                style={numInputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Viewing order</div>
              <input
                type="number"
                value={fViewingOrder()}
                onInput={(e) => setFViewingOrder(e.currentTarget.value)}
                placeholder="0"
                style={numInputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Sub-universe</div>
              <input
                type="text"
                value={fSubUniverse()}
                onInput={(e) => setFSubUniverse(e.currentTarget.value)}
                placeholder="main"
                style={{
                  width: "100%",
                  padding: "var(--sp-1) var(--sp-2)",
                  background: "var(--tier-3, rgba(255,255,255,0.04))",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-sm)",
                  color: "var(--text)",
                  "font-size": "0.75rem",
                  "box-sizing": "border-box"
                }}
              />
            </div>
            <div style={{ display: "flex", "align-items": "flex-end", gap: "var(--sp-2)" }}>
              <label
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "4px",
                  "font-size": "0.7rem",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  "padding-bottom": "4px"
                }}
              >
                <input
                  type="checkbox"
                  checked={fIsEntryPoint()}
                  onChange={(e) => setFIsEntryPoint(e.currentTarget.checked)}
                />
                Entry point
              </label>
            </div>
            <div style={{ "grid-column": "1 / -1" }}>
              <div style={labelStyle}>Story note (where this fits in the story)</div>
              <textarea
                value={fStoryNote()}
                onInput={(e) => setFStoryNote(e.currentTarget.value)}
                placeholder="e.g. Takes place after Civil War, before Infinity War. Black Widow's origin story."
                style={{
                  width: "100%",
                  "min-height": "50px",
                  resize: "vertical",
                  padding: "var(--sp-1) var(--sp-2)",
                  background: "var(--tier-3, rgba(255,255,255,0.04))",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-sm)",
                  color: "var(--text)",
                  "font-size": "0.75rem",
                  "box-sizing": "border-box",
                  "font-family": "inherit"
                }}
              />
            </div>
            <div style={{ "grid-column": "1 / -1" }}>
              <div style={labelStyle}>Key events (comma-separated)</div>
              <input
                type="text"
                value={fKeyEvents()}
                onInput={(e) => setFKeyEvents(e.currentTarget.value)}
                placeholder="First Infinity Stone, Nick Fury introduced, Post-credit: Avengers initiative"
                style={{
                  width: "100%",
                  padding: "var(--sp-1) var(--sp-2)",
                  background: "var(--tier-3, rgba(255,255,255,0.04))",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-sm)",
                  color: "var(--text)",
                  "font-size": "0.75rem",
                  "box-sizing": "border-box"
                }}
              />
            </div>
            <div style={{ "grid-column": "1 / -1" }}>
              <div style={labelStyle}>Note (admin only)</div>
              <input
                type="text"
                value={fNote()}
                onInput={(e) => setFNote(e.currentTarget.value)}
                placeholder="Internal note"
                style={{
                  width: "100%",
                  padding: "var(--sp-1) var(--sp-2)",
                  background: "var(--tier-3, rgba(255,255,255,0.04))",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-sm)",
                  color: "var(--text)",
                  "font-size": "0.75rem",
                  "box-sizing": "border-box"
                }}
              />
            </div>
          </div>
          <p
            style={{
              "font-size": "0.65rem",
              color: "var(--text-dim)",
              "margin-top": "var(--sp-2)"
            }}
          >
            The incident year is the in-universe year the movie takes place
            (e.g. 1943 for Captain America: The First Avenger, 1995 for Captain
            Marvel). It drives the Storyline sort — lower years appear first.
            Leave empty if unknown.
          </p>
        </Show>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "var(--sp-1)",
          "flex-shrink": 0
        }}
      >
        <Show
          when={editing()}
          fallback={
            <button
              type="button"
              onClick={startEdit}
              title="Edit incident year + note"
              style={iconBtnStyle}
            >
              ✏️
            </button>
          }
        >
          <button
            type="button"
            onClick={save}
            disabled={saving()}
            title="Save"
            style={iconBtnSuccessStyle}
          >
            {saving() ? "…" : "✓"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving()}
            title="Cancel"
            style={iconBtnStyle}
          >
            ✕
          </button>
        </Show>
        <button
          type="button"
          onClick={remove}
          disabled={deleting() || saving()}
          title="Delete entry"
          style={iconBtnDangerStyle}
        >
          {deleting() ? "…" : "🗑️"}
        </button>
      </div>
    </div>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const iconBtnStyle = {
  background: "var(--tier-3, rgba(255,255,255,0.04))",
  border: "1px solid var(--hairline)",
  width: "30px",
  height: "30px",
  "border-radius": "var(--radius-sm)",
  cursor: "pointer",
  "font-size": "0.85rem",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  color: "var(--text)"
} as const;

const iconBtnSuccessStyle = {
  ...iconBtnStyle,
  "border-color": "rgba(34, 197, 94, 0.5)",
  color: "rgb(34, 197, 94)"
} as const;

const iconBtnDangerStyle = {
  ...iconBtnStyle,
  "border-color": "rgba(239, 68, 68, 0.4)",
  color: "rgb(252, 165, 165)"
} as const;

export default EntryRow;
