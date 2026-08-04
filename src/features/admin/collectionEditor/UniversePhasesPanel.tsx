// src/features/admin/collectionEditor/UniversePhasesPanel.tsx
import {
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  type Component
} from "solid-js";
import type { AdminEntry } from "./types";

/**
 * UniversePhasesPanel — admin UI for managing phase dividers on a
 * curated universe.
 *
 * Phases are stored in the `universe_phases` table (see migration
 * 20260729_add_archived_at_to_collections.sql). Each phase has:
 *   - label        (e.g. "Phase 1", "Infinity Saga")
 *   - description  (optional, e.g. "Avengers Assemble")
 *   - before_entry_id  (TMDB id OR UUID of the entry the divider
 *                       appears BEFORE; null = render at the very top)
 *   - before_entry_kind (Phase 4 Task 5: 'uuid' | 'tmdb_id' | null —
 *                       disambiguates before_entry_id so the consumer
 *                       can resolve it safely without guessing)
 *   - order_index  (sort order when multiple phases share the same
 *                   before_entry_id — rare but supported)
 *
 * The user-side CollectionDetailPage fetches these via
 * fetchPhasesForUniverse(universeId) and renders them as section
 * headers in the TimelineEngine. Users have NO edit access — this
 * panel is the SOLE source of phase data.
 *
 * NO HARDCODED PHASES — every divider is admin-configured.
 */
export interface UniversePhaseRow {
  id: string;
  label: string;
  description: string | null;
  before_entry_id: string | null;
  /** Phase 4 Task 5: 'uuid' | 'tmdb_id' | null (null when before_entry_id is null). */
  before_entry_kind: string | null;
  order_index: number;
}

interface UniversePhasesPanelProps {
  universeId: string;
  entries: AdminEntry[];
}

