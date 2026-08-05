// src/features/admin/components/UserDetailDrawer.tsx
//
// CineLog V2 — Admin User Detail Drawer (Phase 9 Chunk 3)
// ---------------------------------------------------------------------
// Slide-in drawer that opens when an admin clicks a user row on the
// Users page. Renders four stacked sections:
//
//   1. Profile        — avatar, display name, @username, email, bio,
//                        country, joined date
//   2. Auth           — linked identities (provider chips), 2FA status
//                        with factor list
//   3. Activity       — vault count, collections count, ratings count
//   4. Login history  — last 10 logins (date, IP, user agent)
//
// Admin actions live in a sticky footer:
//   • Disable / Enable  (toggle based on current state)
//   • Reset Preferences
//   • Delete            (soft-delete)
//
// Self-action and admin-target safeguards are enforced server-side
// (the API returns an error). We also disable the buttons client-side
// for admins and the current admin themselves to give immediate
// feedback.
//
// DATA SOURCE:
//   GET /api/admin/users?id=<userId> — returns the UserDetail object.
//   Re-fetched every time the drawer opens for a new user, and again
//   after any successful action (so the admin sees the new state
//   without a full page reload).
//
// RESPONSIVE:
//   Uses <GlassSheet snap="tall"> so on mobile it's a near-full-height
//   bottom sheet and on desktop it's a centered tall sheet. All
//   internal sections stack to 1 column on mobile.
//
// STRICT USER-SIDE MAPPING:
//   The drawer only shows fields that exist on the user side. The
//   admin actions (disable/enable/delete/reset_preferences) map
//   exactly to the user-side account flows:
//     • disable   → user is signed out + blocked from logging in
//     • enable    → user can log in again
//     • delete    → soft-delete (profile hidden, retained for the
//                   retention period — same as user self-delete)
//     • reset_preferences → clears the user_preferences table
//   No dummy actions (no "change password", no "promote to admin",
//   no "force sign-out" — none of those flows exist on the user side
//   and adding them would violate the Phase 9 zero-duplication rule).

import {
  createSignal,
  createEffect,
  Show,
  For,
  type Component,
  type JSX
} from "solid-js";
import { GlassSheet } from "~/shared/ui/glass/GlassSheet";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassAvatar } from "~/shared/ui/glass/GlassAvatar";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";

// ─── Types ───────────────────────────────────────────────────────
//
// These mirror the shapes returned by GET /api/admin/users?id=<uuid>.
// Kept local to this file so the drawer is self-contained and doesn't
// create a coupling between the API response shape and the rest of
// the admin features.

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
  provider: "google" | "email" | null;
  twofa_enabled: boolean | null;
}

interface UserIdentity {
  provider: string;
  identity_id: string;
}

interface MfaFactor {
  id: string;
  factor_type: string;
  friendly_name: string | null;
  status: string;
}

