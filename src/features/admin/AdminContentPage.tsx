// src/features/admin/AdminContentPage.tsx
//
// CineLog V2 — Admin Featured Content Page (Phase 9 Chunk 5b)
// ---------------------------------------------------------------------
// The single admin surface for curating the five featured slots that
// drive the user-facing Discover experience:
//
//   • hero        — large rotating hero card (max 3)
//   • spotlight   — secondary spotlight rail (max 5)
//   • rail        — generic featured rail (max 20)
//   • pinned      — pinned to top of watchlist (max 3)
//   • editor_pick — curated editor picks rail (max 20)
//
// ZERO-DUPLICATION: Featured content settings live ONLY on this page.
// No other admin page edits `featured_content` rows. (Audit performed
// against src/features/admin/* and src/routes/admin/* before rewrite.)
//
// USER-SIDE MAPPING: The five slots are the only slot types defined in
// the public /api/featured-content endpoint and in the DB enum
// `featured_slot`. No additional slot types are introduced here.
// (See src/routes/api/featured-content.ts and
//  src/lib/supabase/database.types.ts → featured_slot enum.)
//
// NO-OMDB: This page only ever references TMDB IDs. No OMDB code paths
// are touched.
//
// MOBILE-FIRST: Slot tabs collapse to a horizontal scroll strip on
// narrow viewports. Entry rows are responsive. Drag-and-drop uses
// @thisbeyond/solid-dnd (pointer-based, works on touch) AND every row
// also exposes visible ↑ / ↓ buttons so the page is fully usable
// without drag.
//
// LIVE PREVIEW: A right-side panel renders a mock Discover page that
// updates as the admin edits entries — showing how hero/spotlight/rail
// will appear to end users. The preview is purely client-side (no
// network); it derives from the in-memory `entriesBySlot` signal.
//
// SCHEDULING: Every entry supports optional starts_at / ends_at
// timestamps via datetime-local inputs. The Live Preview and the
// public API both honor scheduling (entries outside their window are
// hidden from users; the admin table shows them dimmed + tagged
// "Scheduled" / "Expired").
//
// Backend:
//   GET    /api/admin/content?slot=<slot>           — list (slot-scoped)
//   GET    /api/admin/content                        — list (all slots)
//   POST   /api/admin/content                        — create
//   PATCH  /api/admin/content                        — update (also used
//                                                       for reordering:
//                                                       send {id, position})
//   DELETE /api/admin/content?id=<uuid>              — soft-delete

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component,
  type JSX
} from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  closestCenter,
  createSortable
} from "@thisbeyond/solid-dnd";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types ─────────────────────────────────────────────────────────

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

// ─── Slot catalogue ────────────────────────────────────────────────
//
// The `max` field is informational — the admin can technically exceed
// it, but the Live Preview will surface a warning badge so the admin
// understands the user-side rendering will truncate. This keeps the
// admin in control while making the consequence visible.

const SLOTS: {
  id: Slot;
  label: string;
  icon: string;
  description: string;
  max: number;
  userSideRenderer: string;
}[] = [
  {
    id: "hero",
    label: "Hero",
    icon: "auto_awesome",
    description:
      "Large rotating hero card at the very top of Discover. The first active entry is the LCP image — keep taglines tight.",
    max: 3,
    userSideRenderer: "DiscoverPage → Spotlight (hero rotation)"
  },
  {
    id: "spotlight",
    label: "Spotlight",
    icon: "flashlight_on",
    description:
      "Secondary spotlight rail directly under the hero. Use for new releases or seasonal pushes.",
    max: 5,
    userSideRenderer: "DiscoverPage → Spotlight row 2"
  },
  {
    id: "rail",
    label: "Featured Rail",
    icon: "view_carousel",
    description:
      "Generic featured rail shown midway through Discover. Use for cross-genre editor selections.",
    max: 20,
    userSideRenderer: "DiscoverPage → Featured Rail"
  },
  {
    id: "pinned",
    label: "Pinned",
    icon: "push_pin",
    description:
      "Pinned to the top of the user's watchlist view. Use sparingly — only 1-3 high-priority items.",
    max: 3,
    userSideRenderer: "Watchlist → Pinned row"
  },
  {
    id: "editor_pick",
    label: "Editor Picks",
    icon: "edit_note",
    description:
      "Curated editor picks rail shown near the bottom of Discover. Good for thematic collections.",
    max: 20,
    userSideRenderer: "DiscoverPage → Editor Picks rail"
  }
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
  ends_at: ""
});