const UniversePhasesPanel: Component<UniversePhasesPanelProps> = (props) => {
  const [phases, setPhases] = createSignal<UniversePhaseRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // New phase form state
  const [newLabel, setNewLabel] = createSignal("");
  const [newDescription, setNewDescription] = createSignal("");
  const [newBeforeEntryId, setNewBeforeEntryId] = createSignal<string>("");

  const fetchPhases = async () => {
    setLoading(true);
    setError(null);
    try {
      const { getClient } = await import("~/lib/supabase/client");
      const supabase = getClient();
      const { data, error: err } = await supabase
        .from("universe_phases")
        .select("id, label, description, before_entry_id, before_entry_kind, order_index")
        .eq("universe_id", props.universeId)
        .order("order_index", { ascending: true });
      if (err) throw err;
      setPhases((data ?? []) as UniversePhaseRow[]);
    } catch (err) {
      console.error("[UniversePhasesPanel] fetch failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void fetchPhases();
  });

  const entryOptions = createMemo(() => {
    // Entries sorted by their position (admin's primary order). The
    // dropdown shows "Title (Year)" so the admin can identify which
    // entry the divider will appear before.
    return [...props.entries]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((e) => ({
        id: String(e.tmdb_id),
        label: `${e.title || "Untitled"}${e.release_date ? ` (${e.release_date.slice(0, 4)})` : ""}`
      }));
  });

  const handleAdd = async () => {
    const label = newLabel().trim();
    if (!label) return;
    setSaving(true);
    setError(null);
    try {
      const { getClient } = await import("~/lib/supabase/client");
      const supabase = getClient();
      const nextOrder =
        phases().length > 0
          ? Math.max(...phases().map((p) => p.order_index)) + 1
          : 0;
      const payload = {
        universe_id: props.universeId,
        label,
        description: newDescription().trim() || null,
        before_entry_id: newBeforeEntryId() || null,
        // Phase 4 Task 5: explicitly record the kind so the consumer can
        // resolve before_entry_id without guessing. The admin UI stores
        // TMDB ids (the dropdown is populated from entryOptions which
        // uses String(e.tmdb_id)), so the kind is always 'tmdb_id' here.
        before_entry_kind: newBeforeEntryId() ? "tmdb_id" : null,
        order_index: nextOrder
      };
      const { data, error: err } = await supabase
        .from("universe_phases")
        .insert(payload)
        .select("id, label, description, before_entry_id, before_entry_kind, order_index")
        .single();
      if (err) throw err;
      if (data) {
        setPhases((prev) => [...prev, data as UniversePhaseRow]);
      }
      setNewLabel("");
      setNewDescription("");
      setNewBeforeEntryId("");
    } catch (err) {
      console.error("[UniversePhasesPanel] add failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const { getClient } = await import("~/lib/supabase/client");
      const supabase = getClient();
      const { error: err } = await supabase
        .from("universe_phases")
        .delete()
        .eq("id", id);
      if (err) throw err;
      setPhases((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("[UniversePhasesPanel] delete failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const labelForEntryId = (id: string | null): string => {
    if (!id) return "Top of timeline";
    const e = props.entries.find((x) => String(x.tmdb_id) === id);
    if (!e) return `Missing entry ${id}`;
    return `${e.title || "Untitled"}${e.release_date ? ` (${e.release_date.slice(0, 4)})` : ""}`;
  };

  return (
    <div
      style={{
        "margin-top": "var(--sp-6)",
        padding: "var(--sp-4)",
        background: "var(--tier-2, rgba(255,255,255,0.02))",
        border: "1px solid var(--hairline)",
        "border-radius": "var(--radius-md)"
      }}
    >
      <div style={{ "margin-bottom": "var(--sp-3)" }}>
        <h3
          style={{
            margin: "0 0 4px",
            "font-size": "0.95rem",
            color: "var(--text)"
          }}
        >
          Timeline Dividers
        </h3>
        <p
          style={{
            margin: "0",
            "font-size": "0.75rem",
            color: "var(--text-muted)"
          }}
        >
          Section headers that appear between entries on the user's timeline. No
          hardcoded data — every divider is admin-configured here.
        </p>
      </div>

      <Show when={error()}>
        <div
          style={{
            padding: "8px 12px",
            "margin-bottom": "var(--sp-3)",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            "border-radius": "6px",
            color: "#f87171",
            "font-size": "0.75rem"
          }}
        >
          {error()}
        </div>
      </Show>

      {/* Existing phases list */}
      <Show
        when={!loading()}
        fallback={
          <div style={{ color: "var(--text-muted)", "font-size": "0.8rem" }}>
            Loading…
          </div>
        }
      >
        <Show when={phases().length > 0}>
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "6px",
              "margin-bottom": "var(--sp-3)"
            }}
          >
            <For each={phases()}>
              {(phase) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "8px 10px",
                    background: "var(--tier-3, rgba(255,255,255,0.03))",
                    border: "1px solid var(--hairline)",
                    "border-radius": "6px"
                  }}
                >
                  <div style={{ flex: "1", "min-width": "0" }}>
                    <div
                      style={{
                        "font-size": "0.8125rem",
                        color: "var(--text)",
                        "font-weight": 600
                      }}
                    >
                      {phase.label}
                    </div>
                    <Show when={phase.description}>
                      <div
                        style={{
                          "font-size": "0.6875rem",
                          color: "var(--text-muted)"
                        }}
                      >
                        {phase.description}
                      </div>
                    </Show>
                    <div
                      style={{
                        "font-size": "0.625rem",
                        color: "var(--text-muted)",
                        "margin-top": "2px"
                      }}
                    >
                      Before:{" "}
                      <span style={{ color: "var(--text-soft)" }}>
                        {labelForEntryId(phase.before_entry_id)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(phase.id)}
                    disabled={saving()}
                    aria-label={`Delete phase ${phase.label}`}
                    title="Delete divider"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(248,113,113,0.3)",
                      color: "#f87171",
                      "border-radius": "4px",
                      padding: "4px 8px",
                      cursor: saving() ? "not-allowed" : "pointer",
                      "font-size": "0.6875rem"
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Add new phase form */}
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "8px",
            "padding-top": "var(--sp-2)",
            "border-top": "1px dashed var(--hairline)"
          }}
        >
          <input
            type="text"
            placeholder="Phase label (e.g. Phase 1, Infinity Saga)"
            value={newLabel()}
            onInput={(e) => setNewLabel(e.currentTarget.value)}
            style={{
              padding: "8px 10px",
              background: "var(--tier-3, rgba(255,255,255,0.03))",
              border: "1px solid var(--hairline)",
              "border-radius": "6px",
              color: "var(--text)",
              "font-size": "0.8125rem",
              "font-family": "inherit"
            }}
          />
          <input
            type="text"
            placeholder="Description (optional, e.g. Avengers Assemble)"
            value={newDescription()}
            onInput={(e) => setNewDescription(e.currentTarget.value)}
            style={{
              padding: "8px 10px",
              background: "var(--tier-3, rgba(255,255,255,0.03))",
              border: "1px solid var(--hairline)",
              "border-radius": "6px",
              color: "var(--text)",
              "font-size": "0.8125rem",
              "font-family": "inherit"
            }}
          />
          <select
            value={newBeforeEntryId()}
            onChange={(e) => setNewBeforeEntryId(e.currentTarget.value)}
            style={{
              padding: "8px 10px",
              background: "var(--tier-3, rgba(255,255,255,0.03))",
              border: "1px solid var(--hairline)",
              "border-radius": "6px",
              color: "var(--text)",
              "font-size": "0.8125rem",
              "font-family": "inherit"
            }}
          >
            <option value="">— Top of timeline (before all entries) —</option>
            <For each={entryOptions()}>
              {(opt) => <option value={opt.id}>Before: {opt.label}</option>}
            </For>
          </select>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!newLabel().trim() || saving()}
            style={{
              "align-self": "flex-start",
              padding: "8px 14px",
              background:
                newLabel().trim() && !saving()
                  ? "var(--p, #e62429)"
                  : "var(--tier-3)",
              color:
                newLabel().trim() && !saving() ? "#fff" : "var(--text-muted)",
              border: "none",
              "border-radius": "6px",
              cursor:
                newLabel().trim() && !saving() ? "pointer" : "not-allowed",
              "font-size": "0.75rem",
              "font-weight": 600
            }}
          >
            {saving() ? "Saving…" : "+ Add Divider"}
          </button>
        </div>
      </Show>
    </div>
  );
};

export default UniversePhasesPanel;
