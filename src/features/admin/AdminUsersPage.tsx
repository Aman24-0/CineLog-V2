// src/features/admin/AdminUsersPage.tsx
//
// CineLog V2 — Admin Users Page (Phase 9 Chunk 3 — Glass Redesign)
// ---------------------------------------------------------------------
// Full user management surface. Features:
//
//   • Search by username / display name (debounced 300ms)
//   • Filters: auth provider (Google / Email), 2FA status, admin flag
//   • Paginated list (25 per page) — server-side
//   • Bulk operations: multi-select → Disable / Enable / Delete
//   • Per-row quick actions: Disable / Enable / Reset Prefs / Delete
//   • User detail drawer: click any row → slide-in sheet with profile,
//     auth info, activity summary, login history, and admin actions
//   • Confirmation dialogs for every mutation
//   • Toast feedback after each action
//
// RESPONSIVE STRATEGY (mobile-first):
//   • Desktop (≥768px / `md:`): a standard table with columns
//     [checkbox] User · Email · Joined · Vault · 2FA · Status · Actions.
//     Horizontally scrollable only as a last resort.
//   • Mobile (<768px / `md:hidden`): each row becomes a stacked
//     GlassCard. The card shows avatar + name, email, joined date,
//     vault count, 2FA badge, status badge, and a "Details" button
//     that opens the drawer. Bulk checkboxes appear inside each card.
//     No horizontal scrolling — everything is visible by stacking.
//
// STRICT USER-SIDE MAPPING:
//   The four admin actions (disable / enable / delete / reset_preferences)
//   map exactly to the user-side account flows. No dummy actions
//   (no "change password", no "promote admin", no "force sign-out") —
//   those flows don't exist on the user side.
//
// ZERO DUPLICATION:
//   AdminSettingsPage has NO user-management settings (audited in
//   Phase 9 Chunk 3). All user management lives here.

import {
  createSignal,
  createResource,
  Show,
  For,
  type Component
} from "solid-js";
import { untrack } from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassAvatar } from "~/shared/ui/glass/GlassAvatar";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import UserDetailDrawer from "~/features/admin/components/UserDetailDrawer";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { LoadMoreState, MutationButton, ErrorState } from "~/shared/ui/states";
import type { MutationStatus } from "~/shared/ui/states";

// ─── Types ───────────────────────────────────────────────────────

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
  /** Phase 9 Chunk 3 — primary auth provider. */
  provider: "google" | "email" | null;
  /** Phase 9 Chunk 3 — whether the user has ≥1 verified MFA factor. */
  twofa_enabled: boolean | null;
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

interface BulkConfirmState {
  action: "disable" | "enable" | "delete";
  count: number;
}

type FilterValue = "all" | "google" | "email";
type TwofaFilterValue = "all" | "enabled" | "disabled";
type AdminFilterValue = "all" | "true" | "false";

const PAGE_SIZE = 25;

// ─── Component ───────────────────────────────────────────────────

