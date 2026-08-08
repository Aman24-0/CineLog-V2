// src/features/admin/communication/AnnouncementsPage.tsx
//
// CineLog V2 — Admin Communication Hub: Announcements (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// Glass UI rewrite of the legacy AdminAnnouncementsPage. This is the
// SINGLE place where admin-authored banner / toast / modal messages
// are managed. The legacy route (/admin/announcements) is preserved
// as a redirect to /admin/communication/announcements so existing
// bookmarks keep working.
//
// WHAT'S NEW VS LEGACY:
//   • Glass UI components (GlassCard, GlassButton, GlassInput,
//     GlassBadge, GlassEmptyState, GlassStatCard, GlassModal).
//   • Live preview pane — as the admin types, a mock of how the
//     announcement will appear to users (banner strip, corner
//     toast, or centered modal) is rendered. No backend round-trip.
//   • Dismissal tracking stats — counts of unique dismissals per
//     announcement, sourced from the announcement_dismissals table
//     (Phase 9 Chunk 4 schema). If the table is empty / missing,
//     we surface "—" rather than 0 to make the data state clear.
//   • Mobile-first responsive: header wraps, grid stacks to 1 col,
//     action buttons become full-width on small screens.
//
// BACKEND (unchanged from legacy):
//   GET    /api/admin/announcements
//   POST   /api/admin/announcements
//   PATCH  /api/admin/announcements
//   DELETE /api/admin/announcements?id=<uuid>
//   GET    /api/admin/announcements/dismissals  (NEW — Phase 9 Chunk 4)
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — this is the only page managing announcements.
//     No announcement controls exist on AdminSettingsPage.
//   • Strict user-side mapping — the `target_audience` field maps
//     exactly to the consumer /api/announcements endpoint's audience
//     filter. No fake channels.
//   • No OMDB — only TMDB / Resend / Supabase references appear.

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassModal } from "~/shared/ui/glass/GlassModal";

// ─── Types ───────────────────────────────────────────────────────

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

interface DismissalStats {
  [announcementId: string]: number;
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
  target_audience: "all"
};

// ─── Severity visual config (Material Symbols icons, not emoji) ──

const SEVERITY_CONFIG: Record<
  FormData["severity"],
  { icon: string; intent: "info" | "success" | "warning" | "danger" }
> = {
  info: { icon: "info", intent: "info" },
  success: { icon: "check_circle", intent: "success" },
  warning: { icon: "warning", intent: "warning" },
  error: { icon: "error", intent: "danger" }
};

const TYPE_ICON: Record<FormData["type"], string> = {
  banner: "view_stream",
  toast: "tips_and_updates",
  modal: "dialog"
};

const SEV_BG_CLASS: Record<FormData["severity"], string> = {
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-danger-bg text-danger"
};

const SEV_BORDER_CLASS: Record<FormData["severity"], string> = {
  info: "border-info/30",
  success: "border-success/30",
  warning: "border-warning/30",
  error: "border-danger/30"
};

const SEV_TEXT_CLASS: Record<FormData["severity"], string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger"
};

// ─── Component ───────────────────────────────────────────────────

