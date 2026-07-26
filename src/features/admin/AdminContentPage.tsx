// src/features/admin/AdminContentPage.tsx
//
// CineLog V2 — Admin Featured Content Page
// ---------------------------------------------------------------------
// UI:
//   - Tabs for each slot: Hero / Spotlight / Rail / Pinned / Editor Pick
//   - List of entries in current slot (ordered by position)
//   - "Add Title" button → modal with TMDB ID + media_type + tagline
//   - Each entry: title (from TMDB), tagline, position controls, active toggle
//   - Delete + edit
//
// Backend:
//   GET    /api/admin/content?slot=<slot>
//   POST   /api/admin/content
//   PATCH  /api/admin/content
//   DELETE /api/admin/content?id=<uuid>

import { createSignal, Show, For, onMount, createMemo, type Component, type JSX } from "solid-js";

type Slot = "hero" | "spotlight" | "rail" | "pinned" | "editor_pick";

interface FeaturedEntry {
  id: string;
  slot: Slot;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title_override: string | null;
  tagline: string | null;
  note: string | null;
  position: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

interface FormData {
  id?: string;
  slot: Slot;
  tmdb_id: string;
  media_type: "movie" | "tv";
  title_override: string;
  tagline: string;
  note: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const SLOTS: { id: Slot; label: string; icon: string; description: string; max?: number }[] = [
  { id: "hero", label: "Hero", icon: "🌟", description: "Main hero card on Discover (1-3 titles, rotated)", max: 3 },
  { id: "spotlight", label: "Spotlight", icon: "🔦", description: "Spotlight section (1-5 titles)", max: 5 },
  { id: "rail", label: "Featured Rail", icon: "🛤️", description: "Featured titles rail (up to 20)", max: 20 },
  { id: "pinned", label: "Pinned", icon: "📌", description: "Pinned to top of watchlist (1-3 titles)", max: 3 },
  { id: "editor_pick", label: "Editor Picks", icon: "✍️", description: "Curated editor picks rail (up to 20)", max: 20 },
];

const emptyForm = (slot: Slot): FormData => ({
  slot,
  tmdb_id: "",
  media_type: "movie",
  title_override: "",
  tagline: "",
  note: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
});

const AdminContentPage: Component = () => {
  const [activeSlot, setActiveSlot] = createSignal<Slot>("hero");
  const [entries, setEntries] = createSignal<FeaturedEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal<FormData>(emptyForm("hero"));
  const [saving, setSaving] = createSignal(false);
  const [toast, setToast] = createSignal<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchEntries = async (slot: Slot) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/admin/content?slot=${slot}`, { credentials: "include" });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { content: FeaturedEntry[] };
      setEntries(data.content);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => fetchEntries(activeSlot()));

  const switchSlot = (slot: Slot) => {
    setActiveSlot(slot);
    fetchEntries(slot);
  };

  const openNew = () => {
    setForm(emptyForm(activeSlot()));
    setModalOpen(true);
  };

  const openEdit = (e: FeaturedEntry) => {
    setForm({
      id: e.id,
      slot: e.slot,
      tmdb_id: String(e.tmdb_id),
      media_type: e.media_type,
      title_override: e.title_override ?? "",
      tagline: e.tagline ?? "",
      note: e.note ?? "",
      is_active: e.is_active,
      starts_at: e.starts_at ? e.starts_at.slice(0, 16) : "",
      ends_at: e.ends_at ? e.ends_at.slice(0, 16) : "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    const tmdbId = parseInt(form().tmdb_id, 10);
    if (Number.isNaN(tmdbId) || tmdbId <= 0) {
      showToast("TMDB ID must be a positive number", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(form().id ? { id: form().id } : {}),
        slot: form().slot,
        tmdb_id: tmdbId,
        media_type: form().media_type,
        title_override: form().title_override || null,
        tagline: form().tagline || null,
        note: form().note || null,
        is_active: form().is_active,
        starts_at: form().starts_at ? new Date(form().starts_at).toISOString() : null,
        ends_at: form().ends_at ? new Date(form().ends_at).toISOString() : null,
      };

      const isEdit = !!form().id;
      const resp = await fetch("/api/admin/content", {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed to save", "error");
        return;
      }
      showToast(isEdit ? "Entry updated" : "Entry created", "success");
      setModalOpen(false);
      await fetchEntries(activeSlot());
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: FeaturedEntry) => {
    try {
      const resp = await fetch("/api/admin/content", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, is_active: !e.is_active }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      setEntries((prev) => prev.map((x) => (x.id === e.id ? body.content : x)));
    } catch {
      showToast("Network error", "error");
    }
  };

  const remove = async (e: FeaturedEntry) => {
    if (!confirm(`Remove TMDB ID ${e.tmdb_id} (${e.media_type}) from ${e.slot}?`)) return;
    try {
      const resp = await fetch(`/api/admin/content?id=${e.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast("Entry removed", "success");
      await fetchEntries(activeSlot());
    } catch {
      showToast("Network error", "error");
    }
  };

