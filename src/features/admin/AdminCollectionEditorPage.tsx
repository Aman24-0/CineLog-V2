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
//   • Entry list with 4 independent sort indices:
//       - position        (admin's primary ordering)
//       - release_position  (by theatrical release date)
//       - story_position    (by in-universe story chronology)
//       - timeline_position (by in-universe timeline — distinct from
//                            story for time-travel franchises)
//   • Sort-mode switcher — view the list under any of the 4 sortings
//     so the admin can verify each ordering looks right.
//   • Drag-and-drop reorder — updates the *currently active* sort
//     index by rewriting the indices of the moved entries.
//   • Per-entry edit modal — adjust all 4 indices + admin note.
//   • Per-entry delete.
//   • Subscriber count display.
//   • "Preview as user" link — opens the consumer /collections/<slug>
//     page in a new tab so the admin can see exactly what users will
//     see (read-only).
//   • Back button → returns to /admin/collections (the list page),
//     NOT to the consumer collection page.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component,
  type JSX,
} from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import TmdbSearchModal from "./collectionEditor/TmdbSearchModal";
import EntryRow from "./collectionEditor/EntryRow";
import {
  type AdminUniverse,
  type AdminEntry,
  type SortMode,
} from "./collectionEditor/types";

const SORT_MODES: { id: SortMode; label: string; field: keyof AdminEntry }[] = [
  { id: "position", label: "Admin Order", field: "position" },
  { id: "release", label: "Release Date", field: "release_position" },
  { id: "story", label: "Story Order", field: "story_position" },
  { id: "timeline", label: "Timeline Order", field: "timeline_position" },
];

