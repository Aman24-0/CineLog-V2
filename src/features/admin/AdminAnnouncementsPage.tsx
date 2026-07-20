// src/features/admin/AdminAnnouncementsPage.tsx
//
// CineLog V2 — Admin Announcements Page
// ---------------------------------------------------------------------
// UI:
//   - List of all announcements (active + inactive + deleted toggle)
//   - "New Announcement" button → opens modal with form
//   - Each row: title, type, severity, active toggle, edit, delete
//   - Edit opens same modal pre-filled
//
// Backend:
//   GET    /api/admin/announcements
//   POST   /api/admin/announcements
//   PATCH  /api/admin/announcements
//   DELETE /api/admin/announcements?id=<uuid>

import { createSignal, Show, For, onMount, type Component } from "solid-js";

interface Announcement {
  id: string;
  type: "banner" | "toast" | "modal";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_dismissible: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_audience: "all" | "guests" | "authenticated";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface FormData {
  id?: string;
  type: "banner" | "toast" | "modal";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  cta_label: string;
  cta_href: string;
  is_dismissible: boolean;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  target_audience: "all" | "guests" | "authenticated";
}

const emptyForm: FormData = {
  type: "banner",
  severity: "info",
  title: "",
  body: "",
  cta_label: "",
  cta_href: "",
  is_dismissible: true,
  is_active: false,
  starts_at: "",
  ends_at: "",
  target_audience: "all",
};

const SEVERITY_STYLES: Record<string, { bg: string; fg: string; icon: string }> = {
  info: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(147, 197, 253)", icon: "ℹ️" },
  success: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(134, 239, 172)", icon: "✅" },
  warning: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(252, 211, 77)", icon: "⚠️" },
  error: { bg: "rgba(239, 68, 68, 0.15)", fg: "rgb(252, 165, 165)", icon: "🛑" },
};

const TYPE_ICONS: Record<string, string> = { banner: "📜", toast: "🍞", modal: "🔲" };

const AdminAnnouncementsPage: Component = () => {
  const [items, setItems] = createSignal<Announcement[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showDeleted, setShowDeleted] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal<FormData>(emptyForm);
  const [saving, setSaving] = createSignal(false);
  const [toast, setToast] = createSignal<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchList = async () => {
    try {
      const resp = await fetch(
        `/api/admin/announcements?include_deleted=${showDeleted() ? "true" : "false"}`,
        { credentials: "include" },
      );
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { announcements: Announcement[] };
      setItems(data.announcements);
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

  const openEdit = (a: Announcement) => {
    setForm({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      body: a.body ?? "",
      cta_label: a.cta_label ?? "",
      cta_href: a.cta_href ?? "",
      is_dismissible: a.is_dismissible,
      is_active: a.is_active,
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : "",
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : "",
      target_audience: a.target_audience,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form().title.trim()) {
      showToast("Title is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(form().id ? { id: form().id } : {}),
        type: form().type,
        severity: form().severity,
        title: form().title.trim(),
        body: form().body || null,
        cta_label: form().cta_label || null,
        cta_href: form().cta_href || null,
        is_dismissible: form().is_dismissible,
        is_active: form().is_active,
        starts_at: form().starts_at ? new Date(form().starts_at).toISOString() : null,
        ends_at: form().ends_at ? new Date(form().ends_at).toISOString() : null,
        target_audience: form().target_audience,
      };

      const isEdit = !!form().id;
      const resp = await fetch("/api/admin/announcements", {
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
      showToast(isEdit ? "Announcement updated" : "Announcement created", "success");
      setModalOpen(false);
      await fetchList();
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      const resp = await fetch("/api/admin/announcements", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      setItems((prev) => prev.map((x) => (x.id === a.id ? body.announcement : x)));
    } catch {
      showToast("Network error", "error");
    }
  };

  const remove = async (a: Announcement) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      const resp = await fetch(`/api/admin/announcements?id=${a.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast("Announcement deleted", "success");
      await fetchList();
    } catch {
      showToast("Network error", "error");
    }
  };

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)", display: "flex", "justify-content": "space-between", "align-items": "flex-start", gap: "var(--sp-4)" }}>
        <div>
          <h2 style={{ "font-size": "1.5rem", "font-weight": "700", margin: "0 0 var(--sp-1) 0", color: "var(--text)" }}>
            Announcements
          </h2>
          <p style={{ "font-size": "0.875rem", color: "var(--text-muted)", margin: 0 }}>
            Show banners, toasts, or modals to all users. Schedule with start/end times.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <label style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "font-size": "0.875rem", color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showDeleted()}
              onChange={(e) => setShowDeleted(e.currentTarget.checked)}
            />
            Show deleted
          </label>
          <button onClick={openNew} style={btnPrimary}>+ New</button>
        </div>
      </div>

      <Show when={error()}>
        <div role="alert" style={alertError}>Failed to load: {error()}</div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 3 }).map(() => (
            <div style={{ ...skeletonCard, height: "80px" }} />
          ))}
        </div>
      </Show>

      <Show when={!loading() && items().length === 0}>
        <div style={{ ...cardStyle, "justify-content": "center", color: "var(--text-muted)", "font-size": "0.9rem" }}>
          No announcements yet. Click "+ New" to create one.
        </div>
      </Show>

      <Show when={!loading() && items().length > 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
          <For each={items()}>
            {(a) => {
              const sev = SEVERITY_STYLES[a.severity];
              return (
                <div
                  style={{
                    ...cardStyle,
                    opacity: a.deleted_at ? 0.45 : a.is_active ? 1 : 0.7,
                    "border-color": a.is_active ? sev.fg : "var(--hairline)",
                  }}
                >
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)", flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        background: sev.bg,
                        color: sev.fg,
                        width: "44px",
                        height: "44px",
                        "border-radius": "var(--radius-md)",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        "font-size": "1.25rem",
                        "flex-shrink": 0,
                      }}
                    >
                      {sev.icon}
                    </div>
                    <div style={{ flex: 1, "min-width": 0 }}>
                      <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)" }}>
                        <span style={{ "font-weight": "600", color: "var(--text)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ "font-size": "0.7rem", color: "var(--text-muted)", "flex-shrink": 0 }}>
                          {TYPE_ICONS[a.type]} {a.type}
                        </span>
                        <Show when={a.target_audience !== "all"}>
                          <span style={{ "font-size": "0.7rem", color: "var(--text-muted)", "flex-shrink": 0 }}>
                            → {a.target_audience}
                          </span>
                        </Show>
                      </div>
                      <div style={{ "font-size": "0.8rem", color: "var(--text-muted)", "margin-top": "2px", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                        {a.body || <em style={{ opacity: 0.6 }}>No body</em>}
                      </div>
                      <div style={{ "font-size": "0.7rem", color: "var(--text-muted)", "margin-top": "4px" }}>
                        Created {new Date(a.created_at).toLocaleString()}
                        <Show when={a.starts_at || a.ends_at}>
                          {" • "}
                          {a.starts_at ? `from ${new Date(a.starts_at).toLocaleDateString()}` : ""}
                          {a.ends_at ? ` until ${new Date(a.ends_at).toLocaleDateString()}` : ""}
                        </Show>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "flex-shrink": 0 }}>
                    <Show when={!a.deleted_at}>
                      <button
                        onClick={() => toggleActive(a)}
                        style={a.is_active ? toggleOn : toggleOff}
                      >
                        {a.is_active ? "ACTIVE" : "INACTIVE"}
                      </button>
                      <button onClick={() => openEdit(a)} style={iconBtn} title="Edit">✏️</button>
                      <button onClick={() => remove(a)} style={iconBtnDanger} title="Delete">🗑️</button>
                    </Show>
                    <Show when={a.deleted_at}>
                      <span style={{ "font-size": "0.75rem", color: "var(--text-muted)" }}>
                        Deleted {new Date(a.deleted_at).toLocaleDateString()}
                      </span>
                    </Show>
                  </div>
                </div>
              );
            }}
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
              {form().id ? "Edit Announcement" : "New Announcement"}
            </h3>

            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3)" }}>
              <Field label="Title *">
                <input
                  style={inputStyle}
                  value={form().title}
                  onInput={(e) => setForm({ ...form(), title: e.currentTarget.value })}
                  placeholder="Maintenance window this Sunday"
                />
              </Field>

              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "var(--sp-3)" }}>
                <Field label="Type">
                  <select
                    style={inputStyle}
                    value={form().type}
                    onChange={(e) => setForm({ ...form(), type: e.currentTarget.value as FormData["type"] })}
                  >
                    <option value="banner">📜 Banner (top of page)</option>
                    <option value="toast">🍞 Toast (corner popup)</option>
                    <option value="modal">🔲 Modal (full overlay)</option>
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    style={inputStyle}
                    value={form().severity}
                    onChange={(e) => setForm({ ...form(), severity: e.currentTarget.value as FormData["severity"] })}
                  >
                    <option value="info">ℹ️ Info</option>
                    <option value="success">✅ Success</option>
                    <option value="warning">⚠️ Warning</option>
                    <option value="error">🛑 Error</option>
                  </select>
                </Field>
              </div>

              <Field label="Body">
                <textarea
                  style={{ ...inputStyle, "min-height": "80px", resize: "vertical" }}
                  value={form().body}
                  onInput={(e) => setForm({ ...form(), body: e.currentTarget.value })}
                  placeholder="Details about the announcement…"
                />
              </Field>

              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "var(--sp-3)" }}>
                <Field label="CTA Label">
                  <input
                    style={inputStyle}
                    value={form().cta_label}
                    onInput={(e) => setForm({ ...form(), cta_label: e.currentTarget.value })}
                    placeholder="Read more"
                  />
                </Field>
                <Field label="CTA Link">
                  <input
                    style={inputStyle}
                    value={form().cta_href}
                    onInput={(e) => setForm({ ...form(), cta_href: e.currentTarget.value })}
                    placeholder="/blog/maintenance"
                  />
                </Field>
              </div>

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

              <Field label="Target Audience">
                <select
                  style={inputStyle}
                  value={form().target_audience}
                  onChange={(e) => setForm({ ...form(), target_audience: e.currentTarget.value as FormData["target_audience"] })}
                >
                  <option value="all">All users</option>
                  <option value="guests">Guests only (not signed in)</option>
                  <option value="authenticated">Authenticated users only</option>
                </select>
              </Field>

              <div style={{ display: "flex", gap: "var(--sp-4)", "margin-top": "var(--sp-1)" }}>
                <label style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "font-size": "0.875rem", color: "var(--text)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form().is_active}
                    onChange={(e) => setForm({ ...form(), is_active: e.currentTarget.checked })}
                  />
                  Active
                </label>
                <label style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)", "font-size": "0.875rem", color: "var(--text)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form().is_dismissible}
                    onChange={(e) => setForm({ ...form(), is_dismissible: e.currentTarget.checked })}
                  />
                  Dismissible
                </label>
              </div>
            </div>

            <div style={{ display: "flex", "justify-content": "flex-end", gap: "var(--sp-2)", "margin-top": "var(--sp-5)" }}>
              <button onClick={() => setModalOpen(false)} style={btnSecondary} disabled={saving()}>
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

// ─── Style constants ────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  padding: "var(--sp-3) var(--sp-4)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)",
};

const skeletonCard: React.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  "animation": "pulse 1.5s ease-in-out infinite",
};

const alertError: React.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)",
};

const inputStyle: React.CSSProperties = {
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

const btnPrimary: React.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "600",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "pointer",
};

const iconBtn: React.CSSProperties = {
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

const iconBtnDanger: React.CSSProperties = {
  ...iconBtn,
  "border-color": "rgba(239, 68, 68, 0.3)",
};

const toggleOn: React.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.7rem",
  cursor: "pointer",
};

const toggleOff: React.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.7rem",
  cursor: "pointer",
};

function toastStyle(success: boolean): React.CSSProperties {
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

export default AdminAnnouncementsPage;