  const activeSlotMeta = createMemo(() => SLOTS.find((s) => s.id === activeSlot())!);

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)" }}>
        <h2 style={{ "font-size": "1.5rem", "font-weight": "700", margin: "0 0 var(--sp-1) 0", color: "var(--text)" }}>
          Featured Content
        </h2>
        <p style={{ "font-size": "0.875rem", color: "var(--text-muted)", margin: 0 }}>
          Curate which titles appear in hero/spotlight/rail/pinned/editor pick slots across the app.
        </p>
      </div>

      {/* Slot tabs */}
      <div style={{ display: "flex", gap: "var(--sp-1)", "margin-bottom": "var(--sp-4)", "flex-wrap": "wrap" }}>
        <For each={SLOTS}>
          {(slot) => (
            <button
              onClick={() => switchSlot(slot.id)}
              style={activeSlot() === slot.id ? tabActive : tabInactive}
            >
              <span style={{ "margin-right": "var(--sp-1)" }}>{slot.icon}</span>
              {slot.label}
              <span style={{ "margin-left": "var(--sp-2)", "font-size": "0.7rem", opacity: 0.7 }}>
                {slot.max && `max ${slot.max}`}
              </span>
            </button>
          )}
        </For>
      </div>

      {/* Slot description */}
      <div style={{ ...cardStyle, "margin-bottom": "var(--sp-4)", "background": "var(--tier-2)" }}>
        <span style={{ "font-size": "1.5rem", "margin-right": "var(--sp-3)" }}>{activeSlotMeta().icon}</span>
        <div>
          <div style={{ "font-weight": "600", color: "var(--text)", "font-size": "0.95rem" }}>
            {activeSlotMeta().label}
          </div>
          <div style={{ "font-size": "0.8rem", color: "var(--text-muted)" }}>
            {activeSlotMeta().description}
          </div>
        </div>
        <div style={{ "margin-left": "auto" }}>
          <button onClick={openNew} style={btnPrimary}>+ Add Title</button>
        </div>
      </div>

