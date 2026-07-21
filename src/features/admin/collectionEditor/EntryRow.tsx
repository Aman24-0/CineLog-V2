// src/features/admin/collectionEditor/EntryRow.tsx
//
// CineLog V2 — Admin: Collection Entry Row
// ---------------------------------------------------------------------
// A single entry in the admin collection editor.
//
// Features per row:
//   - Drag handle to reorder (HTML5 drag API)
//   - Poster thumbnail + title + year + TMDB id
//   - Inline editor for position / release_position / story_position
//     / timeline_position (the four sort indices)
//   - Inline note editor (admin-only note; users never see this)
//   - Edit / Save / Cancel toggle
//   - Delete button
//
// The row is "controlled" — it calls back up to the parent for any
// mutation. Local state is used only for the edit-form fields.

import { Show, createSignal, type Component } from "solid-js";
import { posterUrl, releaseYear, type AdminEntry } from "./types";

interface Props {
  entry: AdminEntry;
  index: number;
  isDragging: boolean;
  onDragStart: (e: DragEvent, index: number) => void;
  onDragEnd: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, index: number) => void;
  onSave: (entry: AdminEntry, updates: Partial<AdminEntry>) => Promise<void>;
  onDelete: (entry: AdminEntry) => Promise<void>;
}

const EntryRow: Component<Props> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  // Edit-form state (only populated when editing starts)
  const [fPosition, setFPosition] = createSignal(0);
  const [fRelease, setFRelease] = createSignal(0);
  const [fStory, setFStory] = createSignal(0);
  const [fTimeline, setFTimeline] = createSignal(0);
  const [fNote, setFNote] = createSignal("");

  const startEdit = () => {
    setFPosition(props.entry.position);
    setFRelease(props.entry.release_position);
    setFStory(props.entry.story_position);
    setFTimeline(props.entry.timeline_position);
    setFNote(props.entry.note ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await props.onSave(props.entry, {
        position: fPosition(),
        release_position: fRelease(),
        story_position: fStory(),
        timeline_position: fTimeline(),
        note: fNote().trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(
      `Remove "${props.entry.title ?? `TMDB ${props.entry.tmdb_id}`}" from this universe?`,
    )) return;
    setDeleting(true);
    try {
      await props.onDelete(props.entry);
    } finally {
      setDeleting(false);
    }
  };

  const numInputStyle = {
    width: "60px",
    padding: "var(--sp-1) var(--sp-2)",
    background: "var(--tier-3, rgba(255,255,255,0.04))",
    border: "1px solid var(--hairline)",
    "border-radius": "var(--radius-sm)",
    color: "var(--text)",
    "font-size": "0.75rem",
    "text-align": "center",
    "font-family": "monospace",
  } as const;

  const labelStyle = {
    "font-size": "0.7rem",
    color: "var(--text-muted)",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    "margin-bottom": "2px",
  } as const;

  return (
    <div
      role="listitem"
      draggable={editing() ? false : true}
      onDragStart={(e) => props.onDragStart(e, props.index)}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={(e) => props.onDrop(e, props.index)}
      style={{
        display: "flex",
        gap: "var(--sp-3)",
        padding: "var(--sp-3)",
        "border-radius": "var(--radius-md)",
        background: props.isDragging
          ? "var(--tier-3, rgba(255,255,255,0.04))"
          : "var(--tier-2, rgba(255,255,255,0.02))",
        border: "1px solid var(--hairline)",
        opacity: props.isDragging ? 0.5 : 1,
        "align-items": "flex-start",
        transition: "background 0.1s ease, opacity 0.1s ease",
      }}
    >
      {/* Drag handle */}
      <div
        style={{
          "flex-shrink": 0,
          width: "20px",
          cursor: editing() ? "not-allowed" : "grab",
          color: "var(--text-muted)",
          "text-align": "center",
          "padding-top": "var(--sp-2)",
          "font-size": "0.9rem",
          "user-select": "none",
        }}
        aria-hidden="true"
      >
        ⋮⋮
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
          color: "var(--text-muted)",
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

      {/* Title + sort indices */}
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            "font-weight": "600",
            "font-size": "0.9rem",
            color: "var(--text)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.entry.title ?? `TMDB #${props.entry.tmdb_id}`}
        </div>
        <div style={{ "font-size": "0.7rem", color: "var(--text-muted)", "margin-top": "2px" }}>
          <span
            style={{
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "font-weight": "600",
              "margin-right": "var(--sp-2)",
            }}
          >
            {props.entry.media_type}
          </span>
          <Show when={releaseYear(props.entry.release_date)}>
            <span style={{ "margin-right": "var(--sp-2)" }}>{releaseYear(props.entry.release_date)}</span>
          </Show>
          <span style={{ opacity: 0.7 }}>TMDB {props.entry.tmdb_id}</span>
        </div>

        {/* Sort indices display / edit */}
        <Show
          when={editing()}
          fallback={
            <div
              style={{
                display: "flex",
                gap: "var(--sp-3)",
                "margin-top": "var(--sp-2)",
                "font-size": "0.7rem",
                color: "var(--text-muted)",
                "flex-wrap": "wrap",
              }}
            >
              <span>
                Pos <strong style={{ color: "var(--text)" }}>{props.entry.position}</strong>
              </span>
              <span>
                Rel <strong style={{ color: "var(--text)" }}>{props.entry.release_position}</strong>
              </span>
              <span>
                Story <strong style={{ color: "var(--text)" }}>{props.entry.story_position}</strong>
              </span>
              <span>
                Time <strong style={{ color: "var(--text)" }}>{props.entry.timeline_position}</strong>
              </span>
              <Show when={props.entry.note}>
                <span style={{ "font-style": "italic", opacity: 0.85 }}>
                  📝 {props.entry.note}
                </span>
              </Show>
            </div>
          }
        >
          <div
            style={{
              display: "grid",
              "grid-template-columns": "repeat(4, auto) 1fr",
              gap: "var(--sp-2) var(--sp-3)",
              "margin-top": "var(--sp-2)",
              "align-items": "end",
            }}
          >
            <div>
              <div style={labelStyle}>Position</div>
              <input
                type="number"
                value={fPosition()}
                onInput={(e) => setFPosition(parseInt(e.currentTarget.value, 10) || 0)}
                style={numInputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Release</div>
              <input
                type="number"
                value={fRelease()}
                onInput={(e) => setFRelease(parseInt(e.currentTarget.value, 10) || 0)}
                style={numInputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Story</div>
              <input
                type="number"
                value={fStory()}
                onInput={(e) => setFStory(parseInt(e.currentTarget.value, 10) || 0)}
                style={numInputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Timeline</div>
              <input
                type="number"
                value={fTimeline()}
                onInput={(e) => setFTimeline(parseInt(e.currentTarget.value, 10) || 0)}
                style={numInputStyle}
              />
            </div>
            <div>
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
                  "box-sizing": "border-box",
                }}
              />
            </div>
          </div>
        </Show>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-1)", "flex-shrink": 0 }}>
        <Show
          when={editing()}
          fallback={
            <button
              type="button"
              onClick={startEdit}
              title="Edit sort indices + note"
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
  color: "var(--text)",
} as const;

const iconBtnSuccessStyle = {
  ...iconBtnStyle,
  "border-color": "rgba(34, 197, 94, 0.5)",
  color: "rgb(34, 197, 94)",
} as const;

const iconBtnDangerStyle = {
  ...iconBtnStyle,
  "border-color": "rgba(239, 68, 68, 0.4)",
  color: "rgb(252, 165, 165)",
} as const;

export default EntryRow;
