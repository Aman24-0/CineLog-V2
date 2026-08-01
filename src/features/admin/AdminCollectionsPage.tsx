// src/features/admin/AdminCollectionsPage.tsx
//
// CineLog V2 — Admin Collections (Curated Universes) Page
// ---------------------------------------------------------------------
// Lists all curated universes with entry counts. Admins can create,
// edit metadata, or delete universes (cascade-deletes entries).
//
// Clicking "Edit entries" opens the admin-only editor at
//   /admin/collections/<slug>
// which is fully separate from the consumer /collections/<slug>/edit
// page. The admin editor is built for managing universe contents
// (TMDB search, 4 independent sort indices, per-entry notes) while
// the consumer page is built for users to personalize their view.
//
// Backend:
//   GET    /api/admin/collections
//   POST   /api/admin/collections
//   PATCH  /api/admin/collections
//   DELETE /api/admin/collections?id=<uuid>

import {
  createSignal,
  Show,
  For,
  onMount,
  type Component,
  type JSX
} from "solid-js";
import { A } from "@solidjs/router";

interface Universe {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  default_view: "timeline" | "release" | "story";
  color: string | null;
  cover_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
  entry_count?: number;
}

interface FormData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  default_view: "timeline" | "release" | "story";
  color: string;
  cover_url: string;
  banner_url: string;
}

const emptyForm: FormData = {
  slug: "",
  name: "",
  description: "",
  default_view: "timeline",
  color: "",
  cover_url: "",
  banner_url: ""
};