const AdminUsersPage: Component = () => {
  const { admin: currentAdmin } = useAdminAuth();

  const [search, setSearch] = createSignal("");
  const [providerFilter, setProviderFilter] = createSignal<FilterValue>("all");
  const [twofaFilter, setTwofaFilter] = createSignal<TwofaFilterValue>("all");
  const [adminFilter, setAdminFilter] = createSignal<AdminFilterValue>("all");
  const [page, setPage] = createSignal(1);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [confirmDialog, setConfirmDialog] =
    createSignal<ConfirmDialogState | null>(null);
  const [actionStatus, setActionStatus] = createSignal<MutationStatus>("idle");
  // Search loading state — true while debounced search is pending.
  const [searchPending, setSearchPending] = createSignal(false);

  // Bulk mode (Phase 6 Part 3 — Task 4, restyled in Chunk 3).
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(
    new Set<string>()
  );
  const [bulkMode, setBulkMode] = createSignal(false);
  const [bulkConfirm, setBulkConfirm] = createSignal<BulkConfirmState | null>(
    null
  );
  const [bulkStatus, setBulkStatus] = createSignal<MutationStatus>("idle");
  const bulkLoading = () => bulkStatus() === "submitting";

  // Drawer (Phase 9 Chunk 3).
  const [drawerUserId, setDrawerUserId] = createSignal<string | null>(null);

  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  // Debounced search — 300ms, resets to page 1.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  const debouncedSearch = (val: string) => {
    clearTimeout(searchDebounce);
    setSearchPending(true);
    searchDebounce = setTimeout(() => {
      setSearch(val);
      setPage(1);
      setRefreshKey((k) => k + 1);
      setSearchPending(false);
    }, 300);
  };

  // Filter change handler — resets to page 1 + refetches.
  const applyFilter = <T,>(
    setter: (v: T) => void,
    value: T
  ) => {
    setter(value);
    setPage(1);
    setSelectedIds(new Set<string>());
    setRefreshKey((k) => k + 1);
  };

  const fetchUsers = async (): Promise<ListUsersResponse> => {
    const params = new URLSearchParams({
      page: page().toString(),
      limit: PAGE_SIZE.toString()
    });
    if (search()) params.set("search", search());
    if (providerFilter() !== "all")
      params.set("provider", providerFilter());
    if (twofaFilter() !== "all") params.set("twofa", twofaFilter());
    if (adminFilter() !== "all") params.set("admin", adminFilter());

    const resp = await fetch(`/api/admin/users?${params}`, {
      credentials: "include"
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

  // createResource keyed on refreshKey — re-fetches when refreshKey
  // changes (search, filter, page, or post-mutation refresh).
  // eslint-disable-next-line solid/reactivity
  const [users] = createResource(refreshKey, fetchUsers);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Single-user action ─────────────────────────────────────
  const handleAction = async () => {
    const dialog = confirmDialog();
    if (!dialog) return;

    setActionStatus("submitting");
    try {
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dialog.user.id,
          action: dialog.action
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || `Failed: ${resp.status}`, "error");
        setActionStatus("error");
      } else {
        const actionLabels: Record<string, string> = {
          disable: "User disabled",
          enable: "User enabled",
          delete: "User deleted",
          reset_preferences: "Preferences reset"
        };
        showToast(
          actionLabels[dialog.action] || "Action complete",
          "success"
        );
        setActionStatus("success");
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
      setActionStatus("error");
    } finally {
      // Delay closing dialog briefly so user sees success state
      if (actionStatus() === "success") {
        setTimeout(() => {
          setConfirmDialog(null);
          setActionStatus("idle");
        }, 800);
      } else if (actionStatus() !== "submitting") {
        // Keep dialog open on error so user can retry
        // but reset to idle so the button is re-clickable
      }
    }
  };

  // ─── Bulk operations ────────────────────────────────────────
  const toggleRowSelection = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const visible = (users()?.users ?? []).filter(
      (u) => !u.is_admin && !u.deleted_at
    );
    setSelectedIds(new Set<string>(visible.map((u) => u.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set<string>());
  };

  const enterBulkMode = () => {
    setBulkMode(true);
    setSelectedIds(new Set<string>());
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set<string>());
    setBulkConfirm(null);
  };

  const handleBulkAction = async () => {
    const dialog = bulkConfirm();
    if (!dialog) return;

    setBulkStatus("submitting");
    try {
      const ids = Array.from(selectedIds());
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          action: dialog.action
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || `Failed: ${resp.status}`, "error");
        setBulkStatus("error");
      } else {
        const applied: number = body.applied ?? 0;
        const skipped: number = body.skipped ?? 0;
        const errors: Array<{ id: string; error: string }> =
          body.errors ?? [];
        if (errors.length === 0 && skipped === 0) {
          showToast(
            `${applied} user${applied === 1 ? "" : "s"} ${dialog.action}d.`,
            "success"
          );
        } else {
          showToast(
            `${applied} done, ${skipped} skipped, ${errors.length} failed.`,
            applied > 0 ? "success" : "error"
          );
        }
        setBulkStatus("success");
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      showToast(msg, "error");
      setBulkStatus("error");
    } finally {
      if (bulkStatus() === "success") {
        setTimeout(() => {
          setBulkConfirm(null);
          setBulkStatus("idle");
          exitBulkMode();
        }, 800);
      }
    }
  };

  // ─── Helpers ────────────────────────────────────────────────
  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    );
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
      reset_preferences: "Reset Preferences"
    };
    return map[action] || action;
  };

  const actionDescription = (action: string): string => {
    const map: Record<string, string> = {
      disable:
        "The user will be signed out and unable to log in until re-enabled.",
      enable: "The user will be able to log in again.",
      delete:
        "Soft-delete — the user's profile and data are retained but hidden.",
      reset_preferences:
        "All user preferences (theme, language, etc.) will be reset to defaults."
    };
    return map[action] || "";
  };

  // ─── Status badge for a row ─────────────────────────────────
  const rowStatus = (
    user: UserRow
  ): { intent: "danger" | "warning" | "info" | "success"; icon: string; label: string } => {
    if (user.deleted_at)
      return { intent: "danger", icon: "cancel", label: "Deleted" };
    if (user.admin_disabled_at)
      return { intent: "warning", icon: "block", label: "Disabled" };
    if (user.is_admin)
      return { intent: "info", icon: "shield_person", label: "Admin" };
    return { intent: "success", icon: "check_circle", label: "Active" };
  };

  const providerBadge = (user: UserRow) => {
    if (user.provider === "google")
      return (
        <GlassBadge intent="primary" icon="login" label="Google" size="compact" glass />
      );
    if (user.provider === "email")
      return (
        <GlassBadge intent="default" icon="mail" label="Email" size="compact" />
      );
    return (
      <GlassBadge intent="default" icon="help" label="Unknown" size="compact" />
    );
  };

  const twofaBadge = (user: UserRow) => {
    if (user.twofa_enabled === true)
      return (
        <GlassBadge intent="success" icon="lock" label="2FA" size="compact" />
      );
    if (user.twofa_enabled === false)
      return (
        <GlassBadge intent="default" icon="lock_open" label="No 2FA" size="compact" />
      );
    return (
      <GlassBadge intent="default" icon="help" label="2FA?" size="compact" />
    );
  };

  // ─── Select control (native <select> styled with glass tokens) ──
  const FilterSelect = <T extends string>(props: {
    value: T;
    onChange: (v: T) => void;
    label: string;
    options: Array<{ value: T; label: string }>;
  }) => {
    return (
      <div class="flex w-full flex-col gap-1 sm:w-auto">
        <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
          {props.label}
        </label>
        <select
          value={props.value}
          onChange={(e) =>
            applyFilter(props.onChange, e.currentTarget.value as T)
          }
          class="h-11 w-full rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl transition-all duration-base ease-standard focus:border-primary focus:bg-glass-strong focus:shadow-glow focus:outline-none sm:w-40"
          style={{ "box-shadow": "var(--glass-default-shadow), var(--glass-highlight)" }}
        >
          <For each={props.options}>
            {(opt) => (
              <option value={opt.value} class="bg-tier-2 text-text-strong">
                {opt.label}
              </option>
            )}
          </For>
        </select>
      </div>
    );
  };

  return (
    <div class="flex flex-col gap-5">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header class="flex flex-col gap-1">
        <h1 class="m-0 text-xl font-bold text-text-strong sm:text-2xl">
          User Management
        </h1>
        <p class="m-0 text-sm text-text-muted">
          Search, view, and manage user accounts. Click a row for full details.
        </p>
      </header>

      {/* ─── Filter bar ─────────────────────────────────────── */}
      <GlassCard padding="default" class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div class="relative flex-1">
            <GlassInput
              type="text"
              icon="search"
              placeholder="Search by username or display name…"
              onInput={(e) => debouncedSearch(e.currentTarget.value)}
            />
            <Show when={searchPending()}>
              <span
                class="absolute right-3 top-1/2 inline-block h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent"
                aria-hidden="true"
                role="status"
              />
            </Show>
          </div>
          <FilterSelect<FilterValue>
            value={providerFilter()}
            onChange={(v) => applyFilter(setProviderFilter, v)}
            label="Provider"
            options={[
              { value: "all", label: "All providers" },
              { value: "google", label: "Google" },
              { value: "email", label: "Email" }
            ]}
          />
          <FilterSelect<TwofaFilterValue>
            value={twofaFilter()}
            onChange={(v) => applyFilter(setTwofaFilter, v)}
            label="2FA"
            options={[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Not enabled" }
            ]}
          />
          <FilterSelect<AdminFilterValue>
            value={adminFilter()}
            onChange={(v) => applyFilter(setAdminFilter, v)}
            label="Role"
            options={[
              { value: "all", label: "All roles" },
              { value: "true", label: "Admins" },
              { value: "false", label: "Non-admins" }
            ]}
          />
        </div>

        {/* Bulk mode toggle */}
        <div class="flex items-center justify-between gap-2">
          <Show
            when={!bulkMode()}
            fallback={
              <GlassButton
                variant="glass"
                size="compact"
                icon="close"
                onClick={exitBulkMode}
              >
                Exit bulk mode
              </GlassButton>
            }
          >
            <GlassButton
              variant="secondary"
              size="compact"
              icon="check_box"
              onClick={enterBulkMode}
            >
              Bulk actions
            </GlassButton>
          </Show>
          <span class="text-xs text-text-muted">
            <Show when={users()}>
              {(u) => <>{u().total.toLocaleString()} total</>}
            </Show>
          </span>
        </div>
      </GlassCard>

      {/* ─── Bulk action bar ────────────────────────────────── */}
      <Show when={bulkMode() && selectedIds().size > 0}>
        <GlassCard padding="compact" variant="glass-strong">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-text-strong">
              {selectedIds().size} selected
            </span>
            <GlassButton variant="glass" size="compact" onClick={selectAllVisible}>
              Select all visible
            </GlassButton>
            <GlassButton variant="glass" size="compact" onClick={deselectAll}>
              Deselect all
            </GlassButton>
            <div class="flex-1" />
            <GlassButton
              variant="secondary"
              size="compact"
              icon="block"
              onClick={() =>
                setBulkConfirm({
                  action: "disable",
                  count: selectedIds().size
                })
              }
              disabled={bulkLoading()}
            >
              Disable ({selectedIds().size})
            </GlassButton>
            <GlassButton
              variant="primary"
              size="compact"
              icon="check_circle"
              onClick={() =>
                setBulkConfirm({
                  action: "enable",
                  count: selectedIds().size
                })
              }
              disabled={bulkLoading()}
            >
              Enable ({selectedIds().size})
            </GlassButton>
            <GlassButton
              variant="danger"
              size="compact"
              icon="delete"
              onClick={() =>
                setBulkConfirm({
                  action: "delete",
                  count: selectedIds().size
                })
              }
              disabled={bulkLoading()}
            >
              Delete ({selectedIds().size})
            </GlassButton>
          </div>
        </GlassCard>
      </Show>

      {/* ─── Loading / error / empty states ─────────────────── */}
      <Show when={users.loading && !users()}>
        <GlassCard padding="comfortable">
          <GlassLoadingState message="Loading users…" class="!py-8" />
        </GlassCard>
      </Show>

      <Show when={users.error}>
        <ErrorState
          title="Failed to load users"
          message={String(users.error?.message ?? users.error)}
          variant="section"
          onRetry={() => setRefreshKey((k) => k + 1)}
        />
      </Show>

      <Show
        when={
          !users.loading && !users.error && (users()?.users.length ?? 0) === 0
        }
      >
        <GlassEmptyState
          icon="group_off"
          title="No users found"
          message="Try adjusting your search or filters."
          variant="default"
          surface
        />
      </Show>

      {/* ─── Desktop table (≥768px) ─────────────────────────── */}
      <Show when={!users.loading && !users.error && (users()?.users.length ?? 0) > 0}>
        <GlassCard padding="none" class="hidden md:block">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="border-b border-glass-border bg-glass-strong text-left">
                  <Show when={bulkMode()}>
                    <th class="w-10 px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        class="h-4 w-4 cursor-pointer"
                        checked={
                          selectedIds().size > 0 &&
                          (users()?.users ?? []).every(
                            (u) =>
                              u.is_admin ||
                              u.deleted_at ||
                              selectedIds().has(u.id)
                          )
                        }
                        onChange={() => {
                          const allVisibleSelected = (users()?.users ?? []).every(
                            (u) =>
                              u.is_admin ||
                              u.deleted_at ||
                              selectedIds().has(u.id)
                          );
                          if (allVisibleSelected) {
                            deselectAll();
                          } else {
                            selectAllVisible();
                          }
                        }}
                        aria-label="Select all visible users"
                      />
                    </th>
                  </Show>
                  <th class="px-4 py-3 font-semibold text-text-secondary">User</th>
                  <th class="px-4 py-3 font-semibold text-text-secondary">Email</th>
                  <th class="px-4 py-3 font-semibold text-text-secondary">Joined</th>
                  <th class="px-4 py-3 font-semibold text-text-secondary">Vault</th>
                  <th class="px-4 py-3 font-semibold text-text-secondary">2FA</th>
                  <th class="px-4 py-3 font-semibold text-text-secondary">Status</th>
                  <th class="px-4 py-3 text-right font-semibold text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={users()?.users ?? []}>
                  {(user) => {
                    const status = rowStatus(user);
                    return (
                      <tr
                        class="border-b border-glass-border transition-colors duration-base hover:bg-glass-strong"
                        classList={{
                          "bg-primary-dim": selectedIds().has(user.id)
                        }}
                      >
                        <Show when={bulkMode()}>
                          <td class="px-2 py-3 text-center">
                            <Show
                              when={!user.is_admin && !user.deleted_at}
                              fallback={<span class="text-text-muted">—</span>}
                            >
                              <input
                                type="checkbox"
                                class="h-4 w-4 cursor-pointer"
                                checked={selectedIds().has(user.id)}
                                onChange={() => toggleRowSelection(user.id)}
                                aria-label={`Select ${user.display_name}`}
                              />
                            </Show>
                          </td>
                        </Show>
                        {/* Clickable user cell opens the drawer */}
                        <td class="px-4 py-3">
                          <button
                            type="button"
                            class="flex cursor-pointer items-center gap-3 bg-transparent p-0 text-left"
                            onClick={() => setDrawerUserId(user.id)}
                          >
                            <GlassAvatar
                              src={user.avatar_url}
                              name={user.display_name}
                              size="sm"
                            />
                            <div class="flex flex-col">
                              <span class="font-medium text-text-strong">
                                {user.display_name}
                              </span>
                              <span class="text-xs text-text-muted">
                                @{user.username}
                              </span>
                            </div>
                          </button>
                        </td>
                        <td class="px-4 py-3 text-text-secondary">
                          {user.email || (
                            <span class="text-text-muted">—</span>
                          )}
                        </td>
                        <td class="whitespace-nowrap px-4 py-3 text-text-secondary">
                          {formatDate(user.created_at)}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">
                          {user.vault_count}
                        </td>
                        <td class="px-4 py-3">{twofaBadge(user)}</td>
                        <td class="px-4 py-3">
                          <GlassBadge
                            intent={status.intent}
                            icon={status.icon}
                            label={status.label}
                            size="compact"
                          />
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center justify-end gap-1">
                            <Show when={!user.is_admin}>
                              <Show
                                when={!user.deleted_at && !user.admin_disabled_at}
                              >
                                <GlassButton
                                  variant="glass"
                                  size="compact"
                                  onClick={() =>
                                    setConfirmDialog({ user, action: "disable" })
                                  }
                                >
                                  Disable
                                </GlassButton>
                              </Show>
                              <Show when={!user.deleted_at && user.admin_disabled_at}>
                                <GlassButton
                                  variant="glass"
                                  size="compact"
                                  onClick={() =>
                                    setConfirmDialog({ user, action: "enable" })
                                  }
                                >
                                  Enable
                                </GlassButton>
                              </Show>
                              <Show when={!user.deleted_at}>
                                <GlassButton
                                  variant="glass"
                                  size="compact"
                                  onClick={() =>
                                    setConfirmDialog({
                                      user,
                                      action: "reset_preferences"
                                    })
                                  }
                                >
                                  Reset Prefs
                                </GlassButton>
                              </Show>
                              <Show when={!user.deleted_at}>
                                <GlassButton
                                  variant="danger"
                                  size="compact"
                                  onClick={() =>
                                    setConfirmDialog({ user, action: "delete" })
                                  }
                                >
                                  Delete
                                </GlassButton>
                              </Show>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* ─── Mobile cards (<768px) ──────────────────────────── */}
        <div class="flex flex-col gap-3 md:hidden">
          <For each={users()?.users ?? []}>
            {(user) => {
              const status = rowStatus(user);
              return (
                <GlassCard padding="default" class="flex flex-col gap-3">
                  {/* Top row: checkbox (bulk mode) + avatar + name + status */}
                  <div class="flex items-start gap-3">
                    <Show when={bulkMode()}>
                      <div class="pt-1">
                        <Show
                          when={!user.is_admin && !user.deleted_at}
                          fallback={<span class="text-text-muted">—</span>}
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 cursor-pointer"
                            checked={selectedIds().has(user.id)}
                            onChange={() => toggleRowSelection(user.id)}
                            aria-label={`Select ${user.display_name}`}
                          />
                        </Show>
                      </div>
                    </Show>
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 bg-transparent p-0 text-left"
                      onClick={() => setDrawerUserId(user.id)}
                    >
                      <GlassAvatar
                        src={user.avatar_url}
                        name={user.display_name}
                        size="md"
                      />
                      <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate font-medium text-text-strong">
                          {user.display_name}
                        </span>
                        <span class="truncate text-xs text-text-muted">
                          @{user.username}
                        </span>
                        <Show when={user.email}>
                          <span class="truncate text-xs text-text-soft">
                            {user.email}
                          </span>
                        </Show>
                      </div>
                    </button>
                    <GlassBadge
                      intent={status.intent}
                      icon={status.icon}
                      label={status.label}
                      size="compact"
                    />
                  </div>

                  {/* Metadata grid */}
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="flex flex-col gap-0.5">
                      <span class="font-semibold uppercase tracking-wide text-text-soft">
                        Joined
                      </span>
                      <span class="text-text-secondary">
                        {formatDate(user.created_at)}
                      </span>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="font-semibold uppercase tracking-wide text-text-soft">
                        Vault
                      </span>
                      <span class="text-text-secondary">
                        {user.vault_count} entries
                      </span>
                    </div>
                  </div>

                  {/* Badges row */}
                  <div class="flex flex-wrap items-center gap-2">
                    {providerBadge(user)}
                    {twofaBadge(user)}
                  </div>

                  {/* Actions */}
                  <Show when={!user.is_admin}>
                    <div class="flex flex-wrap gap-2 border-t border-glass-border pt-2">
                      <Show
                        when={!user.deleted_at && !user.admin_disabled_at}
                      >
                        <GlassButton
                          variant="glass"
                          size="compact"
                          icon="block"
                          onClick={() =>
                            setConfirmDialog({ user, action: "disable" })
                          }
                        >
                          Disable
                        </GlassButton>
                      </Show>
                      <Show when={!user.deleted_at && user.admin_disabled_at}>
                        <GlassButton
                          variant="glass"
                          size="compact"
                          icon="check_circle"
                          onClick={() =>
                            setConfirmDialog({ user, action: "enable" })
                          }
                        >
                          Enable
                        </GlassButton>
                      </Show>
                      <Show when={!user.deleted_at}>
                        <GlassButton
                          variant="glass"
                          size="compact"
                          icon="restart_alt"
                          onClick={() =>
                            setConfirmDialog({
                              user,
                              action: "reset_preferences"
                            })
                          }
                        >
                          Reset Prefs
                        </GlassButton>
                      </Show>
                      <Show when={!user.deleted_at}>
                        <GlassButton
                          variant="danger"
                          size="compact"
                          icon="delete"
                          onClick={() =>
                            setConfirmDialog({ user, action: "delete" })
                          }
                        >
                          Delete
                        </GlassButton>
                      </Show>
                    </div>
                  </Show>
                </GlassCard>
              );
            }}
          </For>
        </div>
      </Show>

      {/* ─── Pagination (LoadMoreState) ────────────────────── */}
      <Show when={users()}>
        <LoadMoreState
          loading={users.loading}
          hasMore={page() < totalPages()}
          error={users.error ? String(users.error?.message ?? users.error) : null}
          onLoadMore={() => {
            setPage((p) => p + 1);
            setRefreshKey((k) => k + 1);
          }}
          onRetry={() => setRefreshKey((k) => k + 1)}
          endMessage={`Showing all ${users()?.total ?? 0} users`}
        />
      </Show>

      {/* ─── Single-user confirm dialog ─────────────────────── */}
      <Show when={confirmDialog()}>
        {(dialog) => (
          <div
            class="fixed inset-0 z-[999990] flex items-center justify-center p-4"
            style={{
              background: "rgba(0,0,0,0.70)",
              "backdrop-filter": "blur(20px) saturate(140%)",
              "-webkit-backdrop-filter": "blur(20px) saturate(140%)"
            }}
            onClick={() => actionStatus() !== "submitting" && (setConfirmDialog(null), setActionStatus("idle"))}
          >
            <GlassCard
              padding="comfortable"
              variant="glass-strong"
              class="w-full max-w-md"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <h3
                class="m-0 mb-3 text-lg font-semibold"
                classList={{
                  "text-danger": dialog().action === "delete",
                  "text-text-strong": dialog().action !== "delete"
                }}
              >
                {actionLabel(dialog().action)}
              </h3>
              <p class="m-0 mb-4 text-sm text-text-secondary">
                You are about to perform this action on{" "}
                <strong class="text-text-strong">
                  {dialog().user.display_name} (@{dialog().user.username})
                </strong>
                .
              </p>
              <p class="m-0 mb-5 text-xs text-text-muted">
                {actionDescription(dialog().action)}
              </p>
              <div class="flex justify-end gap-3">
                <GlassButton
                  variant="glass"
                  size="compact"
                  onClick={() => { setConfirmDialog(null); setActionStatus("idle"); }}
                  disabled={actionStatus() === "submitting"}
                >
                  Cancel
                </GlassButton>
                <MutationButton
                  status={actionStatus()}
                  onClick={handleAction}
                  idleLabel="Confirm"
                  submittingLabel="Working…"
                  successLabel="Done!"
                  errorLabel="Failed"
                  variant={dialog().action === "delete" ? "danger" : "primary"}
                />
              </div>
            </GlassCard>
          </div>
        )}
      </Show>

      {/* ─── Bulk confirm dialog ────────────────────────────── */}
      <Show when={bulkConfirm()}>
        {(dialog) => (
          <div
            class="fixed inset-0 z-[999990] flex items-center justify-center p-4"
            style={{
              background: "rgba(0,0,0,0.70)",
              "backdrop-filter": "blur(20px) saturate(140%)",
              "-webkit-backdrop-filter": "blur(20px) saturate(140%)"
            }}
            onClick={() => !bulkLoading() && (setBulkConfirm(null), setBulkStatus("idle"))}
          >
            <GlassCard
              padding="comfortable"
              variant="glass-strong"
              class="w-full max-w-md"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <h3
                class="m-0 mb-3 text-lg font-semibold"
                classList={{
                  "text-danger": dialog().action === "delete",
                  "text-warning": dialog().action === "disable",
                  "text-text-strong":
                    dialog().action !== "delete" && dialog().action !== "disable"
                }}
              >
                Bulk {dialog().action} {dialog().count} user
                {dialog().count === 1 ? "" : "s"}?
              </h3>
              <p class="m-0 mb-4 text-sm text-text-secondary">
                {dialog().action === "delete"
                  ? "This will soft-delete all selected users. Their profiles will be hidden but retained for the retention period."
                  : dialog().action === "disable"
                    ? "Selected users will be signed out and unable to log in until re-enabled."
                    : "Selected users will be able to log in again."}
              </p>
              <p class="m-0 mb-5 text-xs text-text-muted">
                Self-action and admin-targets are automatically skipped.
                Each successful mutation is recorded in the audit trail.
              </p>
              <div class="flex justify-end gap-3">
                <GlassButton
                  variant="glass"
                  size="compact"
                  onClick={() => { setBulkConfirm(null); setBulkStatus("idle"); }}
                  disabled={bulkLoading()}
                >
                  Cancel
                </GlassButton>
                <MutationButton
                  status={bulkStatus()}
                  onClick={handleBulkAction}
                  idleLabel={`Confirm ${dialog().action} (${dialog().count})`}
                  submittingLabel="Working…"
                  successLabel="Done!"
                  errorLabel="Failed"
                  variant={
                    dialog().action === "delete"
                      ? "danger"
                      : dialog().action === "disable"
                        ? "ghost"
                        : "primary"
                  }
                />
              </div>
            </GlassCard>
          </div>
        )}
      </Show>

      {/* ─── User detail drawer ─────────────────────────────── */}
      <UserDetailDrawer
        userId={drawerUserId()}
        currentAdminId={currentAdmin()?.id ?? null}
        onClose={() => setDrawerUserId(null)}
        onMutated={() => setRefreshKey((k) => k + 1)}
      />

      {/* ─── Toast ──────────────────────────────────────────── */}
      <Show when={toast()}>
        {(t) => (
          <div
            class="fixed bottom-6 right-6 z-[999995] rounded-md px-5 py-3 text-sm font-medium text-on-primary shadow-xl"
            style={{
              background:
                t().type === "success" ? "var(--success, #22c55e)" : "var(--danger, #ef4444)"
            }}
          >
            {t().msg}
          </div>
        )}
      </Show>
    </div>
  );
};

// Avoid unused warning for untrack (kept for potential future use;
// the original file used it to suppress a reactivity warning).
void untrack;

export default AdminUsersPage;
