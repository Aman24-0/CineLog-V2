// src/features/admin/AdminCollectionEditorPage.tsx
//
// CineLog V2 — Admin Collection Editor Page (full screen)
// ---------------------------------------------------------------------
// This is the ADMIN-side editor for a single curated universe.
// It is completely separate from the consumer /collections/[id]/edit
// page so the admin's tooling can evolve without affecting the
// user-facing UI.
//
// FEATURES:
//   • Universe metadata editor (name, slug, description, color,
//     cover, banner, default_view) — collapsible panel.
//   • TMDB search modal — search any movie/TV title and add it.
//   • Entry list with a single admin-editable sort field:
//       - incident_year (the in-universe year the movie takes place,
//                       e.g. 1943 for Captain America: The First Avenger)
//     The other sorts are fully automatic:
//       - release  → derived from TMDB release_date
//       - franchise → derived from the title ("Captain America:
//                    The First Avenger" → "Captain America")
//   • Sort-mode switcher — view the list under any of the 3 sorts
//     so the admin can verify each ordering looks right.
//   • Per-entry edit modal — adjust incident_year + admin note.
//   • Per-entry delete.
//   • Subscriber count display.
//   • "Preview as user" link — opens the consumer /collections/<slug>
//     page in a new tab so the admin can see exactly what users will
//     see (read-only).
//   • Back button → returns to /admin/collections (the list page),
//     NOT to the consumer collection page.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 3 — FILE SPLIT
// ─────────────────────────────────────────────────────────────────────
// This file was previously 1045 LOC. As of Phase 8 Chunk 3 it has been
// split into focused sub-modules under ./collectionEditor/:
//
//   • sortUtils.ts            → SORT_MODES, deriveFranchise, sortEntries,
//                               groupByFranchise, leftBadgeFor, isUuid
//   • editorStyles.tsx        → Field, toastStyle, cardStyle, inputStyle,
//                               btnPrimaryStyle, btnSecondaryStyle,
//                               sortBtn, sortBtnActive, alertErrorStyle
//   • collectionEditorApi.ts  → resolveUniverse, fetchEntries,
//                               fetchSubscriberCount, addEntryFromTmdb,
//                               saveEntry, deleteEntry,
//                               saveUniverseMetadata
//   • types.ts                → AdminUniverse, AdminEntry, SortMode
//                               (already existed)
//   • EntryRow.tsx            → entry row sub-component (already existed)
//   • TmdbSearchModal.tsx     → TMDB search modal (already existed)
//   • UniversePhasesPanel.tsx → phase dividers panel (already existed)
//
// The page component now focuses purely on state + render.
// ─────────────────────────────────────────────────────────────────────

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import TmdbSearchModal from "./collectionEditor/TmdbSearchModal";
import EntryRow from "./collectionEditor/EntryRow";
import UniversePhasesPanel from "./collectionEditor/UniversePhasesPanel";
import {
  type AdminUniverse,
  type AdminEntry,
  type SortMode
} from "./collectionEditor/types";
import {
  SORT_MODES,
  sortEntries,
  groupByFranchise,
  leftBadgeFor
} from "./collectionEditor/sortUtils";
import {
  Field,
  toastStyle,
  cardStyle,
  alertErrorStyle,
  inputStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  sortBtn,
  sortBtnActive
} from "./collectionEditor/editorStyles";
import {
  resolveUniverse,
  fetchEntries,
  fetchSubscriberCount,
  addEntryFromTmdb,
  saveEntry,
  deleteEntry,
  saveUniverseMetadata
} from "./collectionEditor/collectionEditorApi";