const AnnouncementsPage: Component = () => {
  const [items, setItems] = createSignal<Announcement[]>([]);
  const [dismissalCounts, setDismissalCounts] = createSignal<DismissalStats>({});
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showDeleted, setShowDeleted] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal<FormData>(emptyForm);
  const [saving, setSaving] = createSignal(false);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  // Aggregate stats for the headline cards.
  const stats = createMemo(() => {
    const list = items().filter((a) => !a.deleted_at);
    const active = list.filter((a) => a.is_active).length;
    const scheduled = list.filter(
      (a) => a.starts_at && new Date(a.starts_at) > new Date()
    ).length;
    const totalDismissals = Object.values(dismissalCounts()).reduce(
      (sum, n) => sum + n,
      0
    );
    return { total: list.length, active, scheduled, totalDismissals };
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ─── Data fetching ──────────────────────────────────────────

  const fetchList = async () => {
    try {
      const resp = await fetch(
        `/api/admin/announcements?include_deleted=${showDeleted() ? "true" : "false"}`,
        { credentials: "include" }
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
      // After the list loads, fetch dismissal counts in parallel.
      void fetchDismissalCounts(data.announcements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch dismissal counts for the loaded announcements. The endpoint
  // returns a map of {announcementId: count}. If the endpoint 404s
  // (table not yet migrated) we silently fall back to "—" — no error
  // toast, because the page is still fully usable without stats.
  const fetchDismissalCounts = async (list: Announcement[]) => {
    if (list.length === 0) {
      setDismissalCounts({});
      return;
    }
    try {
      const resp = await fetch("/api/admin/announcements/dismissals", {
        credentials: "include"
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { counts: DismissalStats };
      setDismissalCounts(data.counts ?? {});
    } catch {
      // Non-fatal — stats are nice-to-have.
    }
  };

  onMount(fetchList);

  // ─── CRUD helpers ──────────────────────────────────────────

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
      target_audience: a.target_audience
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
        starts_at: form().starts_at
          ? new Date(form().starts_at).toISOString()
          : null,
        ends_at: form().ends_at ? new Date(form().ends_at).toISOString() : null,
        target_audience: form().target_audience
      };

      const isEdit = !!form().id;
      const resp = await fetch("/api/admin/announcements", {
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
      showToast(
        isEdit ? "Announcement updated" : "Announcement created",
        "success"
      );
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
        body: JSON.stringify({ id: a.id, is_active: !a.is_active })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      setItems((prev) =>
        prev.map((x) => (x.id === a.id ? body.announcement : x))
      );
    } catch {
      showToast("Network error", "error");
    }
  };

  const remove = async (a: Announcement) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      const resp = await fetch(`/api/admin/announcements?id=${a.id}`, {
        method: "DELETE",
        credentials: "include"
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

  // ─── Render ────────────────────────────────────────────────

  return (
    <div class="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 class="m-0 text-2xl font-bold text-text-strong">
            Announcements
          </h1>
          <p class="mt-1 text-sm text-text-muted">
            Show banners, toasts, or modals to all users. Schedule with
            start/end times. Dismissals are tracked per-user.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              class="h-4 w-4 accent-primary"
              checked={showDeleted()}
              onChange={(e) => {
                setShowDeleted(e.currentTarget.checked);
                setLoading(true);
                void fetchList();
              }}
            />
            Show deleted
          </label>
          <GlassButton
            variant="primary"
            size="default"
            icon="add"
            onClick={openNew}
          >
            New Announcement
          </GlassButton>
        </div>
      </header>

      {/* ─── Headline stats ─────────────────────────────────── */}
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Announcement statistics"
      >
        <GlassStatCard
          value={stats().total}
          label="Total"
          icon="campaign"
          variant="glass"
          size="compact"
        />
        <GlassStatCard
          value={stats().active}
          label="Active now"
          icon="play_circle"
          variant="accent"
          size="compact"
          trend={stats().active > 0 ? "up" : "neutral"}
        />
        <GlassStatCard
          value={stats().scheduled}
          label="Scheduled"
          icon="schedule"
          variant="glass"
          size="compact"
        />
        <GlassStatCard
          value={stats().totalDismissals}
          label="Total dismissals"
          icon="cancel"
          variant="glass"
          size="compact"
        />
      </section>

      {/* ─── Error banner ───────────────────────────────────── */}
      <Show when={error()}>
        <GlassCard
          variant="glass"
          size="compact"
          class="border-danger/30 bg-danger-bg text-danger"
        >
          <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined" aria-hidden="true">
              error
            </span>
            Failed to load: {error()}
          </div>
        </GlassCard>
      </Show>

      {/* ─── Loading ────────────────────────────────────────── */}
      <Show when={loading()}>
        <div class="flex flex-col gap-3">
          <For each={Array.from({ length: 3 })}>
            {() => (
              <GlassCard
                size="compact"
                loading
                class="h-20"
                aria-hidden="true"
              />
            )}
          </For>
        </div>
      </Show>

      {/* ─── Empty state ────────────────────────────────────── */}
      <Show when={!loading() && items().length === 0}>
        <GlassEmptyState
          icon="campaign"
          title="No announcements yet"
          message={`Click "+ New Announcement" to create your first banner, toast, or modal.`}
        />
      </Show>

      {/* ─── List ───────────────────────────────────────────── */}
      <Show when={!loading() && items().length > 0}>
        <div class="flex flex-col gap-3">
          <For each={items()}>
            {(a) => {
              const sev = SEVERITY_CONFIG[a.severity];
              const dismissals = () => dismissalCounts()[a.id];
              const isScheduled = () =>
                a.starts_at && new Date(a.starts_at) > new Date();
              return (
                <GlassCard
                  variant="glass"
                  size="default"
                  class={
                    a.deleted_at
                      ? "opacity-45"
                      : a.is_active
                        ? "border-primary/40"
                        : "opacity-70"
                  }
                >
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-center">
                    {/* Left: severity icon + content */}
                    <div class="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        class={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md ${SEV_BG_CLASS[a.severity]}`}
                      >
                        <span
                          class="material-symbols-outlined text-xl"
                          aria-hidden="true"
                        >
                          {sev.icon}
                        </span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="truncate font-semibold text-text-strong">
                            {a.title}
                          </span>
                          <GlassBadge intent={sev.intent} size="compact">
                            {a.severity}
                          </GlassBadge>
                          <GlassBadge intent="default" size="compact">
                            <span
                              class="material-symbols-outlined mr-1 text-xs"
                              aria-hidden="true"
                            >
                              {TYPE_ICON[a.type]}
                            </span>
                            {a.type}
                          </GlassBadge>
                          <Show when={a.target_audience !== "all"}>
                            <GlassBadge intent="primary" size="compact">
                              → {a.target_audience}
                            </GlassBadge>
                          </Show>
                        </div>
                        <p class="mt-1 line-clamp-2 text-sm text-text-muted">
                          {a.body || (
                            <span class="italic opacity-60">No body</span>
                          )}
                        </p>
                        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                          <span>
                            Created {new Date(a.created_at).toLocaleString()}
                          </span>
                          <Show when={isScheduled()}>
                            <span class="text-primary">
                              ▶ Starts{" "}
                              {new Date(a.starts_at!).toLocaleString()}
                            </span>
                          </Show>
                          <Show when={a.ends_at}>
                            <span>
                              ⏹ Ends {new Date(a.ends_at!).toLocaleDateString()}
                            </span>
                          </Show>
                          <Show when={!a.deleted_at}>
                            <span>
                              Dismissals:{" "}
                              <strong class="text-text-secondary">
                                {dismissals() ?? "—"}
                              </strong>
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div class="flex flex-shrink-0 items-center gap-2">
                      <Show when={!a.deleted_at}>
                        <GlassButton
                          variant={a.is_active ? "primary" : "glass"}
                          size="compact"
                          onClick={() => void toggleActive(a)}
                          aria-label={
                            a.is_active
                              ? "Deactivate announcement"
                              : "Activate announcement"
                          }
                        >
                          {a.is_active ? "ACTIVE" : "INACTIVE"}
                        </GlassButton>
                        <GlassButton
                          variant="glass"
                          size="compact"
                          icon="edit"
                          onClick={() => openEdit(a)}
                          aria-label="Edit announcement"
                        />
                        <GlassButton
                          variant="danger"
                          size="compact"
                          icon="delete"
                          onClick={() => void remove(a)}
                          aria-label="Delete announcement"
                        />
                      </Show>
                      <Show when={a.deleted_at}>
                        <span class="text-xs text-text-muted">
                          Deleted{" "}
                          {new Date(a.deleted_at ?? "").toLocaleDateString()}
                        </span>
                      </Show>
                    </div>
                  </div>
                </GlassCard>
              );
            }}
          </For>
        </div>
      </Show>

      {/* ─── Editor modal with live preview ─────────────────── */}
      <GlassModal
        open={modalOpen()}
        onClose={() => !saving() && setModalOpen(false)}
        title={form().id ? "Edit Announcement" : "New Announcement"}
        size="xl"
      >
        <div class="flex flex-col gap-6">
          {/* Top: form fields */}
          <div class="flex flex-col gap-4">
            <GlassInput
              label="Title"
              value={form().title}
              onInput={(e) =>
                setForm({ ...form(), title: e.currentTarget.value })
              }
              placeholder="Maintenance window this Sunday"
            />

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Type
                </label>
                <select
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={form().type}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      type: e.currentTarget.value as FormData["type"]
                    })
                  }
                >
                  <option value="banner">Banner (top of page)</option>
                  <option value="toast">Toast (corner popup)</option>
                  <option value="modal">Modal (full overlay)</option>
                </select>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Severity
                </label>
                <select
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={form().severity}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      severity: e.currentTarget
                        .value as FormData["severity"]
                    })
                  }
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                Body
              </label>
              <textarea
                class="min-h-[80px] resize-vertical rounded-lg border border-glass-border bg-glass px-3 py-2 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                value={form().body}
                onInput={(e) =>
                  setForm({ ...form(), body: e.currentTarget.value })
                }
                placeholder="Details about the announcement…"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GlassInput
                label="CTA Label"
                value={form().cta_label}
                onInput={(e) =>
                  setForm({ ...form(), cta_label: e.currentTarget.value })
                }
                placeholder="Read more"
              />
              <GlassInput
                label="CTA Link"
                value={form().cta_href}
                onInput={(e) =>
                  setForm({ ...form(), cta_href: e.currentTarget.value })
                }
                placeholder="/blog/maintenance"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Starts At (optional)
                </label>
                <input
                  type="datetime-local"
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={form().starts_at}
                  onInput={(e) =>
                    setForm({ ...form(), starts_at: e.currentTarget.value })
                  }
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Ends At (optional)
                </label>
                <input
                  type="datetime-local"
                  class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                  value={form().ends_at}
                  onInput={(e) =>
                    setForm({ ...form(), ends_at: e.currentTarget.value })
                  }
                />
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
                Target Audience
              </label>
              <select
                class="h-11 rounded-lg border border-glass-border bg-glass px-3 text-base text-text-strong backdrop-blur-xl focus:border-primary focus:outline-none"
                value={form().target_audience}
                onChange={(e) =>
                  setForm({
                    ...form(),
                    target_audience: e.currentTarget
                      .value as FormData["target_audience"]
                  })
                }
              >
                <option value="all">All users</option>
                <option value="guests">Guests only (not signed in)</option>
                <option value="authenticated">Authenticated users only</option>
              </select>
            </div>

            <div class="flex flex-wrap gap-4">
              <label class="flex cursor-pointer items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-primary"
                  checked={form().is_active}
                  onChange={(e) =>
                    setForm({ ...form(), is_active: e.currentTarget.checked })
                  }
                />
                Active
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-primary"
                  checked={form().is_dismissible}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      is_dismissible: e.currentTarget.checked
                    })
                  }
                />
                Dismissible
              </label>
            </div>
          </div>

          {/* ─── Live preview ────────────────────────────────── */}
          <div class="flex flex-col gap-2">
            <h3 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
              Live Preview
            </h3>
            <AnnouncementPreview form={form()} />
          </div>

          {/* ─── Footer actions ──────────────────────────────── */}
          <div class="flex justify-end gap-2 border-t border-glass-border pt-4">
            <GlassButton
              variant="glass"
              size="default"
              onClick={() => setModalOpen(false)}
              disabled={saving()}
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              size="default"
              icon={saving() ? "progress_activity" : "save"}
              onClick={() => void save()}
              disabled={saving()}
              loading={saving()}
            >
              {saving() ? "Saving…" : form().id ? "Update" : "Create"}
            </GlassButton>
          </div>
        </div>
      </GlassModal>

      {/* ─── Toast ──────────────────────────────────────────── */}
      <Show when={toast()}>
        {(t) => (
          <div
            role="status"
            aria-live="polite"
            class="fixed bottom-6 right-6 z-[300] flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white shadow-lg"
            style={{
              background:
                t().type === "success" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
            }}
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {t().type === "success" ? "check_circle" : "error"}
            </span>
            {t().msg}
          </div>
        )}
      </Show>
    </div>
  );
};