      <Show when={error()}>
        <div role="alert" style={alertError}>Failed to load: {error()}</div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 3 }).map(() => (
            <div style={{ ...skeletonCard, height: "70px" }} />
          ))}
        </div>
      </Show>

      <Show when={!loading() && entries().length === 0}>
        <div style={{ ...cardStyle, "justify-content": "center", color: "var(--text-muted)", "font-size": "0.9rem" }}>
          No entries in this slot. Click "+ Add Title" to feature a title.
        </div>
      </Show>

      <Show when={!loading() && entries().length > 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
          <For each={entries()}>
            {(e, idx) => (
              <div
                style={{
                  ...cardStyle,
                  opacity: e.deleted_at ? 0.45 : e.is_active ? 1 : 0.65,
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)", flex: 1, "min-width": 0 }}>
                  <div
                    style={{
                      background: "var(--tier-2)",
                      border: "1px solid var(--hairline)",
                      width: "44px",
                      height: "44px",
                      "border-radius": "var(--radius-md)",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      "font-size": "1rem",
                      "font-weight": "700",
                      color: "var(--text-muted)",
                      "flex-shrink": 0,
                    }}
                  >
                    #{idx() + 1}
                  </div>
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)" }}>
                      <span style={{ "font-weight": "600", color: "var(--text)" }}>
                        {e.title_override || `TMDB #${e.tmdb_id}`}
                      </span>
                      <span style={badgeStyle}>{e.media_type}</span>
                      <span style={{ "font-size": "0.7rem", color: "var(--text-muted)" }}>
                        TMDB ID: {e.tmdb_id}
                      </span>
                    </div>
                    <Show when={e.tagline}>
                      <div style={{ "font-size": "0.8rem", color: "var(--text-muted)", "margin-top": "2px", "font-style": "italic" }}>
                        "{e.tagline}"
                      </div>
                    </Show>
                    <div style={{ "font-size": "0.7rem", color: "var(--text-muted)", "margin-top": "4px" }}>
                      Position {e.position}
                      <Show when={e.starts_at || e.ends_at}>
                        {" • "}
                        {e.starts_at ? `from ${new Date(e.starts_at).toLocaleDateString()}` : ""}
                        {e.ends_at ? ` until ${new Date(e.ends_at).toLocaleDateString()}` : ""}
                      </Show>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "flex-shrink": 0 }}>
                  <Show when={!e.deleted_at}>
                    <button
                      onClick={() => toggleActive(e)}
                      style={e.is_active ? toggleOn : toggleOff}
                    >
                      {e.is_active ? "ACTIVE" : "INACTIVE"}
                    </button>
                    <button onClick={() => openEdit(e)} style={iconBtn} title="Edit" aria-label="Edit content entry">✏️</button>
                    <button onClick={() => remove(e)} style={iconBtnDanger} title="Remove" aria-label="Remove content entry">🗑️</button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Modal */}
      <Show when={modalOpen()}>
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            "z-index": 200,
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            padding: "var(--sp-4)",
            "backdrop-filter": "blur(4px)",
          }}
          onClick={() => !saving() && setModalOpen(false)}
        >
          <div
            style={{
              background: "var(--tier-1)",
              border: "1px solid var(--hairline)",
              "border-radius": "var(--radius-lg)",
              "max-width": "560px",
              width: "100%",
              "max-height": "90vh",
              "overflow-y": "auto",
              padding: "var(--sp-6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 var(--sp-4) 0", "font-size": "1.25rem", color: "var(--text)" }}>
              {form().id ? "Edit Featured Entry" : "Add Featured Entry"}
            </h3>

            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "var(--sp-3)" }}>
                <Field label="TMDB ID *">
                  <input
                    type="number"
                    style={inputStyle}
                    value={form().tmdb_id}
                    onInput={(e) => setForm({ ...form(), tmdb_id: e.currentTarget.value })}
                    placeholder="550"
                  />
                </Field>
                <Field label="Media Type *">
                  <select
                    style={inputStyle}
                    value={form().media_type}
                    onChange={(e) => setForm({ ...form(), media_type: e.currentTarget.value as "movie" | "tv" })}
                  >
                    <option value="movie">🎬 Movie</option>
                    <option value="tv">📺 TV Series</option>
                  </select>
                </Field>
              </div>

              <Field label="Title Override (optional)">
                <input
                  style={inputStyle}
                  value={form().title_override}
                  onInput={(e) => setForm({ ...form(), title_override: e.currentTarget.value })}
                  placeholder="Custom display title (leave blank to use TMDB title)"
                />
              </Field>

              <Field label="Tagline (optional, shown on hero/spotlight)">
                <input
                  style={inputStyle}
                  value={form().tagline}
                  onInput={(e) => setForm({ ...form(), tagline: e.currentTarget.value })}
                  placeholder="A mind-bending thriller"
                />
              </Field>

              <Field label="Internal Note (admin only, never shown to users)">
                <textarea
                  style={{ ...inputStyle, "min-height": "60px", resize: "vertical" }}
                  value={form().note}
                  onInput={(e) => setForm({ ...form(), note: e.currentTarget.value })}
                  placeholder="Why is this featured?"
                />
              </Field>

              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "var(--sp-3)" }}>
                <Field label="Starts At (optional)">
                  <input
                    type="datetime-local"
                    style={inputStyle}
                    value={form().starts_at}
                    onInput={(e) => setForm({ ...form(), starts_at: e.currentTarget.value })}
                  />
                </Field>
                <Field label="Ends At (optional)">
                  <input
                    type="datetime-local"
                    style={inputStyle}
                    value={form().ends_at}
                    onInput={(e) => setForm({ ...form(), ends_at: e.currentTarget.value })}
                  />
                </Field>
              </div>

              <label style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "font-size": "0.875rem", color: "var(--text)", cursor: "pointer", "margin-top": "var(--sp-1)" }}>
                <input
                  type="checkbox"
                  checked={form().is_active}
                  onChange={(e) => setForm({ ...form(), is_active: e.currentTarget.checked })}
                />
                Active
              </label>
            </div>

            <div style={{ display: "flex", "justify-content": "flex-end", gap: "var(--sp-2)", "margin-top": "var(--sp-5)" }}>
              <button onClick={() => setModalOpen(false)} style={btnSecondary} disabled={saving()}>
                Cancel
              </button>
              <button onClick={save} style={btnPrimary} disabled={saving()}>
                {saving() ? "Saving…" : form().id ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={toast()}>
        <div style={toastStyle(toast()?.type === "success")}>
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────

function Field(props: { label: string; children: any }) {
  return (
    <div>
      <label style={{ display: "block", "font-size": "0.8rem", color: "var(--text-muted)", "margin-bottom": "var(--sp-1)", "font-weight": "500" }}>
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const cardStyle: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  padding: "var(--sp-3) var(--sp-4)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)",
};

const skeletonCard: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  "animation": "pulse 1.5s ease-in-out infinite",
};

const alertError: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)",
};