const AdminCollectionEditorPage: Component = () => {
  const params = useParams();
  const navigate = useNavigate();

  const [universe, setUniverse] = createSignal<AdminUniverse | null>(null);
  const [entries, setEntries] = createSignal<AdminEntry[]>([]);
  const [subscriberCount, setSubscriberCount] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sortMode, setSortMode] = createSignal<SortMode>("position");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [toast, setToast] = createSignal<{ msg: string; type: "success" | "error" } | null>(null);
  const [showMetaPanel, setShowMetaPanel] = createSignal(false);
  const [savingMeta, setSavingMeta] = createSignal(false);
  const [draggingIndex, setDraggingIndex] = createSignal<number | null>(null);

  // Metadata form state (populated when the meta panel is opened)
  const [metaForm, setMetaForm] = createSignal({
    name: "",
    slug: "",
    description: "",
    default_view: "timeline" as AdminUniverse["default_view"],
    color: "",
    cover_url: "",
    banner_url: "",
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // Resolve the universe. params.id may be a slug (preferred) or a UUID
  // — the API accepts either; we use the GET ?id=… form which currently
  // expects a UUID. To support slug-based URLs we list all universes
  // first and find by slug. (Trade-off: one extra round-trip; cleaner
  // URLs in the admin address bar.)
  const resolveUniverse = async (): Promise<{ universe: AdminUniverse | null; lookupError: string | null }> => {
    const idOrSlug = params.id;
    if (!idOrSlug) return { universe: null, lookupError: "No universe id in URL." };

    // Try UUID first (cheap path — single fetch).
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    if (isUuid) {
      const resp = await fetch(`/api/admin/collections?id=${encodeURIComponent(idOrSlug)}`, {
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        return { universe: data.universe as AdminUniverse, lookupError: null };
      }
      if (resp.status !== 404) {
        return { universe: null, lookupError: `HTTP ${resp.status}` };
      }
    }

    // Fallback: list all and find by slug.
    const listResp = await fetch("/api/admin/collections", { credentials: "include" });
    if (!listResp.ok) return { universe: null, lookupError: `HTTP ${listResp.status}` };
    const listData = await listResp.json();
    const found = (listData.universes as AdminUniverse[]).find(
      (u) => u.slug === idOrSlug || u.id === idOrSlug,
    );
    return { universe: found ?? null, lookupError: found ? null : "Universe not found." };
  };

  const fetchEntries = async (universeId: string) => {
    const resp = await fetch(
      `/api/admin/collections/entries?universe_id=${encodeURIComponent(universeId)}`,
      { credentials: "include" },
    );
    if (!resp.ok) {
      throw new Error(`Failed to load entries (HTTP ${resp.status})`);
    }
    const data = await resp.json();
    return data.entries as AdminEntry[];
  };

  const fetchSubscriberCount = async (universeId: string) => {
    try {
      const resp = await fetch(
        `/api/admin/collections?id=${encodeURIComponent(universeId)}&stats=1`,
        { credentials: "include" },
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return typeof data.subscriber_count === "number" ? data.subscriber_count : null;
    } catch {
      return null;
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const { universe: u, lookupError } = await resolveUniverse();
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
        banner_url: u.banner_url ?? "",
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

  // Sort entries by the active sort mode.
  const sortedEntries = createMemo(() => {
    const mode = SORT_MODES.find((m) => m.id === sortMode())!;
    const field = mode.field;
    return [...entries()].sort((a, b) => {
      const av = Number(a[field] ?? 0);
      const bv = Number(b[field] ?? 0);
      if (av !== bv) return av - bv;
      // Stable secondary sort by position.
      return Number(a.position ?? 0) - Number(b.position ?? 0);
    });
  });

  // ─── Drag-and-drop reorder ────────────────────────────────────────
  // Reordering renumbers the *currently active* sort index. The other
  // three indices are preserved. This lets the admin independently
  // curate each of the four orderings.

  const handleDragStart = (e: DragEvent, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer?.setData("text/plain", String(index));
    (e.currentTarget as HTMLElement).style.opacity = "0.5";
  };
  const handleDragEnd = (e: DragEvent) => {
    setDraggingIndex(null);
    (e.currentTarget as HTMLElement).style.opacity = "1";
  };
  const handleDragOver = (e: DragEvent) => e.preventDefault();
  const handleDrop = async (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDraggingIndex(null);
    const sourceIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "-1", 10);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;

    const mode = SORT_MODES.find((m) => m.id === sortMode())!;
    const field = mode.field;
    const sorted = sortedEntries();

    // Build the new ordering of entry IDs.
    const reordered = [...sorted];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Renumber the active field for every entry in this universe
    // (not just the visible slice — assumes all entries are visible).
    // Send a batch of PATCHes.
    const updates = reordered.map((entry, i) => ({
      id: entry.id,
      [field]: i,
    }));

    // Optimistic update on the client.
    setEntries((prev) =>
      prev.map((entry) => {
        const upd = updates.find((u) => u.id === entry.id);
        if (!upd) return entry;
        return { ...entry, [field]: upd[field] as number };
      }),
    );

    // Persist server-side.
    try {
      await Promise.all(
        updates.map((u) =>
          fetch("/api/admin/collections/entries", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          }),
        ),
      );
      showToast("Order saved", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save order";
      showToast(msg, "error");
      // Re-fetch to restore server truth.
      const u = universe();
      if (u) {
        const ents = await fetchEntries(u.id);
        setEntries(ents);
      }
    }
  };

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
      const resp = await fetch("/api/admin/collections/entries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe_id: u.id,
          tmdb_id: result.tmdb_id,
          media_type: result.media_type,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed to add entry", "error");
        return;
      }
      // Append the new entry with TMDB metadata already in hand.
      const newEntry: AdminEntry = {
        ...(body.entry as AdminEntry),
        title: result.title,
        poster_path: result.poster_path,
        release_date: result.release_date,
      };
      setEntries((prev) => [...prev, newEntry]);
      showToast(`Added "${result.title}"`, "success");
      // Keep the search modal open so the admin can add more.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
    }
  };

  // ─── Save entry edits ─────────────────────────────────────────────

  const handleEntrySave = async (entry: AdminEntry, updates: Partial<AdminEntry>) => {
    const resp = await fetch("/api/admin/collections/entries", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, ...updates }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body.error) {
      showToast(body.error || "Failed to save entry", "error");
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, ...updates } : e)),
    );
    showToast("Entry updated", "success");
  };

  const handleEntryDelete = async (entry: AdminEntry) => {
    const resp = await fetch(`/api/admin/collections/entries?id=${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body.error) {
      showToast(body.error || "Failed to delete entry", "error");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    showToast("Entry removed", "success");
  };

  // ─── Save universe metadata ───────────────────────────────────────

  const handleMetaSave = async () => {
    const u = universe();
    if (!u) return;
    setSavingMeta(true);
    try {
      const resp = await fetch("/api/admin/collections", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: u.id,
          name: metaForm().name.trim(),
          slug: metaForm().slug.trim().toLowerCase(),
          description: metaForm().description || null,
          default_view: metaForm().default_view,
          color: metaForm().color || null,
          cover_url: metaForm().cover_url || null,
          banner_url: metaForm().banner_url || null,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed to save metadata", "error");
        return;
      }
      // Update local state — note: if slug changed, the URL is now stale.
      const updated: AdminUniverse = body.universe ?? {
        ...u,
        name: metaForm().name,
        slug: metaForm().slug,
        description: metaForm().description || null,
        default_view: metaForm().default_view,
        color: metaForm().color || null,
        cover_url: metaForm().cover_url || null,
        banner_url: metaForm().banner_url || null,
      };
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
          "margin-bottom": "var(--sp-5)",
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
            "flex-shrink": 0,
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
                "text-overflow": "ellipsis",
              }}
            >
              {universe()!.name}
            </h1>
            <div style={{ "font-size": "0.8rem", color: "var(--text-muted)", "margin-top": "2px" }}>
              /{universe()!.slug} · {entries().length} entries
              <Show when={subscriberCount() !== null}>
                {" · "}
                {subscriberCount()} subscriber{subscriberCount() === 1 ? "" : "s"}
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
                gap: "var(--sp-1)",
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
        <div style={{ padding: "var(--sp-12)", "text-align": "center", color: "var(--text-muted)" }}>
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
              padding: "var(--sp-4) var(--sp-5)",
            }}
          >
            <h3 style={{ margin: "0 0 var(--sp-4) 0", "font-size": "1rem", color: "var(--text)" }}>
              Universe Metadata
            </h3>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "1fr 1fr",
                gap: "var(--sp-3)",
                "margin-bottom": "var(--sp-3)",
              }}
            >
              <Field label="Name *">
                <input
                  style={inputStyle}
                  value={metaForm().name}
                  onInput={(e) => setMetaForm({ ...metaForm(), name: e.currentTarget.value })}
                />
              </Field>
              <Field label="Slug *">
                <input
                  style={inputStyle}
                  value={metaForm().slug}
                  onInput={(e) => setMetaForm({ ...metaForm(), slug: e.currentTarget.value })}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                style={{ ...inputStyle, "min-height": "70px", resize: "vertical" }}
                value={metaForm().description}
                onInput={(e) => setMetaForm({ ...metaForm(), description: e.currentTarget.value })}
                placeholder="A short summary users see on the universe card."
              />
            </Field>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "1fr 1fr 1fr",
                gap: "var(--sp-3)",
                "margin-top": "var(--sp-3)",
              }}
            >
              <Field label="Default View">
                <select
                  style={inputStyle}
                  value={metaForm().default_view}
                  onChange={(e) =>
                    setMetaForm({
                      ...metaForm(),
                      default_view: e.currentTarget.value as AdminUniverse["default_view"],
                    })
                  }
                >
                  <option value="timeline">Timeline</option>
                  <option value="release">Release</option>
                  <option value="story">Story</option>
                </select>
              </Field>
              <Field label="Color (CSS / hex)">
                <input
                  style={inputStyle}
                  value={metaForm().color}
                  onInput={(e) => setMetaForm({ ...metaForm(), color: e.currentTarget.value })}
                  placeholder="#dc2626"
                />
              </Field>
              <Field label="Cover Image URL">
                <input
                  style={inputStyle}
                  value={metaForm().cover_url}
                  onInput={(e) => setMetaForm({ ...metaForm(), cover_url: e.currentTarget.value })}
                  placeholder="https://image.tmdb.org/t/p/original/…"
                />
              </Field>
            </div>
            <Field label="Banner Image URL">
              <input
                style={inputStyle}
                value={metaForm().banner_url}
                onInput={(e) => setMetaForm({ ...metaForm(), banner_url: e.currentTarget.value })}
                placeholder="https://…"
              />
            </Field>
            <div
              style={{
                display: "flex",
                "justify-content": "flex-end",
                gap: "var(--sp-2)",
                "margin-top": "var(--sp-4)",
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
            "flex-wrap": "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "var(--sp-1)", "flex-wrap": "wrap" }}>
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

        {/* Entry list */}
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
                "text-align": "center",
              }}
            >
              No entries yet. Click "+ Add title from TMDB" to add the first one.
            </div>
          }
        >
          <div role="list" style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
            <For each={sortedEntries()}>
              {(entry, i) => (
                <EntryRow
                  entry={entry}
                  index={i()}
                  isDragging={draggingIndex() === i()}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onSave={handleEntrySave}
                  onDelete={handleEntryDelete}
                />
              )}
            </For>
          </div>
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
            "line-height": "1.6",
          }}
        >
          <strong style={{ color: "var(--text-secondary)" }}>About sort indices</strong>
          <br />
          Each entry has four independent sort positions. Users on the consumer side can switch
          between them when browsing the universe. Use the sort-mode buttons above to view the
          list under each ordering, and drag entries to renumber the currently active ordering.
          Time-travel franchises (e.g. Avengers: Endgame, X-Men: Days of Future Past) typically
          have <em>story</em> and <em>timeline</em> orderings that differ.
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
        <div style={toastStyle(toast()!.type === "success")}>{toast()!.msg}</div>
      </Show>
    </div>
  );
};

// ─── Sub-components & styles ───────────────────────────────────────

function Field(props: { label: string; children: any }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          "font-size": "0.75rem",
          color: "var(--text-muted)",
          "margin-bottom": "var(--sp-1)",
          "font-weight": "500",
        }}
      >
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

const cardStyle: JSX.CSSProperties = {
  background: "var(--tier-1, rgba(255,255,255,0.04))",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)",
};

const alertErrorStyle: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)",
};

const inputStyle: JSX.CSSProperties = {
  width: "100%",
  background: "var(--tier-2, rgba(255,255,255,0.02))",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-2) var(--sp-3)",
  color: "var(--text)",
  "font-size": "0.875rem",
  "font-family": "inherit",
  "box-sizing": "border-box",
};

const btnPrimaryStyle: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.8125rem",
  cursor: "pointer",
};

const btnSecondaryStyle: JSX.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.8125rem",
  cursor: "pointer",
};

const sortBtn: JSX.CSSProperties = {
  background: "var(--tier-2, rgba(255,255,255,0.02))",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-size": "0.75rem",
  "font-weight": "500",
  cursor: "pointer",
};

const sortBtnActive: JSX.CSSProperties = {
  ...sortBtn,
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  "border-color": "transparent",
  "font-weight": "600",
};

function toastStyle(success: boolean): JSX.CSSProperties {
  return {
    position: "fixed",
    bottom: "var(--sp-6)",
    right: "var(--sp-6)",
    "z-index": 400,
    background: success ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
    color: "white",
    padding: "var(--sp-3) var(--sp-4)",
    "border-radius": "var(--radius-md)",
    "font-size": "0.875rem",
    "font-weight": "600",
    "box-shadow": "0 10px 25px rgba(0,0,0,0.3)",
  };
}

export default AdminCollectionEditorPage;