const AdminCollectionEditorPage: Component = () => {
  const params = useParams();
  const navigate = useNavigate();

  const [universe, setUniverse] = createSignal<AdminUniverse | null>(null);
  const [entries, setEntries] = createSignal<AdminEntry[]>([]);
  const [subscriberCount, setSubscriberCount] = createSignal<number | null>(
    null
  );
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sortMode, setSortMode] = createSignal<SortMode>("story");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const [showMetaPanel, setShowMetaPanel] = createSignal(false);
  const [savingMeta, setSavingMeta] = createSignal(false);

  // Metadata form state (populated when the meta panel is opened)
  const [metaForm, setMetaForm] = createSignal({
    name: "",
    slug: "",
    description: "",
    default_view: "timeline" as AdminUniverse["default_view"],
    color: "",
    cover_url: "",
    banner_url: ""
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const { universe: u, lookupError } = await resolveUniverse(params.id);
      if (lookupError || !u) {
        setError(lookupError ?? "Universe not found.");
        return;
      }
      setUniverse(u);
      setMetaForm({
        name: u.name,
        slug: u.slug,
        description: u.description ?? "",
        default_view: u.default_view,
        color: u.color ?? "",
        cover_url: u.cover_url ?? "",
        banner_url: u.banner_url ?? ""
      });
      const ents = await fetchEntries(u.id);
      setEntries(ents);
      const subs = await fetchSubscriberCount(u.id);
      setSubscriberCount(subs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  onMount(loadAll);

  // ─── Sort logic (delegated to sortUtils) ──────────────────────────
  // No drag-and-drop reordering — each sort is either fully automatic
  // (release, franchise) or driven by the per-entry `incident_year`
  // field (storyline). The admin edits incident_year via the pencil
  // icon on each row.

  const sortedEntries = createMemo(() =>
    sortEntries(entries(), sortMode())
  );

  // Group sorted entries by franchise (only used in franchise mode).
  // Returns null when not in franchise mode so the renderer can decide
  // whether to draw group headers or a flat list.
  const groupedByFranchise = createMemo(() =>
    groupByFranchise(sortedEntries(), sortMode())
  );

  // ─── Add entry from TMDB search ───────────────────────────────────

  const handleTmdbPick = async (result: {
    tmdb_id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    release_date: string | null;
  }) => {
    const u = universe();
    if (!u) return;
    try {
      const newEntry = await addEntryFromTmdb(u.id, result);
      setEntries((prev) => [...prev, newEntry]);
      showToast(`Added "${result.title}"`, "success");
      // Keep the search modal open so the admin can add more.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
    }
  };

  // ─── Save entry edits ─────────────────────────────────────────────

  const handleEntrySave = async (
    entry: AdminEntry,
    updates: Partial<AdminEntry>
  ) => {
    try {
      await saveEntry(entry, updates);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, ...updates } : e))
      );
      showToast("Entry updated", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save entry";
      showToast(msg, "error");
    }
  };

  const handleEntryDelete = async (entry: AdminEntry) => {
    try {
      await deleteEntry(entry);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      showToast("Entry removed", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete entry";
      showToast(msg, "error");
    }
  };

  // ─── Save universe metadata ───────────────────────────────────────

  const handleMetaSave = async () => {
    const u = universe();
    if (!u) return;
    setSavingMeta(true);
    try {
      const updated = await saveUniverseMetadata(u.id, metaForm());
      setUniverse(updated);
      setShowMetaPanel(false);
      showToast("Metadata saved", "success");
      // If slug changed, navigate to the new URL.
      if (updated.slug !== params.id) {
        navigate(`/admin/collections/${updated.slug}`, { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
    } finally {
      setSavingMeta(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div style={{ "padding-bottom": "var(--sp-12)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          "align-items": "flex-start",
          gap: "var(--sp-3)",
          "margin-bottom": "var(--sp-5)"
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/admin/collections")}
          title="Back to admin collections list"
          style={{
            background: "var(--tier-2, rgba(255,255,255,0.02))",
            color: "var(--text)",
            border: "1px solid var(--hairline)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-2)",
            cursor: "pointer",
            "font-size": "1.1rem",
            "line-height": "1",
            "flex-shrink": 0
          }}
          aria-label="Back to admin collections"
        >
          ←
        </button>
        <div style={{ flex: 1, "min-width": 0 }}>
          <Show when={universe()}>
            <h1
              style={{
                margin: 0,
                "font-size": "1.5rem",
                "font-weight": "700",
                color: "var(--text)",
                "white-space": "nowrap",
                overflow: "hidden",
                "text-overflow": "ellipsis"
              }}
            >
              {universe()!.name}
            </h1>
            <div
              style={{
                "font-size": "0.8rem",
                color: "var(--text-muted)",
                "margin-top": "2px"
              }}
            >
              /{universe()!.slug} · {entries().length} entries
              <Show when={subscriberCount() !== null}>
                {" · "}
                {subscriberCount()} subscriber
                {subscriberCount() === 1 ? "" : "s"}
              </Show>
            </div>
          </Show>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", "flex-shrink": 0 }}>
          <Show when={universe()}>
            <A
              href={`/collections/${universe()!.slug}`}
              target="_blank"
              rel="noopener"
              title="Open the consumer view in a new tab (read-only preview)"
              style={{
                ...btnSecondaryStyle,
                "text-decoration": "none",
                display: "inline-flex",
                "align-items": "center",
                gap: "var(--sp-1)"
              }}
            >
              👁️ Preview as user
            </A>
          </Show>
          <button
            type="button"
            onClick={() => setShowMetaPanel((v) => !v)}
            style={showMetaPanel() ? btnPrimaryStyle : btnSecondaryStyle}
          >
            ⚙️ {showMetaPanel() ? "Close metadata" : "Edit metadata"}
          </button>
        </div>
      </div>

      {/* Error / loading */}
      <Show when={loading()}>
        <div
          style={{
            padding: "var(--sp-12)",
            "text-align": "center",
            color: "var(--text-muted)"
          }}
        >
          Loading universe…
        </div>
      </Show>
      <Show when={error()}>
        <div style={alertErrorStyle}>Failed to load: {error()}</div>
      </Show>

      <Show when={!loading() && universe()}>
        {/* Metadata editor panel */}
        <Show when={showMetaPanel()}>
          <div
            style={{
              ...cardStyle,
              "margin-bottom": "var(--sp-5)",
              padding: "var(--sp-4) var(--sp-5)"
            }}
          >
            <h3
              style={{
                margin: "0 0 var(--sp-4) 0",
                "font-size": "1rem",
                color: "var(--text)"
              }}
            >
              Universe Metadata
            </h3>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "1fr 1fr",
                gap: "var(--sp-3)",
                "margin-bottom": "var(--sp-3)"
              }}
            >
              <Field label="Name *">
                <input
                  style={inputStyle}
                  value={metaForm().name}
                  onInput={(e) =>
                    setMetaForm({ ...metaForm(), name: e.currentTarget.value })
                  }
                />
              </Field>
              <Field label="Slug *">
                <input
                  style={inputStyle}
                  value={metaForm().slug}
                  onInput={(e) =>
                    setMetaForm({ ...metaForm(), slug: e.currentTarget.value })
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                style={{
                  ...inputStyle,
                  "min-height": "70px",
                  resize: "vertical"
                }}
                value={metaForm().description}
                onInput={(e) =>
                  setMetaForm({
                    ...metaForm(),
                    description: e.currentTarget.value
                  })
                }
                placeholder="A short summary users see on the universe card."
              />
            </Field>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "1fr 1fr 1fr",
                gap: "var(--sp-3)",
                "margin-top": "var(--sp-3)"
              }}
            >
              <Field label="Default View">
                <select
                  style={inputStyle}
                  value={metaForm().default_view}
                  onChange={(e) =>
                    setMetaForm({
                      ...metaForm(),
                      default_view: e.currentTarget
                        .value as AdminUniverse["default_view"]
                    })
                  }
                >
                  <option value="story">Storyline</option>
                  <option value="release">Release Year</option>
                  <option value="franchise">Franchise</option>
                  {/* Legacy "timeline" value kept for backward-compat with
                      existing DB rows. Maps to "story" (Storyline) in the
                      adapter. Hidden from new selections. */}
                  <Show when={metaForm().default_view === "timeline"}>
                    <option value="timeline">
                      Timeline (legacy — maps to Storyline)
                    </option>
                  </Show>
                </select>
              </Field>
              <Field label="Color (CSS / hex)">
                <input
                  style={inputStyle}
                  value={metaForm().color}
                  onInput={(e) =>
                    setMetaForm({ ...metaForm(), color: e.currentTarget.value })
                  }
                  placeholder="#dc2626"
                />
              </Field>
              <Field label="Cover Image URL">
                <input
                  style={inputStyle}
                  value={metaForm().cover_url}
                  onInput={(e) =>
                    setMetaForm({
                      ...metaForm(),
                      cover_url: e.currentTarget.value
                    })
                  }
                  placeholder="https://image.tmdb.org/t/p/original/…"
                />
              </Field>
            </div>
            <Field label="Banner Image URL">
              <input
                style={inputStyle}
                value={metaForm().banner_url}
                onInput={(e) =>
                  setMetaForm({
                    ...metaForm(),
                    banner_url: e.currentTarget.value
                  })
                }
                placeholder="https://…"
              />
            </Field>
            <div
              style={{
                display: "flex",
                "justify-content": "flex-end",
                gap: "var(--sp-2)",
                "margin-top": "var(--sp-4)"
              }}
            >
              <button
                type="button"
                onClick={() => setShowMetaPanel(false)}
                style={btnSecondaryStyle}
                disabled={savingMeta()}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMetaSave}
                style={btnPrimaryStyle}
                disabled={savingMeta()}
              >
                {savingMeta() ? "Saving…" : "Save metadata"}
              </button>
            </div>
          </div>
        </Show>

        {/* Toolbar: sort mode + add entry button */}
        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            gap: "var(--sp-3)",
            "margin-bottom": "var(--sp-4)",
            "flex-wrap": "wrap"
          }}
        >
          <div
            style={{ display: "flex", gap: "var(--sp-1)", "flex-wrap": "wrap" }}
          >
            <For each={SORT_MODES}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => setSortMode(m.id)}
                  style={sortMode() === m.id ? sortBtnActive : sortBtn}
                >
                  {m.label}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            style={btnPrimaryStyle}
          >
            + Add title from TMDB
          </button>
        </div>

        {/* Timeline Dividers panel — admin-managed phase dividers
            stored in the `universe_phases` table. The user-side detail
            page fetches these and renders them as section headers
            between entries. NO hardcoded data — every divider is
            configured here. */}
        <Show when={universe()}>
          <UniversePhasesPanel
            universeId={universe()!.id}
            entries={entries()}
          />
        </Show>

        {/* Entry list — flat for story/release modes, grouped by franchise
            for the franchise mode (mirrors the consumer TimelineEngine
            franchise view). */}
        <Show
          when={sortedEntries().length > 0}
          fallback={
            <div
              style={{
                ...cardStyle,
                "justify-content": "center",
                padding: "var(--sp-8)",
                color: "var(--text-muted)",
                "font-size": "0.9rem",
                "text-align": "center"
              }}
            >
              No entries yet. Click "+ Add title from TMDB" to add the first
              one.
            </div>
          }
        >
          <Show
            when={groupedByFranchise()}
            fallback={
              <div
                role="list"
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--sp-2)"
                }}
              >
                <For each={sortedEntries()}>
                  {(entry, i) => (
                    <EntryRow
                      entry={entry}
                      displayIndex={i() + 1}
                      leftBadge={leftBadgeFor(entry, sortMode(), null)}
                      onSave={handleEntrySave}
                      onDelete={handleEntryDelete}
                    />
                  )}
                </For>
              </div>
            }
          >
            {/* Franchise mode — render each franchise group with a header. */}
            <For each={groupedByFranchise()!}>
              {(group) => (
                <div
                  style={{
                    "margin-bottom": "var(--sp-4)",
                    "border-left":
                      "2px solid color-mix(in srgb, var(--p, #7c3aed) 30%, transparent)",
                    "padding-left": "var(--sp-3)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "baseline",
                      gap: "var(--sp-2)",
                      "margin-bottom": "var(--sp-2)",
                      padding: "0 var(--sp-2)"
                    }}
                  >
                    <span
                      style={{
                        "font-size": "0.95rem",
                        "font-weight": "700",
                        color: "var(--text)",
                        "letter-spacing": "0.01em"
                      }}
                    >
                      {group.franchise}
                    </span>
                    <span
                      style={{
                        "font-size": "0.7rem",
                        color: "var(--text-muted)",
                        "text-transform": "uppercase",
                        "letter-spacing": "0.08em"
                      }}
                    >
                      {group.entries.length}{" "}
                      {group.entries.length === 1 ? "title" : "titles"}
                    </span>
                  </div>
                  <div
                    role="list"
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      gap: "var(--sp-2)"
                    }}
                  >
                    <For each={group.entries}>
                      {(entry, i) => (
                        <EntryRow
                          entry={entry}
                          displayIndex={i() + 1}
                          leftBadge={leftBadgeFor(entry, sortMode(), i())}
                          onSave={handleEntrySave}
                          onDelete={handleEntryDelete}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>

        {/* Help footer */}
        <div
          style={{
            "margin-top": "var(--sp-6)",
            padding: "var(--sp-4)",
            "border-radius": "var(--radius-md)",
            background: "var(--tier-2, rgba(255,255,255,0.02))",
            border: "1px dashed var(--hairline)",
            "font-size": "0.8rem",
            color: "var(--text-muted)",
            "line-height": "1.6"
          }}
        >
          <strong style={{ color: "var(--text-secondary)" }}>
            About sort modes
          </strong>
          <br />
          Three sort modes are exposed to the user on the consumer side:{" "}
          <em>Storyline</em> (in-universe chronology, sorted by the per-entry{" "}
          <code>incident_year</code> you set via the pencil icon — e.g. 1943 for
          Captain America: The First Avenger, 1995 for Captain Marvel),{" "}
          <em>Release Year</em>
          (theatrical release date — automatic from TMDB metadata, no admin
          input needed), and
          <em>Franchise</em> (groups entries by movie series — Iron Man films
          together, Thor films together, etc. — derived automatically from the
          title; within each group entries are sorted by
          <code>incident_year</code>). Use the sort-mode buttons above to
          preview each ordering. Click the pencil icon on any entry to set its{" "}
          <code>incident_year</code> and an admin-only note.
        </div>
      </Show>

      {/* TMDB search modal */}
      <Show when={searchOpen()}>
        <TmdbSearchModal
          onClose={() => setSearchOpen(false)}
          onPick={handleTmdbPick}
          existingEntries={entries()}
        />
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        <div style={toastStyle(toast()!.type === "success")}>
          {toast()!.msg}
        </div>
      </Show>
    </div>
  );
};

export default AdminCollectionEditorPage;