const tabActive: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const tabInactive: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const badgeStyle: JSX.CSSProperties = {
  "font-size": "0.7rem",
  "font-weight": "700",
  background: "var(--tier-2)",
  border: "1px solid var(--hairline)",
  padding: "2px 6px",
  "border-radius": "var(--radius-sm)",
  color: "var(--text-muted)",
  "text-transform": "uppercase",
};

const inputStyle: JSX.CSSProperties = {
  width: "100%",
  background: "var(--tier-2)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-2) var(--sp-3)",
  color: "var(--text)",
  "font-size": "0.875rem",
  "font-family": "inherit",
  "box-sizing": "border-box",
};

const btnPrimary: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const btnSecondary: JSX.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const iconBtn: JSX.CSSProperties = {
  background: "var(--tier-2)",
  border: "1px solid var(--hairline)",
  width: "32px",
  height: "32px",
  "border-radius": "var(--radius-sm)",
  cursor: "pointer",
  "font-size": "0.9rem",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
};

const iconBtnDanger: JSX.CSSProperties = {
  ...iconBtn,
  "border-color": "rgba(239, 68, 68, 0.3)",
};

const toggleOn: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.7rem",
  cursor: "pointer",
};

const toggleOff: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.7rem",
  cursor: "pointer",
};

function toastStyle(success: boolean): JSX.CSSProperties {
  return {
    position: "fixed",
    bottom: "var(--sp-6)",
    right: "var(--sp-6)",
    "z-index": 300,
    background: success ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
    color: "white",
    padding: "var(--sp-3) var(--sp-4)",
    "border-radius": "var(--radius-md)",
    "font-size": "0.875rem",
    "font-weight": "600",
    "box-shadow": "0 10px 25px rgba(0,0,0,0.3)",
  };
}

export default AdminContentPage;