// ─── Live Preview Sub-component ──────────────────────────────────

const AnnouncementPreview: Component<{ form: FormData }> = (props) => {
  const sev = () => SEVERITY_CONFIG[props.form.severity];

  // Render the appropriate preview based on the selected type. The
  // preview uses the SAME visual treatment as the consumer-side
  // announcement component (banner strip, corner toast, centered
  // modal) so the admin sees exactly what users will see.
  return (
    <div class="relative min-h-[160px] overflow-hidden rounded-lg border border-glass-border bg-void/40 p-4">
      {/* Banner preview — top strip */}
      <Show when={props.form.type === "banner"}>
        <div
          class={`flex items-center gap-3 rounded-md border px-4 py-3 ${SEV_BORDER_CLASS[props.form.severity]} ${SEV_BG_CLASS[props.form.severity]}`}
        >
          <span class="material-symbols-outlined flex-shrink-0" aria-hidden="true">
            {sev().icon}
          </span>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-text-strong">
              {props.form.title || (
                <span class="italic opacity-60">Untitled announcement</span>
              )}
            </div>
            <Show when={props.form.body}>
              <div class="truncate text-sm text-text-muted">
                {props.form.body}
              </div>
            </Show>
          </div>
          <Show when={props.form.cta_label}>
            <span class="flex-shrink-0 rounded-md bg-glass px-3 py-1 text-xs font-semibold text-primary">
              {props.form.cta_label}
            </span>
          </Show>
          <Show when={props.form.is_dismissible}>
            <span
              class="material-symbols-outlined flex-shrink-0 cursor-pointer text-text-muted"
              aria-hidden="true"
            >
              close
            </span>
          </Show>
        </div>
      </Show>

      {/* Toast preview — bottom-right corner */}
      <Show when={props.form.type === "toast"}>
        <div class="flex min-h-[120px] items-end justify-end">
          <div
            class={`max-w-sm rounded-md border bg-glass-strong px-4 py-3 backdrop-blur-2xl ${SEV_BORDER_CLASS[props.form.severity]}`}
          >
            <div class="flex items-start gap-2">
              <span
                class={`material-symbols-outlined flex-shrink-0 text-xl ${SEV_TEXT_CLASS[props.form.severity]}`}
                aria-hidden="true"
              >
                {sev().icon}
              </span>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-text-strong">
                  {props.form.title || (
                    <span class="italic opacity-60">Untitled</span>
                  )}
                </div>
                <Show when={props.form.body}>
                  <div class="mt-0.5 text-sm text-text-muted">
                    {props.form.body}
                  </div>
                </Show>
              </div>
              <Show when={props.form.is_dismissible}>
                <span
                  class="material-symbols-outlined flex-shrink-0 text-text-muted"
                  aria-hidden="true"
                >
                  close
                </span>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal preview — centered overlay */}
      <Show when={props.form.type === "modal"}>
        <div class="flex min-h-[120px] items-center justify-center">
          <div
            class={`w-full max-w-md rounded-lg border bg-glass-strong p-5 backdrop-blur-2xl ${SEV_BORDER_CLASS[props.form.severity]}`}
          >
            <div class="flex items-center gap-3">
              <span
                class={`material-symbols-outlined text-2xl ${SEV_TEXT_CLASS[props.form.severity]}`}
                aria-hidden="true"
              >
                {sev().icon}
              </span>
              <h4 class="m-0 flex-1 text-lg font-bold text-text-strong">
                {props.form.title || (
                  <span class="italic opacity-60">Untitled announcement</span>
                )}
              </h4>
              <Show when={props.form.is_dismissible}>
                <span
                  class="material-symbols-outlined cursor-pointer text-text-muted"
                  aria-hidden="true"
                >
                  close
                </span>
              </Show>
            </div>
            <Show when={props.form.body}>
              <p class="mt-3 text-sm text-text-muted">{props.form.body}</p>
            </Show>
            <Show when={props.form.cta_label}>
              <div class="mt-4 flex justify-end">
                <span class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                  {props.form.cta_label}
                </span>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default AnnouncementsPage;