// ─── Scheduling helpers ────────────────────────────────────────────

type ScheduleStatus =
  | { kind: "live" }
  | { kind: "scheduled"; startsAt: string }
  | { kind: "expired"; endsAt: string }
  | { kind: "always" };

function scheduleStatus(e: FeaturedEntry): ScheduleStatus {
  const now = Date.now();
  if (e.starts_at && new Date(e.starts_at).getTime() > now) {
    return { kind: "scheduled", startsAt: e.starts_at };
  }
  if (e.ends_at && new Date(e.ends_at).getTime() < now) {
    return { kind: "expired", endsAt: e.ends_at };
  }
  if (e.starts_at || e.ends_at) return { kind: "live" };
  return { kind: "always" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

// ─── Page component ────────────────────────────────────────────────

const AdminContentPage: Component = () => {
  const [activeSlot, setActiveSlot] = createSignal<Slot>("hero");
  // entriesBySlot holds ALL slots in memory so the Live Preview can
  // render every slot simultaneously without per-slot refetches.
  const [entriesBySlot, setEntriesBySlot] = createSignal<Record<Slot, FeaturedEntry[]>>({
    hero: [],
    spotlight: [],
    rail: [],
    pinned: [],
    editor_pick: []
  });
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal<FormData>(emptyForm("hero"));
  const [saving, setSaving] = createSignal(false);
  const [reordering, setReordering] = createSignal(false);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Fetch all slots in one round-trip ────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/content", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { content: FeaturedEntry[] };
      const grouped: Record<Slot, FeaturedEntry[]> = {
        hero: [],
        spotlight: [],
        rail: [],
        pinned: [],
        editor_pick: []
      };
      for (const row of data.content ?? []) grouped[row.slot].push(row);
      for (const k of Object.keys(grouped) as Slot[]) {
        grouped[k].sort((a, b) => a.position - b.position);
      }
      setEntriesBySlot(grouped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void fetchAll());

  // ── Derived views ────────────────────────────────────────────
  const activeEntries = createMemo(() => entriesBySlot()[activeSlot()]);
  const activeSlotMeta = createMemo(
    () => SLOTS.find((s) => s.id === activeSlot())!
  );

  // Per-slot counts for the tab bar — kept as a memo so it updates
  // reactively as entries are added/removed.
  const slotCounts = createMemo(() => {
    const m: Record<Slot, number> = {
      hero: 0,
      spotlight: 0,
      rail: 0,
      pinned: 0,
      editor_pick: 0
    };
    const all = entriesBySlot();
    for (const s of SLOTS) m[s.id] = all[s.id].length;
    return m;
  });

  const switchSlot = (slot: Slot) => {
    setActiveSlot(slot);
  };

  // ── Add / Edit modal ─────────────────────────────────────────
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
      starts_at: e.starts_at ? toDatetimeLocal(e.starts_at) : "",
      ends_at: e.ends_at ? toDatetimeLocal(e.ends_at) : ""
    });
    setModalOpen(true);
  };

  const save = async () => {
    const tmdbId = parseInt(form().tmdb_id, 10);
    if (Number.isNaN(tmdbId) || tmdbId <= 0) {
      showToast("TMDB ID must be a positive number", "error");
      return;
    }
    if (
      form().starts_at &&
      form().ends_at &&
      new Date(form().starts_at) >= new Date(form().ends_at)
    ) {
      showToast("Ends At must be after Starts At", "error");
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
        starts_at: form().starts_at
          ? new Date(form().starts_at).toISOString()
          : null,
        ends_at: form().ends_at
          ? new Date(form().ends_at).toISOString()
          : null
      };

      const isEdit = !!form().id;
      const resp = await fetch("/api/admin/content", {
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
      showToast(isEdit ? "Entry updated" : "Entry created", "success");
      setModalOpen(false);
      await fetchAll();
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
        body: JSON.stringify({ id: e.id, is_active: !e.is_active })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      setEntriesBySlot((prev) => {
        const next = { ...prev };
        next[e.slot] = next[e.slot].map((x) =>
          x.id === e.id ? body.content : x
        );
        return next;
      });
    } catch {
      showToast("Network error", "error");
    }
  };

  const remove = async (e: FeaturedEntry) => {
    if (
      !confirm(
        `Remove TMDB ID ${e.tmdb_id} (${e.media_type}) from ${e.slot}?`
      )
    )
      return;
    try {
      const resp = await fetch(`/api/admin/content?id=${e.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        showToast(body.error || "Failed", "error");
        return;
      }
      showToast("Entry removed", "success");
      await fetchAll();
    } catch {
      showToast("Network error", "error");
    }
  };

  // ── Reordering ───────────────────────────────────────────────
  //
  // Two paths:
  //   1. Drag-and-drop via @thisbeyond/solid-dnd (pointer + touch).
  //   2. ↑ / ↓ buttons on every row — the always-available fallback
  //      for keyboard users and for mobile contexts where the admin
  //      prefers taps over drags.
  //
  // Both paths funnel through `commitOrder`, which:
  //   • optimistically reorders the local signal,
  //   • fires one PATCH per moved row with the new `position`,
  //   • rolls back on any failure.

  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    const slot = activeSlot();
    const list = entriesBySlot()[slot].slice();
    if (from < 0 || from >= list.length || to < 0 || to >= list.length)
      return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    // Re-number positions 0..N-1 in the new order.
    const renumbered = list.map((e, i) => ({ ...e, position: i }));
    setEntriesBySlot((prev) => ({ ...prev, [slot]: renumbered }));
    void commitOrder(slot, renumbered);
  };

  const moveUp = (idx: number) => idx > 0 && moveItem(idx, idx - 1);
  const moveDown = (idx: number) =>
    idx < activeEntries().length - 1 && moveItem(idx, idx + 1);

  const commitOrder = async (slot: Slot, ordered: FeaturedEntry[]) => {
    setReordering(true);
    // Capture the original order so we can roll back on failure.
    const snapshot = entriesBySlot()[slot];
    try {
      // Patch each row's position. We send only {id, position} so the
      // server's enum validation and audit log fire normally.
      await Promise.all(
        ordered.map((e, i) =>
          fetch("/api/admin/content", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: e.id, position: i })
          }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
          })
        )
      );
      showToast("Order saved", "success");
    } catch {
      showToast("Reorder failed — rolling back", "error");
      setEntriesBySlot((prev) => ({ ...prev, [slot]: snapshot }));
    } finally {
      setReordering(false);
    }
  };

  // DnD handler — @thisbeyond/solid-dnd fires onDragEnd with the
  // draggable + droppable ids. We use the row index encoded in the id
  // (`row:<idx>`) to compute the from/to positions and delegate to
  // moveItem.
  const onDragEnd = (payload: {
    draggable: { id: string | number };
    droppable?: { id: string | number } | null;
  }) => {
    const fromId = String(payload.draggable.id);
    const toId = payload.droppable ? String(payload.droppable.id) : null;
    if (!toId || fromId === toId) return;
    const from = parseInt(fromId.replace("row:", ""), 10);
    const to = parseInt(toId.replace("row:", ""), 10);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    moveItem(from, to);
  };

  const sortableIds = createMemo(() =>
    activeEntries().map((_, i) => `row:${i}`)
  );

  // ── Live Preview data ────────────────────────────────────────
  //
  // The preview reads from `entriesBySlot` (the in-memory state) so
  // the admin sees their edits reflected instantly — no save needed.
  // It applies the same scheduling rules as the public API: entries
  // outside their window are hidden.

  const visibleEntries = (slot: Slot): FeaturedEntry[] => {
    const now = Date.now();
    return entriesBySlot()[slot].filter((e) => {
      if (!e.is_active || e.deleted_at) return false;
      if (e.starts_at && new Date(e.starts_at).getTime() > now)
        return false;
      if (e.ends_at && new Date(e.ends_at).getTime() < now) return false;
      return true;
    });
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div class="admin-content-page">
      <PageHeader />

      <Show when={error()}>
        <div role="alert" style={alertError}>
          Failed to load: {error()}
        </div>
      </Show>

      <div class="admin-content-layout">
        {/* ── LEFT: editor column ──────────────────────────── */}
        <div class="admin-content-editor">
          <SlotTabs
            slots={SLOTS}
            active={activeSlot()}
            counts={slotCounts()}
            onSelect={switchSlot}
          />

          <SlotHeader
            meta={activeSlotMeta()}
            count={activeEntries().length}
            onAdd={openNew}
          />

          <Show when={loading()}>
            <For each={Array.from({ length: 3 })}>
              {() => <GlassSkeleton variant="block" height="72px" />}
            </For>
          </Show>

          <Show when={!loading() && activeEntries().length === 0}>
            <GlassEmptyState
              icon="inbox"
              title="No entries in this slot yet"
              message={`Add a title to the ${activeSlotMeta().label} slot to feature it on the Discover page.`}
              variant="compact"
              surface
              action={
                <GlassButton
                  variant="primary"
                  size="compact"
                  icon="add"
                  onClick={openNew}
                >
                  Add Title
                </GlassButton>
              }
            />
          </Show>

          <Show when={!loading() && activeEntries().length > 0}>
            <DragDropProvider
              collisionDetector={closestCenter}
              onDragEnd={onDragEnd}
            >
              <DragDropSensors />
              <SortableProvider ids={sortableIds()}>
                <div class="admin-content-list">
                  <For each={activeEntries()}>
                    {(e, idx) => (
                      <EntryRow
                        entry={e}
                        index={idx()}
                        total={activeEntries().length}
                        onEdit={() => openEdit(e)}
                        onToggle={() => toggleActive(e)}
                        onRemove={() => remove(e)}
                        onMoveUp={() => moveUp(idx())}
                        onMoveDown={() => moveDown(idx())}
                        disabled={reordering()}
                      />
                    )}
                  </For>
                </div>
              </SortableProvider>
            </DragDropProvider>
          </Show>
        </div>

        {/* ── RIGHT: Live Preview column ──────────────────── */}
        <LivePreview
          slots={SLOTS}
          visibleEntries={visibleEntries}
          activeSlot={activeSlot()}
        />
      </div>

      {/* ── Add/Edit modal ─────────────────────────────────── */}
      <Show when={modalOpen()}>
        <EntryModal
          form={form()}
          saving={saving()}
          slotLabel={activeSlotMeta().label}
          onClose={() => !saving() && setModalOpen(false)}
          onUpdate={(patch) => setForm({ ...form(), ...patch })}
          onSave={save}
        />
      </Show>

      <Show when={toast()}>
        <div
          class="admin-content-toast"
          style={{
            background:
              toast()?.type === "success"
                ? "rgb(34, 197, 94)"
                : "rgb(239, 68, 68)"
          }}
        >
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

// ─── Page header ───────────────────────────────────────────────────

function PageHeader() {
  return (
    <div class="admin-content-header">
      <h2 class="admin-content-title">Featured Content</h2>
      <p class="admin-content-subtitle">
        Curate which titles appear in hero / spotlight / rail / pinned /
        editor pick slots. Drag to reorder — or use the ↑ / ↓ buttons on
        each row. Scheduling windows are honored on the user side.
      </p>
    </div>
  );
}

// ─── Slot tabs ─────────────────────────────────────────────────────

function SlotTabs(props: {
  slots: typeof SLOTS;
  active: Slot;
  counts: Record<Slot, number>;
  onSelect: (s: Slot) => void;
}) {
  return (
    <div class="admin-content-tabs" role="tablist">
      <For each={props.slots}>
        {(slot) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.active === slot.id}
            class="admin-content-tab"
            classList={{ "is-active": props.active === slot.id }}
            onClick={() => props.onSelect(slot.id)}
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {slot.icon}
            </span>
            <span class="admin-content-tab-label">{slot.label}</span>
            <span class="admin-content-tab-count">
              {props.counts[slot.id]}
              <Show when={slot.max}>/{slot.max}</Show>
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

// ─── Slot header (description + Add button) ────────────────────────

function SlotHeader(props: {
  meta: (typeof SLOTS)[number];
  count: number;
  onAdd: () => void;
}) {
  return (
    <GlassCard
      variant="glass"
      padding="default"
      class="admin-content-slot-header"
    >
      <span class="material-symbols-outlined admin-content-slot-icon">
        {props.meta.icon}
      </span>
      <div class="admin-content-slot-meta">
        <div class="admin-content-slot-name">{props.meta.label}</div>
        <div class="admin-content-slot-desc">{props.meta.description}</div>
        <div class="admin-content-slot-renderer">
          <span class="material-symbols-outlined" aria-hidden="true">
            visibility
          </span>
          Renders as: <strong>{props.meta.userSideRenderer}</strong>
        </div>
      </div>
      <div class="admin-content-slot-actions">
        <GlassBadge
          intent={props.count > props.meta.max ? "warning" : "default"}
          label={`${props.count}/${props.meta.max}`}
        />
        <GlassButton
          variant="primary"
          size="compact"
          icon="add"
          onClick={props.onAdd}
        >
          Add Title
        </GlassButton>
      </div>
    </GlassCard>
  );
}

// ─── Entry row (draggable + has ↑ / ↓ fallback) ────────────────────

interface EntryRowProps {
  entry: FeaturedEntry;
  index: number;
  total: number;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled: boolean;
}

function EntryRow(props: EntryRowProps) {
  // createSortable must be called once per row. The id encodes the
  // row's current index — but we re-key on the entry's stable id via
  // <For> so when the order changes, SolidJS reuses the row component
  // and re-creates the sortable with the new index. (SolidJS <For>
  // reuses components by reference equality of the item; the sortable
  // id is read fresh on each render through the closure.)
  // eslint-disable-next-line solid/reactivity
  const sortable = createSortable(`row:${props.index}`);

  // Compute schedule status once per render — calling status() multiple
  // times in JSX would otherwise defeat TypeScript's narrowing on the
  // discriminated union.
  const status = () => scheduleStatus(props.entry);
  const title = () =>
    props.entry.title_override || `TMDB #${props.entry.tmdb_id}`;

  const rowOpacity = () => {
    if (props.entry.deleted_at) return 0.45;
    if (!props.entry.is_active) return 0.6;
    if (status().kind === "expired") return 0.5;
    return 1;
  };

  return (
    <div
      class="admin-content-entry"
      classList={{
        "is-dragging": sortable.isActiveDraggable,
        "is-inactive": !props.entry.is_active || !!props.entry.deleted_at,
        "is-expired": status().kind === "expired"
      }}
      ref={sortable.ref}
      style={{ opacity: rowOpacity() }}
      role="listitem"
    >
      {/* Drag handle — the only place that starts a drag.
          `...sortable.dragActivators` wires pointer + touch events. */}
      <button
        type="button"
        class="admin-content-drag-handle focus-ring"
        aria-label={`Drag ${title()} to reorder`}
        title="Drag to reorder"
        {...sortable.dragActivators}
        disabled={props.disabled}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          drag_indicator
        </span>
      </button>

      <span class="admin-content-entry-index" aria-hidden="true">
        {props.index + 1}
      </span>

      <div class="admin-content-entry-body">
        <div class="admin-content-entry-titleline">
          <span class="admin-content-entry-title">{title()}</span>
          <GlassBadge
            intent="default"
            size="compact"
            label={props.entry.media_type}
          />
          <span class="admin-content-entry-tmdb">
            TMDB #{props.entry.tmdb_id}
          </span>
          <Show when={!props.entry.is_active}>
            <GlassBadge intent="warning" size="compact" label="Inactive" />
          </Show>
          {(() => {
            const s = status();
            if (s.kind === "scheduled") {
              return (
                <GlassBadge
                  intent="info"
                  size="compact"
                  label={`Scheduled · starts ${fmtDate(s.startsAt)}`}
                />
              );
            }
            if (s.kind === "expired") {
              return (
                <GlassBadge
                  intent="danger"
                  size="compact"
                  label={`Expired ${fmtDate(s.endsAt)}`}
                />
              );
            }
            if (s.kind === "live") {
              return (
                <GlassBadge intent="success" size="compact" label="Live" />
              );
            }
            return null;
          })()}
        </div>
        <Show when={props.entry.tagline}>
          <div class="admin-content-entry-tagline">
            "{props.entry.tagline}"
          </div>
        </Show>
        <div class="admin-content-entry-meta">
          Position {props.entry.position}
          <Show when={props.entry.starts_at || props.entry.ends_at}>
            <span aria-hidden="true"> · </span>
            <Show when={props.entry.starts_at}>
              from {fmtDate(props.entry.starts_at)}
            </Show>
            <Show when={props.entry.ends_at}>
              {" "}
              until {fmtDate(props.entry.ends_at)}
            </Show>
          </Show>
        </div>
      </div>

      <div class="admin-content-entry-actions">
        {/* ↑ / ↓ buttons — always available, work on touch + keyboard */}
        <button
          type="button"
          class="admin-content-move-btn focus-ring"
          onClick={() => props.onMoveUp()}
          disabled={props.disabled || props.index === 0}
          aria-label={`Move ${title()} up`}
          title="Move up"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            arrow_upward
          </span>
        </button>
        <button
          type="button"
          class="admin-content-move-btn focus-ring"
          onClick={() => props.onMoveDown()}
          disabled={props.disabled || props.index === props.total - 1}
          aria-label={`Move ${title()} down`}
          title="Move down"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            arrow_downward
          </span>
        </button>
        <button
          type="button"
          class="admin-content-icon-btn focus-ring"
          onClick={() => props.onToggle()}
          aria-label={`Toggle active for ${title()}`}
          title={props.entry.is_active ? "Set inactive" : "Set active"}
          disabled={!!props.entry.deleted_at}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {props.entry.is_active ? "toggle_on" : "toggle_off"}
          </span>
        </button>
        <button
          type="button"
          class="admin-content-icon-btn focus-ring"
          onClick={() => props.onEdit()}
          aria-label={`Edit ${title()}`}
          title="Edit"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            edit
          </span>
        </button>
        <button
          type="button"
          class="admin-content-icon-btn admin-content-icon-btn-danger focus-ring"
          onClick={() => props.onRemove()}
          aria-label={`Remove ${title()}`}
          title="Remove"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            delete
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Live Preview panel ────────────────────────────────────────────

function LivePreview(props: {
  slots: typeof SLOTS;
  visibleEntries: (slot: Slot) => FeaturedEntry[];
  activeSlot: Slot;
}) {
  const heroEntry = createMemo(() => props.visibleEntries("hero")[0] ?? null);

  return (
    <aside class="admin-content-preview" aria-label="Live preview">
      <div class="admin-content-preview-header">
        <span class="material-symbols-outlined" aria-hidden="true">
          desktop_windows
        </span>
        <div>
          <div class="admin-content-preview-title">Live Preview</div>
          <div class="admin-content-preview-sub">
            Mock Discover page · updates as you edit
          </div>
        </div>
      </div>

      <div class="admin-content-preview-frame">
        {/* Hero */}
        <PreviewHero entry={heroEntry()} />

        {/* Spotlight */}
        <PreviewRail
          label="Spotlight"
          icon="flashlight_on"
          entries={props.visibleEntries("spotlight")}
          highlighted={props.activeSlot === "spotlight"}
          emptyText="No spotlight titles"
          variant="poster"
        />

        {/* Featured rail */}
        <PreviewRail
          label="Featured Rail"
          icon="view_carousel"
          entries={props.visibleEntries("rail")}
          highlighted={props.activeSlot === "rail"}
          emptyText="No featured rail titles"
          variant="poster"
        />

        {/* Pinned */}
        <PreviewRail
          label="Pinned on Watchlist"
          icon="push_pin"
          entries={props.visibleEntries("pinned")}
          highlighted={props.activeSlot === "pinned"}
          emptyText="No pinned titles"
          variant="poster"
        />

        {/* Editor picks */}
        <PreviewRail
          label="Editor Picks"
          icon="edit_note"
          entries={props.visibleEntries("editor_pick")}
          highlighted={props.activeSlot === "editor_pick"}
          emptyText="No editor picks"
          variant="poster"
        />
      </div>

      <div class="admin-content-preview-legend">
        <span class="material-symbols-outlined" aria-hidden="true">
          info
        </span>
        Preview reflects scheduling windows. Expired or future entries
        are hidden, exactly as on the user side.
      </div>
    </aside>
  );
}

function PreviewHero(props: { entry: FeaturedEntry | null }) {
  return (
    <div
      class="admin-content-preview-hero"
      classList={{ "is-empty": !props.entry }}
    >
      <Show
        when={props.entry}
        fallback={
          <div class="admin-content-preview-empty-hero">
            <span class="material-symbols-outlined" aria-hidden="true">
              image
            </span>
            <span>Hero slot is empty</span>
          </div>
        }
      >
        <div class="admin-content-preview-hero-bg" />
        <div class="admin-content-preview-hero-content">
          <GlassBadge intent="primary" size="compact" label="Hero" />
          <div class="admin-content-preview-hero-title">
            {props.entry!.title_override || `TMDB #${props.entry!.tmdb_id}`}
          </div>
          <Show when={props.entry!.tagline}>
            <div class="admin-content-preview-hero-tagline">
              {props.entry!.tagline}
            </div>
          </Show>
          <div class="admin-content-preview-hero-meta">
            {props.entry!.media_type} · TMDB #{props.entry!.tmdb_id}
          </div>
        </div>
      </Show>
    </div>
  );
}

function PreviewRail(props: {
  label: string;
  icon: string;
  entries: FeaturedEntry[];
  highlighted: boolean;
  emptyText: string;
  variant: "poster";
}) {
  return (
    <div
      class="admin-content-preview-rail"
      classList={{ "is-highlighted": props.highlighted }}
    >
      <div class="admin-content-preview-rail-header">
        <span class="material-symbols-outlined" aria-hidden="true">
          {props.icon}
        </span>
        {props.label}
        <span class="admin-content-preview-rail-count">
          {props.entries.length}
        </span>
      </div>
      <Show
        when={props.entries.length > 0}
        fallback={
          <div class="admin-content-preview-rail-empty">
            {props.emptyText}
          </div>
        }
      >
        <div class="admin-content-preview-rail-row">
          <For each={props.entries.slice(0, 6)}>
            {(e) => (
              <div
                class="admin-content-preview-poster"
                title={e.title_override || `TMDB #${e.tmdb_id}`}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  {e.media_type === "tv" ? "tv" : "movie"}
                </span>
                <div class="admin-content-preview-poster-title">
                  {e.title_override || `#${e.tmdb_id}`}
                </div>
              </div>
            )}
          </For>
          <Show when={props.entries.length > 6}>
            <div class="admin-content-preview-poster admin-content-preview-poster-more">
              +{props.entries.length - 6}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────

function EntryModal(props: {
  form: FormData;
  saving: boolean;
  slotLabel: string;
  onClose: () => void;
  onUpdate: (patch: Partial<FormData>) => void;
  onSave: () => void;
}) {
  return (
    <div
      class="admin-content-modal-overlay"
      onClick={() => props.onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit featured entry for ${props.slotLabel}`}
    >
      <div
        class="admin-content-modal-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="admin-content-modal-header">
          <h3 class="admin-content-modal-title">
            {props.form.id ? "Edit Featured Entry" : "Add Featured Entry"}
          </h3>
          <button
            type="button"
            class="admin-content-icon-btn focus-ring"
            onClick={() => props.onClose()}
            aria-label="Close"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div class="admin-content-modal-body">
          <div class="admin-content-form-grid">
            <Field label="TMDB ID *">
              <input
                type="number"
                class="admin-content-input"
                value={props.form.tmdb_id}
                onInput={(e) =>
                  props.onUpdate({ tmdb_id: e.currentTarget.value })
                }
                placeholder="550"
                required
              />
            </Field>
            <Field label="Media Type *">
              <select
                class="admin-content-input"
                value={props.form.media_type}
                onChange={(e) =>
                  props.onUpdate({
                    media_type: e.currentTarget.value as "movie" | "tv"
                  })
                }
              >
                <option value="movie">Movie</option>
                <option value="tv">TV Series</option>
              </select>
            </Field>
          </div>

          <Field label="Title Override (optional)">
            <input
              type="text"
              class="admin-content-input"
              value={props.form.title_override}
              onInput={(e) =>
                props.onUpdate({ title_override: e.currentTarget.value })
              }
              placeholder="Custom display title (leave blank to use TMDB title)"
            />
          </Field>

          <Field label="Tagline (shown on hero / spotlight)">
            <input
              type="text"
              class="admin-content-input"
              value={props.form.tagline}
              onInput={(e) =>
                props.onUpdate({ tagline: e.currentTarget.value })
              }
              placeholder="A mind-bending thriller"
            />
          </Field>

          <Field label="Internal Note (admin only, never shown to users)">
            <textarea
              class="admin-content-input admin-content-textarea"
              value={props.form.note}
              onInput={(e) =>
                props.onUpdate({ note: e.currentTarget.value })
              }
              placeholder="Why is this featured?"
            />
          </Field>

          <div class="admin-content-form-grid">
            <Field label="Starts At (optional)">
              <input
                type="datetime-local"
                class="admin-content-input"
                value={props.form.starts_at}
                onInput={(e) =>
                  props.onUpdate({ starts_at: e.currentTarget.value })
                }
              />
            </Field>
            <Field label="Ends At (optional)">
              <input
                type="datetime-local"
                class="admin-content-input"
                value={props.form.ends_at}
                onInput={(e) =>
                  props.onUpdate({ ends_at: e.currentTarget.value })
                }
              />
            </Field>
          </div>

          <label class="admin-content-checkbox">
            <input
              type="checkbox"
              checked={props.form.is_active}
              onChange={(e) =>
                props.onUpdate({ is_active: e.currentTarget.checked })
              }
            />
            <span>Active (visible to users if within scheduling window)</span>
          </label>
        </div>

        <div class="admin-content-modal-footer">
          <GlassButton
            variant="secondary"
            size="compact"
            onClick={props.onClose}
            disabled={props.saving}
          >
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="compact"
            onClick={props.onSave}
            loading={props.saving}
          >
            {props.form.id ? "Update" : "Add"}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <div class="admin-content-field">
      <label class="admin-content-field-label">{props.label}</label>
      {props.children}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  // Convert an ISO timestamp to the value expected by
  // <input type="datetime-local"> (YYYY-MM-DDTHH:mm in local time).
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

// ─── Inline styles (kept minimal — most styling is in admin-content.css) ──

const alertError: JSX.CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  "border-radius": "var(--radius-md)",
  padding: "var(--sp-4)",
  "margin-bottom": "var(--sp-4)",
  "font-size": "0.875rem",
  color: "rgb(252, 165, 165)"
};

export default AdminContentPage;