interface LoginHistoryEntry {
  id: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface UserDetail {
  user: UserRow;
  bio: string | null;
  identities: UserIdentity[];
  mfa_factors: MfaFactor[];
  collections_count: number;
  ratings_count: number;
  login_history: LoginHistoryEntry[];
}

// ─── Props ───────────────────────────────────────────────────────

export interface UserDetailDrawerProps {
  /** The id of the user to show. When non-null the drawer opens and
   *  fetches that user's detail. When null the drawer closes. */
  userId: string | null;
  /** The id of the currently-signed-in admin — used to disable
   *  self-action buttons client-side (the server enforces this too). */
  currentAdminId: string | null;
  /** Called when the user dismisses the drawer (backdrop tap, ESC,
   *  close button). */
  onClose: () => void;
  /** Called after a successful mutation — the parent should refresh
   *  its user list so the row reflects the new state. */
  onMutated: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatUserAgent(ua: string | null): string {
  if (!ua) return "—";
  // Shorten long UA strings to a readable device/browser summary.
  // This is a naive parser — good enough for an admin glance.
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  return `${browser} · ${os}`;
}

/** Map a raw provider string to a human label + icon. Only "google"
 *  and "email" are real on the user side; anything else is shown
 *  verbatim with a generic icon. */
function providerLabel(p: string): { label: string; icon: string } {
  if (p === "google") return { label: "Google", icon: "login" };
  if (p === "email") return { label: "Email / Password", icon: "mail" };
  return { label: p, icon: "login" };
}

// ─── Component ───────────────────────────────────────────────────

const UserDetailDrawer: Component<UserDetailDrawerProps> = (props) => {
  const [detail, setDetail] = createSignal<UserDetail | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Per-action confirmation + loading state. The drawer uses inline
  // confirmations (a small "Are you sure?" row appears above the
  // action button) rather than a separate modal — keeps the flow
  // fast and avoids stacking two overlays.
  const [pendingAction, setPendingAction] = createSignal<
    "disable" | "enable" | "delete" | "reset_preferences" | null
  >(null);
  const [actionLoading, setActionLoading] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const body = (await resp.json()) as { user: UserDetail };
      setDetail(body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch whenever the target userId changes (drawer opened for a
  // new user). Also resets transient state when the drawer closes so
  // the next open doesn't flash the previous user's data.
  let lastFetchedId: string | null = null;
  createEffect(() => {
    const id = props.userId;
    if (id) {
      if (id !== lastFetchedId) {
        lastFetchedId = id;
        void fetchDetail(id);
      }
    } else {
      lastFetchedId = null;
      setDetail(null);
      setError(null);
      setPendingAction(null);
      setActionError(null);
    }
  });

  const user = (): UserRow | null => detail()?.user ?? null;

  // Can the admin act on this user? Disabled for self + other admins.
  const canAct = (): boolean => {
    const u = user();
    if (!u) return false;
    if (u.is_admin) return false;
    if (props.currentAdminId && u.id === props.currentAdminId) return false;
    if (u.deleted_at) return false;
    return true;
  };

  const handleAction = async (
    action: "disable" | "enable" | "delete" | "reset_preferences"
  ) => {
    const u = user();
    if (!u) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, action })
      });
      const body = (await resp.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!resp.ok || body.error) {
        setActionError(body.error ?? `Failed: ${resp.status}`);
      } else {
        const labels: Record<string, string> = {
          disable: "User disabled",
          enable: "User enabled",
          delete: "User deleted",
          reset_preferences: "Preferences reset"
        };
        showToast(labels[action] ?? "Action complete");
        setPendingAction(null);
        props.onMutated();
        // Re-fetch the detail so the drawer reflects the new state.
        // For delete, the user is now soft-deleted — keep the drawer
        // open so the admin sees the DELETED badge, then they close
        // it manually.
        void fetchDetail(u.id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Section renderers ──────────────────────────────────────

  const renderProfile = (): JSX.Element => {
    const u = user()!;
    return (
      <GlassCard padding="comfortable" class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <GlassAvatar
            src={u.avatar_url}
            name={u.display_name}
            size="xl"
          />
          <div class="flex min-w-0 flex-col gap-1">
            <h3 class="m-0 truncate text-lg font-bold text-text-strong">
              {u.display_name}
            </h3>
            <p class="m-0 truncate text-sm text-text-muted">@{u.username}</p>
            <Show when={u.email}>
              <p class="m-0 truncate text-xs text-text-soft">{u.email}</p>
            </Show>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Country
            </span>
            <span class="text-text-secondary">
              {u.country || "—"}
            </span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Joined
            </span>
            <span class="text-text-secondary">{formatDate(u.created_at)}</span>
          </div>
        </div>
        <Show when={detail()?.bio}>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Bio
            </span>
            <p class="m-0 text-sm leading-relaxed text-text-secondary">
              {detail()!.bio}
            </p>
          </div>
        </Show>
        {/* Status badges */}
        <div class="flex flex-wrap gap-2">
          <Show when={u.deleted_at}>
            <GlassBadge intent="danger" icon="cancel" label="Deleted" size="compact" />
          </Show>
          <Show when={!u.deleted_at && u.admin_disabled_at}>
            <GlassBadge intent="warning" icon="block" label="Disabled" size="compact" />
          </Show>
          <Show when={!u.deleted_at && !u.admin_disabled_at && u.is_admin}>
            <GlassBadge intent="info" icon="shield_person" label="Admin" size="compact" />
          </Show>
          <Show when={!u.deleted_at && !u.admin_disabled_at && !u.is_admin}>
            <GlassBadge intent="success" icon="check_circle" label="Active" size="compact" />
          </Show>
          <Show when={u.scheduled_deletion_at}>
            <GlassBadge intent="danger" icon="schedule" label="Purge scheduled" size="compact" />
          </Show>
        </div>
      </GlassCard>
    );
  };

  const renderAuth = (): JSX.Element => {
    const d = detail()!;
    const u = d.user;
    return (
      <GlassCard padding="comfortable" class="flex flex-col gap-4">
        <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Authentication
        </h3>

        {/* Linked identities */}
        <div class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Linked providers
          </span>
          <Show
            when={d.identities.length > 0}
            fallback={
              <span class="text-sm text-text-muted">
                No identities found
              </span>
            }
          >
            <div class="flex flex-wrap gap-2">
              <For each={d.identities}>
                {(id) => {
                  const p = providerLabel(id.provider);
                  return (
                    <GlassBadge
                      intent="primary"
                      icon={p.icon}
                      label={p.label}
                      size="default"
                      glass
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* 2FA status */}
        <div class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Two-factor authentication
          </span>
          <div class="flex items-center gap-2">
            <Show when={u.twofa_enabled === true}>
              <GlassBadge intent="success" icon="lock" label="Enabled" size="default" />
            </Show>
            <Show when={u.twofa_enabled === false}>
              <GlassBadge intent="default" icon="lock_open" label="Not enabled" size="default" />
            </Show>
            <Show when={u.twofa_enabled === null}>
              <GlassBadge intent="default" icon="help" label="Unknown" size="default" />
            </Show>
          </div>
          <Show when={d.mfa_factors.length > 0}>
            <ul class="m-0 flex flex-col gap-1 p-0">
              <For each={d.mfa_factors}>
                {(f) => (
                  <li class="flex items-center gap-2 text-xs text-text-muted">
                    <span
                      class="material-symbols-outlined text-sm"
                      style={{
                        "font-variation-settings":
                          "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
                      }}
                      aria-hidden="true"
                    >
                      {f.status === "verified" ? "check_circle" : "pending"}
                    </span>
                    <span class="font-mono">{f.factor_type}</span>
                    <Show when={f.friendly_name}>
                      <span>· {f.friendly_name}</span>
                    </Show>
                    <span class="uppercase">{f.status}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </GlassCard>
    );
  };

  const renderActivity = (): JSX.Element => {
    const d = detail()!;
    return (
      <GlassCard padding="comfortable" class="flex flex-col gap-3">
        <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Activity summary
        </h3>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GlassStatCard
            value={d.user.vault_count.toLocaleString()}
            label="Vault entries"
            icon="bookmark"
            variant="glass"
            size="compact"
          />
          <GlassStatCard
            value={d.collections_count.toLocaleString()}
            label="Collections"
            icon="collections_bookmark"
            variant="glass"
            size="compact"
          />
          <GlassStatCard
            value={d.ratings_count.toLocaleString()}
            label="Ratings given"
            icon="star"
            variant="glass"
            size="compact"
          />
        </div>
        <div class="text-xs text-text-muted">
          Last activity:{" "}
          <span class="font-mono text-text-secondary">
            {formatDate(d.user.last_activity)}
          </span>
        </div>
      </GlassCard>
    );
  };

  const renderLoginHistory = (): JSX.Element => {
    const d = detail()!;
    return (
      <GlassCard padding="comfortable" class="flex flex-col gap-3">
        <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Login history (last 10)
        </h3>
        <Show
          when={d.login_history.length > 0}
          fallback={
            <p class="m-0 text-sm text-text-muted">
              No login history recorded.
            </p>
          }
        >
          <ul class="m-0 flex flex-col gap-2 p-0">
            <For each={d.login_history}>
              {(entry) => (
                <li class="flex flex-col gap-1 rounded-md border border-glass-border bg-glass px-3 py-2 text-xs">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-text-secondary">
                      {formatDate(entry.login_at)}
                    </span>
                    <Show when={entry.ip_address}>
                      <span class="font-mono text-text-soft">
                        {entry.ip_address}
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-1 text-text-muted">
                    <span
                      class="material-symbols-outlined text-sm"
                      aria-hidden="true"
                    >
                      devices
                    </span>
                    <span>{formatUserAgent(entry.user_agent)}</span>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={d.login_history.length > 0 && !d.login_history[0]?.ip_address}>
          <p class="m-0 text-[11px] text-text-soft">
            IP addresses are not captured — logins are recorded client-side
            where the browser cannot read the public IP.
          </p>
        </Show>
      </GlassCard>
    );
  };

  const renderActions = (): JSX.Element => {
    const u = user();
    if (!u) return null;
    const disabled = !canAct();

    return (
      <div class="flex flex-col gap-2 border-t border-glass-border bg-glass-strong px-4 py-3 backdrop-blur-2xl">
        <Show when={actionError()}>
          <div class="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
            {actionError()}
          </div>
        </Show>

        {/* Inline confirmation row */}
        <Show when={pendingAction()}>
          {(action) => (
            <div class="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning sm:flex-row sm:items-center sm:justify-between">
              <span>
                <Show when={action() === "delete"} fallback={`Confirm ${action()}?`}>
                  This will soft-delete the user. Are you sure?
                </Show>
              </span>
              <div class="flex gap-2">
                <GlassButton
                  variant="glass"
                  size="compact"
                  onClick={() => setPendingAction(null)}
                  disabled={actionLoading()}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  variant={action() === "delete" ? "danger" : action() === "disable" ? "secondary" : "primary"}
                  size="compact"
                  onClick={() => handleAction(action())}
                  loading={actionLoading()}
                  disabled={actionLoading()}
                >
                  Confirm
                </GlassButton>
              </div>
            </div>
          )}
        </Show>

        <Show when={!pendingAction()}>
          <div class="flex flex-wrap gap-2">
            <Show when={!u.is_admin && !u.deleted_at && !u.admin_disabled_at}>
              <GlassButton
                variant="secondary"
                size="compact"
                icon="block"
                onClick={() => setPendingAction("disable")}
                disabled={disabled}
              >
                Disable
              </GlassButton>
            </Show>
            <Show when={!u.is_admin && !u.deleted_at && u.admin_disabled_at}>
              <GlassButton
                variant="primary"
                size="compact"
                icon="check_circle"
                onClick={() => setPendingAction("enable")}
                disabled={disabled}
              >
                Enable
              </GlassButton>
            </Show>
            <Show when={!u.is_admin && !u.deleted_at}>
              <GlassButton
                variant="glass"
                size="compact"
                icon="restart_alt"
                onClick={() => setPendingAction("reset_preferences")}
                disabled={disabled}
              >
                Reset Preferences
              </GlassButton>
            </Show>
            <Show when={!u.is_admin && !u.deleted_at}>
              <GlassButton
                variant="danger"
                size="compact"
                icon="delete"
                onClick={() => setPendingAction("delete")}
                disabled={disabled}
              >
                Delete
              </GlassButton>
            </Show>
            <Show when={u.is_admin}>
              <span class="flex items-center text-xs text-text-muted">
                Admin accounts cannot be modified from this panel.
              </span>
            </Show>
            <Show when={u.deleted_at}>
              <span class="flex items-center text-xs text-text-muted">
                This account is deleted — no actions available.
              </span>
            </Show>
          </div>
        </Show>
      </div>
    );
  };

  return (
    <GlassSheet
      open={props.userId !== null}
      onClose={() => props.onClose()}
      snap="tall"
      strength="strong"
      title={user()?.display_name ?? "User details"}
      icon="person"
      class="user-detail-drawer"
    >
      <div class="flex h-full flex-col gap-4 overflow-y-auto pb-2">
        <Show when={loading() && !detail()}>
          <div class="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
            <span
              class="material-symbols-outlined text-base"
              style={{ animation: "softPulse 1.2s ease-in-out infinite" }}
              aria-hidden="true"
            >
              progress_activity
            </span>
            Loading user…
          </div>
        </Show>

        <Show when={error()}>
          <GlassEmptyState
            icon="error"
            title="Failed to load user"
            message={error()!}
            variant="compact"
            surface
          />
        </Show>

        <Show when={detail()}>
          {renderProfile()}
          {renderAuth()}
          {renderActivity()}
          {renderLoginHistory()}
        </Show>
      </div>

      {/* Sticky action footer */}
      <Show when={detail()}>
        {renderActions()}
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        <div class="pointer-events-none fixed bottom-4 left-1/2 z-[999995] -translate-x-1/2 rounded-md bg-success px-4 py-2 text-sm font-medium text-on-primary shadow-xl">
          {toast()}
        </div>
      </Show>
    </GlassSheet>
  );
};

export default UserDetailDrawer;