const AdminCollectionsPage: Component = () => {
  const [universes, setUniverses] = createSignal<Universe[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal<FormData>(emptyForm);
  const [saving, setSaving] = createSignal(false);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/collections", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { universes: Universe[] };

      // v2 (Phase 4 Task 23): the API now returns entry_count for each
      // universe in the same response (single batched group-by query
      // server-side). We no longer need to fetch each universe's
      // entries individually — that was an N+1 pattern that scaled
      // poorly (one round-trip per universe, plus the per-universe
      // payload scaled with entry count, not 1 row).
      //
      // Defensive: if a future API regression drops entry_count, we
      // fall back to 0 rather than crashing the page.
      setUniverses(
        data.universes.map((u) => ({
          ...u,
          entry_count: u.entry_count ?? 0
        }))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchList);

  const openNew = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (u: Universe) => {
    setForm({
      id: u.id,
      slug: u.slug,
      name: u.name,
      description: u.description ?? "",
      default_view: u.default_view,
      color: u.color ?? "",
      cover_url: u.cover_url ?? "",
      banner_url: u.banner_url ?? ""
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form().slug.trim() || !form().name.trim()) {
      showToast("Slug and name are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(form().id ? { id: form().id } : {}),
        slug: form().slug.trim().toLowerCase(),
        name: form().name.trim(),
        description: form().description || null,
        default_view: form().default_view,
        color: form().color || null,
        cover_url: form().cover_url || null,
        banner_url: form().banner_url || null
      };

      const isEdit = !!form().id;
      const resp = await fetch("/api/admin/collections", {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed to save", "error");
        return;
      }
      showToast(isEdit ? "Universe updated" : "Universe created", "success");
      setModalOpen(false);
      await fetchList();
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: Universe) => {
    if (
      !confirm(
        `Delete "${u.name}"?\n\nThis will also delete ALL entries within this universe. This cannot be undone.`
      )
    )
      return;
    try {
      const resp = await fetch(`/api/admin/collections?id=${u.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast("Universe deleted", "success");
      await fetchList();
    } catch {
      showToast("Network error", "error");
    }
  };

  return (
    <div>
      <div
        style={{
          "margin-bottom": "var(--sp-6)",
          display: "flex",
          "justify-content": "space-between",
          "align-items": "flex-start",
          gap: "var(--sp-4)"
        }}
      >
        <div>
          <h2
            style={{
              "font-size": "1.5rem",
              "font-weight": "700",
              margin: "0 0 var(--sp-1) 0",
              color: "var(--text)"
            }}
          >
            Curated Universes
          </h2>
          <p
            style={{
              "font-size": "0.875rem",
              color: "var(--text-muted)",
              margin: 0
            }}
          >
            Manage themed collections like "MCU Timeline" or "Studio Ghibli".
            Users browse these in the Collections page.
          </p>
        </div>
        <button onClick={openNew} style={btnPrimary}>
          + New Universe
        </button>
      </div>

      <Show when={error()}>
        <div role="alert" style={alertError}>
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--sp-4)"
          }}
        >
          <For each={Array.from({ length: 4 })}>
            {() => <div style={{ ...skeletonCard, height: "240px" }} />}
          </For>
        </div>
      </Show>

      <Show when={!loading() && universes().length === 0}>
        <div
          style={{
            ...cardStyle,
            "justify-content": "center",
            color: "var(--text-muted)",
            "font-size": "0.9rem"
          }}
        >
          No curated universes yet. Click "+ New Universe" to create one.
        </div>
      </Show>

      <Show when={!loading() && universes().length > 0}>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--sp-4)"
          }}
        >
          <For each={universes()}>
            {(u) => (
              <div style={universeCardStyle}>
                <div
                  style={{
                    height: "120px",
                    background: u.cover_url
                      ? `url(${u.cover_url}) center/cover`
                      : u.color ||
                        "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                    "border-radius": "var(--radius-md) var(--radius-md) 0 0",
                    position: "relative"
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: "var(--sp-2) var(--sp-3)",
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                      "font-size": "0.7rem",
                      color: "white",
                      "font-weight": "600",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.05em"
                    }}
                  >
                    {u.entry_count ?? 0} titles • {u.default_view} view
                  </div>
                </div>
                <div style={{ padding: "var(--sp-3)" }}>
                  <div
                    style={{
                      "font-weight": "700",
                      color: "var(--text)",
                      "font-size": "1rem",
                      "margin-bottom": "2px"
                    }}
                  >
                    {u.name}
                  </div>
                  <div
                    style={{
                      "font-size": "0.7rem",
                      color: "var(--text-muted)",
                      "margin-bottom": "var(--sp-2)"
                    }}
                  >
                    /{u.slug}
                  </div>
                  <Show when={u.description}>
                    <div
                      style={{
                        "font-size": "0.8rem",
                        color: "var(--text-muted)",
                        "margin-bottom": "var(--sp-3)",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        overflow: "hidden"
                      }}
                    >
                      {u.description}
                    </div>
                  </Show>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--sp-1)",
                      "margin-top": "auto"
                    }}
                  >
                    <A
                      href={`/admin/collections/${u.slug}`}
                      style={linkBtnStyle}
                      title="Open admin editor for this universe"
                    >
                      ✏️ Edit entries
                    </A>
                    <button
                      onClick={() => openEdit(u)}
                      style={iconBtn}
                      title="Edit metadata"
                      aria-label="Edit collection metadata"
                    >
                      ⚙️
                    </button>
                    <button
                      onClick={() => remove(u)}
                      style={iconBtnDanger}
                      title="Delete"
                      aria-label="Delete collection"
                    >
                      🗑️
                    </button>
                  </div>
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
            "backdrop-filter": "blur(4px)"
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
              padding: "var(--sp-6)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: "0 0 var(--sp-4) 0",
                "font-size": "1.25rem",
                color: "var(--text)"
              }}
            >
              {form().id ? "Edit Universe" : "New Universe"}
            </h3>

            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "var(--sp-3)"
              }}
            >
              <div
                style={{
                  display: "grid",
                  "grid-template-columns": "1fr 2fr",
                  gap: "var(--sp-3)"
                }}
              >
                <Field label="Slug *">
                  <input
                    style={inputStyle}
                    value={form().slug}
                    onInput={(e) =>
                      setForm({ ...form(), slug: e.currentTarget.value })
                    }
                    placeholder="mcu-timeline"
                  />
                </Field>
                <Field label="Name *">
                  <input
                    style={inputStyle}
                    value={form().name}
                    onInput={(e) =>
                      setForm({ ...form(), name: e.currentTarget.value })
                    }
                    placeholder="MCU Timeline"
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
                  value={form().description}
                  onInput={(e) =>
                    setForm({ ...form(), description: e.currentTarget.value })
                  }
                  placeholder="The complete Marvel Cinematic Universe in chronological viewing order."
                />
              </Field>

              <Field label="Default View">
                <select
                  style={inputStyle}
                  value={form().default_view}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      default_view: e.currentTarget
                        .value as FormData["default_view"]
                    })
                  }
                >
                  <option value="timeline">
                    Timeline (by story chronology)
                  </option>
                  <option value="release">Release (by release date)</option>
                  <option value="story">Story (by narrative order)</option>
                </select>
              </Field>

              <Field label="Color (CSS color or hex)">
                <input
                  style={inputStyle}
                  value={form().color}
                  onInput={(e) =>
                    setForm({ ...form(), color: e.currentTarget.value })
                  }
                  placeholder="#dc2626 or linear-gradient(...)"
                />
              </Field>

              <Field label="Cover Image URL (optional)">
                <input
                  style={inputStyle}
                  value={form().cover_url}
                  onInput={(e) =>
                    setForm({ ...form(), cover_url: e.currentTarget.value })
                  }
                  placeholder="https://image.tmdb.org/t/p/original/..."
                />
              </Field>

              <Field label="Banner Image URL (optional)">
                <input
                  style={inputStyle}
                  value={form().banner_url}
                  onInput={(e) =>
                    setForm({ ...form(), banner_url: e.currentTarget.value })
                  }
                  placeholder="https://..."
                />
              </Field>
            </div>

            <div
              style={{
                display: "flex",
                "justify-content": "flex-end",
                gap: "var(--sp-2)",
                "margin-top": "var(--sp-5)"
              }}
            >
              <button
                onClick={() => setModalOpen(false)}
                style={btnSecondary}
                disabled={saving()}
              >
                Cancel
              </button>
              <button onClick={save} style={btnPrimary} disabled={saving()}>
                {saving() ? "Saving…" : form().id ? "Update" : "Create"}
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

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          "font-size": "0.8rem",
          color: "var(--text-muted)",
          "margin-bottom": "var(--sp-1)",
          "font-weight": "500"
        }}
      >
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
  gap: "var(--sp-3)"
};

const skeletonCard: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  animation: "pulse 1.5s ease-in-out infinite"
};

const universeCardStyle: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  overflow: "hidden",
  display: "flex",
  "flex-direction": "column"
};

const alertError: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)"
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
  "box-sizing": "border-box"
};

const btnPrimary: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer"
};

const btnSecondary: JSX.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "pointer"
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
  "justify-content": "center"
};

const iconBtnDanger: JSX.CSSProperties = {
  ...iconBtn,
  "border-color": "rgba(239, 68, 68, 0.3)"
};

const linkBtnStyle: JSX.CSSProperties = {
  flex: 1,
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  background: "var(--tier-2)",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-2)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "500",
  "font-size": "0.75rem",
  cursor: "pointer",
  "text-decoration": "none"
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
    "box-shadow": "0 10px 25px rgba(0,0,0,0.3)"
  };
}

export default AdminCollectionsPage;
