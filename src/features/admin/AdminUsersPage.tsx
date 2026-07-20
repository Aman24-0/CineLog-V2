// src/features/admin/AdminUsersPage.tsx
//
// CineLog V2 — Admin Users Page Component
// ---------------------------------------------------------------------
// Features:
//   - Search by username or display name (debounced)
//   - Paginated table (25 per page)
//   - Per-row actions: Disable / Enable / Delete / Reset Preferences
//   - All mutations show a confirmation dialog
//   - Success/error toasts after each action
//
// The page is fully client-side reactive — no full page reloads.

import {
  createSignal,
  createResource,
  Show,
  For,
  type Component,
} from "solid-js";
import { untrack } from "solid-js";

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  country: string;
  created_at: string;
  deleted_at: string | null;
  admin_disabled_at: string | null;
  scheduled_deletion_at: string | null;
  is_admin: boolean;
  vault_count: number;
  last_activity: string | null;
}

interface ListUsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

interface ConfirmDialogState {
  user: UserRow;
  action: "disable" | "enable" | "delete" | "reset_preferences";
}

const PAGE_SIZE = 25;

const AdminUsersPage: Component = () => {
  const [search, setSearch] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [confirmDialog, setConfirmDialog] = createSignal<ConfirmDialogState | null>(null);
  const [actionLoading, setActionLoading] = createSignal(false);
  const [toast, setToast] = createSignal<{ msg: string; type: "success" | "error" } | null>(null);

  // Debounced search
  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  const debouncedSearch = (val: string) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      setSearch(val);
      setPage(1);
      setRefreshKey((k) => k + 1);
    }, 300);
  };

  const fetchUsers = async (): Promise<ListUsersResponse> => {
    const params = new URLSearchParams({
      page: page().toString(),
      limit: PAGE_SIZE.toString(),
    });
    if (search()) params.set("search", search());

    const resp = await fetch(`/api/admin/users?${params}`, {
      credentials: "include",
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        throw new Error("Unauthorized");
      }
      throw new Error(`HTTP ${resp.status}`);
    }
    return (await resp.json()) as ListUsersResponse;
  };

  const [users] = createResource(refreshKey, fetchUsers);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAction = async () => {
    const dialog = confirmDialog();
    if (!dialog) return;

    setActionLoading(true);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dialog.user.id,
          action: dialog.action,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || `Failed: ${resp.status}`, "error");
      } else {
        const actionLabels: Record<string, string> = {
          disable: "User disabled",
          enable: "User enabled",
          delete: "User deleted",
          reset_preferences: "Preferences reset",
        };
        showToast(actionLabels[dialog.action] || "Action complete", "success");
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
    } finally {
      setActionLoading(false);
      setConfirmDialog(null);
    }
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = () => {
    const data = users();
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limit));
  };

  const actionLabel = (action: string): string => {
    const map: Record<string, string> = {
      disable: "Disable Account",
      enable: "Enable Account",
      delete: "Delete Account",
      reset_preferences: "Reset Preferences",
    };
    return map[action] || action;
  };

  const actionDescription = (action: string): string => {
    const map: Record<string, string> = {
      disable: "The user will be signed out and unable to log in until re-enabled.",
      enable: "The user will be able to log in again.",
      delete: "Soft-delete — the user's profile and data are retained but hidden.",
      reset_preferences: "All user preferences (theme, language, etc.) will be reset to defaults.",
    };
    return map[action] || "";
  };

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)" }}>
        <h2
          style={{
            "font-size": "1.5rem",
            "font-weight": "700",
            margin: "0 0 var(--sp-1) 0",
            color: "var(--text)",
          }}
        >
          User Management
        </h2>
        <p
          style={{
            "font-size": "0.875rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Search, view, and manage user accounts
        </p>
      </div>

      {/* Search bar */}
      <div style={{ "margin-bottom": "var(--sp-4)" }}>
        <input
          type="text"
          placeholder="Search by username or display name…"
          onInput={(e) => debouncedSearch(e.currentTarget.value)}
          style={{
            width: "100%",
            "max-width": "480px",
            padding: "var(--sp-3) var(--sp-4)",
            "background": "var(--tier-2)",
            border: "1px solid var(--hairline-2)",
            "border-radius": "var(--radius-md)",
            color: "var(--text)",
            "font-size": "0.9375rem",
            outline: "none",
          }}
        />
      </div>

      {/* Table */}
      <div
        style={{
          "background": "var(--tier-1)",
          border: "1px solid var(--hairline)",
          "border-radius": "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ "overflow-x": "auto" }}>
          <table
            style={{
              width: "100%",
              "border-collapse": "collapse",
              "font-size": "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  "background": "var(--tier-2)",
                  "text-align": "left",
                  "border-bottom": "1px solid var(--hairline)",
                }}
              >
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>User</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>Email</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>Joined</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>Vault</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>Last Active</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)" }}>Status</th>
                <th style={{ padding: "var(--sp-3) var(--sp-4)", "font-weight": "600", color: "var(--text-secondary)", "text-align": "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <Show when={users.loading}>
                <tr>
                  <td
                    colspan={7}
                    style={{
                      padding: "var(--sp-6)",
                      "text-align": "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    Loading…
                  </td>
                </tr>
              </Show>

              <Show when={users.error}>
                <tr>
                  <td
                    colspan={7}
                    style={{
                      padding: "var(--sp-6)",
                      "text-align": "center",
                      color: "rgb(252, 165, 165)",
                    }}
                  >
                    Failed to load users: {String(users.error?.message ?? users.error)}
                  </td>
                </tr>
              </Show>

              <Show when={!users.loading && !users.error && users()?.users.length === 0}>
                <tr>
                  <td
                    colspan={7}
                    style={{
                      padding: "var(--sp-6)",
                      "text-align": "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    No users found
                  </td>
                </tr>
              </Show>

              <For each={users()?.users ?? []}>
                {(user) => (
                  <tr
                    style={{
                      "border-bottom": "1px solid var(--hairline)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tier-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "var(--sp-3) var(--sp-4)" }}>
                      <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            "border-radius": "50%",
                            "background": user.avatar_url
                              ? `url(${user.avatar_url}) center/cover`
                              : "var(--p)",
                            "flex-shrink": 0,
                            display: "flex",
                            "align-items": "center",
                            "justify-content": "center",
                            color: "var(--on-primary)",
                            "font-weight": "600",
                            "font-size": "0.75rem",
                          }}
                        >
                          {!user.avatar_url && user.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ "font-weight": "500", color: "var(--text)" }}>
                            {user.display_name}
                          </div>
                          <div style={{ "font-size": "0.75rem", color: "var(--text-muted)" }}>
                            @{user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)", color: "var(--text-secondary)" }}>
                      {user.email || <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)", color: "var(--text-secondary)", "white-space": "nowrap" }}>
                      {formatDate(user.created_at)}
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)", color: "var(--text-secondary)" }}>
                      {user.vault_count}
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)", color: "var(--text-secondary)", "white-space": "nowrap" }}>
                      {formatDate(user.last_activity)}
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)" }}>
                      <Show when={user.deleted_at}>
                        <span
                          style={{
                            "background": "rgba(239, 68, 68, 0.15)",
                            color: "rgb(252, 165, 165)",
                            "font-size": "0.75rem",
                            "font-weight": "600",
                            padding: "2px 8px",
                            "border-radius": "var(--radius-sm)",
                          }}
                        >
                          DELETED
                        </span>
                      </Show>
                      <Show when={!user.deleted_at && user.admin_disabled_at}>
                        <span
                          style={{
                            "background": "rgba(251, 191, 36, 0.15)",
                            color: "rgb(253, 224, 71)",
                            "font-size": "0.75rem",
                            "font-weight": "600",
                            padding: "2px 8px",
                            "border-radius": "var(--radius-sm)",
                          }}
                        >
                          DISABLED
                        </span>
                      </Show>
                      <Show when={!user.deleted_at && !user.admin_disabled_at && user.is_admin}>
                        <span
                          style={{
                            "background": "rgba(99, 102, 241, 0.15)",
                            color: "rgb(165, 180, 252)",
                            "font-size": "0.75rem",
                            "font-weight": "600",
                            padding: "2px 8px",
                            "border-radius": "var(--radius-sm)",
                          }}
                        >
                          ADMIN
                        </span>
                      </Show>
                      <Show when={!user.deleted_at && !user.admin_disabled_at && !user.is_admin}>
                        <span
                          style={{
                            "background": "rgba(34, 197, 94, 0.15)",
                            color: "rgb(134, 239, 172)",
                            "font-size": "0.75rem",
                            "font-weight": "600",
                            padding: "2px 8px",
                            "border-radius": "var(--radius-sm)",
                          }}
                        >
                          ACTIVE
                        </span>
                      </Show>
                    </td>
                    <td style={{ padding: "var(--sp-3) var(--sp-4)", "text-align": "right" }}>
                      <Show when={!user.is_admin}>
                        <Show when={!user.deleted_at && !user.admin_disabled_at}>
                          <button
                            onClick={() => setConfirmDialog({ user, action: "disable" })}
                            style={actionBtnStyle("warning")}
                          >
                            Disable
                          </button>
                        </Show>
                        <Show when={!user.deleted_at && user.admin_disabled_at}>
                          <button
                            onClick={() => setConfirmDialog({ user, action: "enable" })}
                            style={actionBtnStyle("default")}
                          >
                            Enable
                          </button>
                        </Show>
                        <Show when={!user.deleted_at}>
                          <button
                            onClick={() => setConfirmDialog({ user, action: "reset_preferences" })}
                            style={actionBtnStyle("default")}
                          >
                            Reset Prefs
                          </button>
                        </Show>
                        <Show when={!user.deleted_at}>
                          <button
                            onClick={() => setConfirmDialog({ user, action: "delete" })}
                            style={actionBtnStyle("danger")}
                          >
                            Delete
                          </button>
                        </Show>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Show when={users() && users()!.total > PAGE_SIZE}>
        <div
          style={{
            display: "flex",
            "justify-content": "space-between",
            "align-items": "center",
            "margin-top": "var(--sp-4)",
            "font-size": "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          <span>
            Showing {(page() - 1) * PAGE_SIZE + 1}–
            {Math.min(page() * PAGE_SIZE, users()?.total ?? 0)} of {users()?.total ?? 0}
          </span>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button
              disabled={page() === 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                setRefreshKey((k) => k + 1);
              }}
              style={pageBtnStyle(page() === 1)}
            >
              ← Prev
            </button>
            <span style={{ padding: "6px 12px" }}>
              {page()} / {totalPages()}
            </span>
            <button
              disabled={page() >= totalPages()}
              onClick={() => {
                setPage((p) => Math.min(totalPages(), p + 1));
                setRefreshKey((k) => k + 1);
              }}
              style={pageBtnStyle(page() >= totalPages())}
            >
              Next →
            </button>
          </div>
        </div>
      </Show>

      {/* Confirm dialog */}
      <Show when={confirmDialog()}>
        {(dialog) => (
          <div
            style={{
              position: "fixed",
              inset: 0,
              "background": "rgba(0,0,0,0.7)",
              "backdrop-filter": "blur(4px)",
              "z-index": 1000,
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              padding: "var(--sp-4)",
            }}
            onClick={() => !actionLoading() && setConfirmDialog(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                "background": "var(--tier-1)",
                border: "1px solid var(--hairline)",
                "border-radius": "var(--radius-lg)",
                padding: "var(--sp-6)",
                "max-width": "440px",
                width: "100%",
                "box-shadow": "var(--shadow-xl)",
              }}
            >
              <h3
                style={{
                  "font-size": "1.125rem",
                  "font-weight": "600",
                  margin: "0 0 var(--sp-3) 0",
                  color:
                    dialog().action === "delete"
                      ? "rgb(252, 165, 165)"
                      : "var(--text)",
                }}
              >
                {actionLabel(dialog().action)}
              </h3>
              <p style={{ "font-size": "0.875rem", color: "var(--text-secondary)", "margin-bottom": "var(--sp-4)" }}>
                You are about to perform this action on{" "}
                <strong style={{ color: "var(--text)" }}>
                  {dialog().user.display_name} (@{dialog().user.username})
                </strong>
                .
              </p>
              <p style={{ "font-size": "0.8125rem", color: "var(--text-muted)", "margin-bottom": "var(--sp-5)" }}>
                {actionDescription(dialog().action)}
              </p>
              <div style={{ display: "flex", gap: "var(--sp-3)", "justify-content": "flex-end" }}>
                <button
                  onClick={() => setConfirmDialog(null)}
                  disabled={actionLoading()}
                  style={{
                    padding: "var(--sp-2) var(--sp-4)",
                    "background": "transparent",
                    border: "1px solid var(--hairline-2)",
                    "border-radius": "var(--radius-md)",
                    color: "var(--text-secondary)",
                    "font-size": "0.875rem",
                    "font-weight": "500",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={actionLoading()}
                  style={{
                    padding: "var(--sp-2) var(--sp-4)",
                    "background":
                      dialog().action === "delete"
                        ? "rgb(239, 68, 68)"
                        : dialog().action === "disable"
                          ? "rgb(251, 191, 36)"
                          : "var(--p)",
                    color: "white",
                    border: "none",
                    "border-radius": "var(--radius-md)",
                    "font-size": "0.875rem",
                    "font-weight": "600",
                    cursor: "pointer",
                  }}
                >
                  {actionLoading() ? "Working…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div
            style={{
              position: "fixed",
              bottom: "var(--sp-6)",
              right: "var(--sp-6)",
              "background": t().type === "success" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
              color: "white",
              padding: "var(--sp-3) var(--sp-5)",
              "border-radius": "var(--radius-md)",
              "box-shadow": "var(--shadow-xl)",
              "z-index": 1100,
              "font-size": "0.875rem",
              "font-weight": "500",
              "animation": "fadeInUp 0.2s ease",
            }}
          >
            {t().msg}
          </div>
        )}
      </Show>
    </div>
  );
};

// ─── Style helpers ────────────────────────────────────────────────

function actionBtnStyle(
  variant: "default" | "warning" | "danger",
): Record<string, string> {
  const base: Record<string, string> = {
    "background": "transparent",
    border: "1px solid var(--hairline-2)",
    "border-radius": "var(--radius-sm)",
    padding: "4px 10px",
    "font-size": "0.75rem",
    "font-weight": "500",
    cursor: "pointer",
    "margin-left": "var(--sp-1)",
    transition: "all 0.15s ease",
  };
  if (variant === "warning") {
    return {
      ...base,
      color: "rgb(253, 224, 71)",
      "border-color": "rgba(251, 191, 36, 0.4)",
    };
  }
  if (variant === "danger") {
    return {
      ...base,
      color: "rgb(252, 165, 165)",
      "border-color": "rgba(239, 68, 68, 0.4)",
    };
  }
  return {
    ...base,
    color: "var(--text-secondary)",
  };
}

function pageBtnStyle(disabled: boolean): Record<string, string> {
  return {
    "background": "transparent",
    border: "1px solid var(--hairline-2)",
    "border-radius": "var(--radius-sm)",
    padding: "6px 12px",
    "font-size": "0.8125rem",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? "0.5" : "1",
  };
}

// Avoid unused warning for untrack (used to suppress reactivity warnings)
void untrack;

export default AdminUsersPage;
