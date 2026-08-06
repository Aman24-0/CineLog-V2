// src/features/admin/AdminHomepagePage.tsx
//
// CineLog V2 — Admin Discover Config Page (Phase 9 Chunk 6 rewrite)
// ---------------------------------------------------------------------
// Glass UI rewrite of the Discover section config page.
//
// STRICT USER-SIDE MAPPING (CRITICAL):
//   The legacy page exposed all 16 sections from homepageConfig.ts
//   DEFAULT_CONFIG as toggleable cards. However, an audit of
//   src/features/discover/DiscoverPage.tsx shows that ONLY 7 of
//   those sections are actually rendered on the user side today:
//
//     1. spotlight          — Section 1 (Spotlight hero)
//     2. genre_explorer     — Section 2 (Genre Explorer)
//     3. because_you_love   — Section 3 ("Because You Love…")
//     4. trending           — Section 4 (Trending in Genre)
//     5. new_on_ott         — Section 5 (New on OTT)
//     6. weekend_picks      — Section 6 (Weekend Picks & Hidden Gems)
//     7. coming_soon        — Section 8 (Coming Soon — also gated by
//                              the `upcoming` feature flag)
//
//   Section 7 (Popular Anime) is DATA-DRIVEN, not config-driven — it
//   renders when `popularAnimeCombined().length > 0`, so it has no
//   homepage_config toggle and is NOT shown here.
//
//   The other 9 sections in DEFAULT_CONFIG (continue_universes,
//   insight_strip, theatres, surprise_me, step_outside, hidden_gems,
//   top_rated_movies, top_rated_series, new_seasons) are vestigial —
//   they exist in the config schema but DiscoverPage does not call
//   isEnabled() for them. Exposing them as admin toggles would be
//   dummy controls (the Strict-Mapping rule forbids this), so they
//   are NOT rendered here. They remain in the DB schema for forward
//   compatibility — if a future chunk wires them into DiscoverPage,
//   they can be added back here in the same PR.
//
// ZERO-DUPLICATION: Homepage section config lives ONLY on this page.
// No other admin page edits the `homepage_sections` key.
//
// DRAG-AND-DROP: Uses @thisbeyond/solid-dnd (pointer-based, works on
// touch). Every row ALSO has visible ↑ / ↓ buttons so the page is
// fully usable without drag.
//
// LIVE PREVIEW: A right-side panel renders a mock Discover layout
// that updates as the admin toggles/reorders sections. The preview is
// purely client-side (no network).
//
// MOBILE-FIRST: Editor + preview stack on tablet/phone (below 960px).
// Tabs are not needed (only 7 sections). Drag handles + buttons wrap.

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component
} from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  closestCenter,
  createSortable
} from "@thisbeyond/solid-dnd";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassSkeleton } from "~/shared/ui/glass/GlassSkeleton";

// ─── Types ─────────────────────────────────────────────────────────

interface SectionConfig {
  enabled: boolean;
  order: number;
}

interface HomepageConfig {
  sections: Record<string, SectionConfig>;
}

// ─── Section catalogue (STRICT — only sections DiscoverPage renders) ─

interface SectionMeta {
  key: string;
  label: string;
  description: string;
  icon: string;
  // Where this section is gated on the user side. Documented so the
  // admin understands the impact of toggling.
  userSide: string;
  // Additional feature-flag dependency (if any). The admin should
  // know that even if this section is "enabled", the flag must also
  // be on for it to render.
  featureFlagDep?: string;
}

const SECTION_META: SectionMeta[] = [
  {
    key: "spotlight",
    label: "Spotlight",
    description: "Daily rotating hero card with a single highlighted title.",
    icon: "flashlight_on",
    userSide: "DiscoverPage → <Spotlight /> (Section 1)"
  },
  {
    key: "genre_explorer",
    label: "Genre Explorer",
    description: "Chips + continuous carousel for browsing by genre.",
    icon: "palette",
    userSide: "DiscoverPage → <GenreExplorer /> (Section 2)"
  },
  {
    key: "because_you_love",
    label: "Because You Love…",
    description:
      "Personalized recommendations seeded from the user's vault.",
    icon: "favorite",
    userSide: "DiscoverPage → row1 (Section 3)"
  },
  {
    key: "trending",
    label: "Trending in Genre",
    description: "Trending titles filtered by the selected genre.",
    icon: "trending_up",
    userSide: "DiscoverPage → row2 (Section 4)"
  },
  {
    key: "new_on_ott",
    label: "New on OTT",
    description: "Streaming releases from the user's selected providers.",
    icon: "live_tv",
    userSide: "DiscoverPage → row3 (Section 5)"
  },
  {
    key: "weekend_picks",
    label: "Weekend Picks & Hidden Gems",
    description: "Editorial picks merged with hidden-gems anime.",
    icon: "diamond",
    userSide: "DiscoverPage → row4 (Section 6)"
  },
  {
    key: "coming_soon",
    label: "Coming Soon",
    description:
      "Upcoming releases (movies + TV + anime). Also gated by the 'upcoming' feature flag.",
    icon: "upcoming",
    userSide: "DiscoverPage → upcomingFeed (Section 8)",
    featureFlagDep: "upcoming"
  }
];

// ─── Component ─────────────────────────────────────────────────────

const AdminHomepagePage: Component = () => {
  const [config, setConfig] = createSignal<HomepageConfig>({ sections: {} });
  const [originalConfig, setOriginalConfig] = createSignal<HomepageConfig>({
    sections: {}
  });
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const toast = signalToast();
  const [draggingKey, setDraggingKey] = createSignal<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/homepage", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { config: HomepageConfig };
      setConfig(data.config);
      setOriginalConfig(data.config);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchConfig);

  // ─── Derived state ───────────────────────────────────────────

  const sortedSections = createMemo(() => {
    const cfg = config();
    return SECTION_META.map((meta) => ({
      ...meta,
      enabled: cfg.sections[meta.key]?.enabled ?? true,
      order: cfg.sections[meta.key]?.order ?? 999
    })).sort((a, b) => a.order - b.order);
  });

  const isDirty = createMemo(() => {
    return JSON.stringify(originalConfig()) !== JSON.stringify(config());
  });

  const activeCount = createMemo(
    () => sortedSections().filter((s) => s.enabled).length
  );

  // ─── Mutations ───────────────────────────────────────────────

  const toggleEnabled = (key: string) => {
    const cfg = config();
    const current = cfg.sections[key] ?? { enabled: true, order: 999 };
    setConfig({
      sections: {
        ...cfg.sections,
        [key]: { ...current, enabled: !current.enabled }
      }
    });
  };

  const moveSection = (key: string, direction: -1 | 1) => {
    const sorted = sortedSections();
    const idx = sorted.findIndex((s) => s.key === key);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[newIdx];
    const cfg = config();
    const aOrder = cfg.sections[a.key]?.order ?? a.order;
    const bOrder = cfg.sections[b.key]?.order ?? b.order;
    setConfig({
      sections: {
        ...cfg.sections,
        [a.key]: {
          ...(cfg.sections[a.key] ?? { enabled: true, order: aOrder }),
          order: bOrder
        },
        [b.key]: {
          ...(cfg.sections[b.key] ?? { enabled: true, order: bOrder }),
          order: aOrder
        }
      }
    });
  };

  // DnD reorder: when a drag ends, recompute the order based on the
  // new position of the dragged item. @thisbeyond/solid-dnd fires
  // onDragEnd with { draggable: { id }, droppable?: { id } | null }.
  const onDragEnd = (payload: {
    draggable: { id: string | number };
    droppable?: { id: string | number } | null;
  }) => {
    const fromKey = String(payload.draggable.id);
    const toKey = payload.droppable ? String(payload.droppable.id) : null;
    setDraggingKey(null);
    if (!toKey || fromKey === toKey) return;

    const sorted = sortedSections();
    const fromIdx = sorted.findIndex((s) => s.key === fromKey);
    const toIdx = sorted.findIndex((s) => s.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;

    // Build the new order array
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Assign sequential order values
    const cfg = config();
    const newSections: Record<string, SectionConfig> = { ...cfg.sections };
    reordered.forEach((s, i) => {
      newSections[s.key] = {
        enabled: cfg.sections[s.key]?.enabled ?? true,
        order: i + 1
      };
    });
    setConfig({ sections: newSections });
  };

  const save = async () => {
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/homepage", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: config().sections })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        toast.show(body.error || "Failed to save", "error");
      } else {
        setConfig(body.config);
        setOriginalConfig(body.config);
        toast.show("Discover layout updated", "success");
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!confirm("Reset all section orders and visibility to defaults?"))
      return;
    const defaults: HomepageConfig = {
      sections: Object.fromEntries(
        SECTION_META.map((m, i) => [
          m.key,
          { enabled: true, order: i + 1 }
        ])
      )
    };
    setConfig(defaults);
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>Discover Layout</h2>
          <p>
            Toggle and reorder the 7 sections that actually render on
            the Discover page. Changes apply to all users within 5
            minutes (config cache TTL).
          </p>
        </div>
        <div class="admin-config-actions">
          <GlassBadge
            intent="default"
            label={`${activeCount()}/${SECTION_META.length} active`}
            size="compact"
          />
          <GlassButton
            variant="secondary"
            size="compact"
            onClick={resetToDefaults}
            disabled={loading() || saving()}
          >
            Reset
          </GlassButton>
          <GlassButton
            variant="primary"
            size="compact"
            onClick={save}
            disabled={!isDirty() || saving() || loading()}
            loading={saving()}
            icon="save"
          >
            {saving() ? "Saving…" : "Save"}
          </GlassButton>
        </div>
      </div>

      <Show when={error()}>
        <div class="admin-config-alert" role="alert">
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-2)" }}>
          <For each={Array.from({ length: 7 })}>
            {() => <GlassSkeleton variant="block" height="60px" />}
          </For>
        </div>
      </Show>

      <Show when={!loading()}>
        <div class="admin-homepage-layout">
          {/* ─── Editor column ─────────────────────────────────── */}
          <div>
            <DragDropProvider
              onDragEnd={onDragEnd}
              collisionDetector={closestCenter}
            >
              <DragDropSensors />
              <div class="admin-homepage-editor">
                <SortableProvider ids={sortedSections().map((s) => s.key)}>
                  <For each={sortedSections()}>
                    {(section, idx) => (
                      <SortableSectionRow
                        section={section}
                        index={idx()}
                        total={sortedSections().length}
                        isDragging={draggingKey() === section.key}
                        onDragStart={() => setDraggingKey(section.key)}
                        onMoveUp={() => moveSection(section.key, -1)}
                        onMoveDown={() => moveSection(section.key, 1)}
                        onToggle={() => toggleEnabled(section.key)}
                      />
                    )}
                  </For>
                </SortableProvider>
              </div>
            </DragDropProvider>

            <Show when={isDirty()}>
              <div
                style={{
                  "margin-top": "var(--sp-4)",
                  display: "flex",
                  gap: "var(--sp-2)",
                  "justify-content": "flex-end"
                }}
              >
                <GlassButton
                  variant="ghost"
                  size="compact"
                  onClick={() => setConfig(originalConfig())}
                >
                  Discard
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="compact"
                  onClick={save}
                  disabled={saving()}
                  loading={saving()}
                  icon="save"
                >
                  {saving() ? "Saving…" : "Save Changes"}
                </GlassButton>
              </div>
            </Show>
          </div>

          {/* ─── Live Preview column ──────────────────────────── */}
          <div class="admin-homepage-preview">
            <div class="admin-homepage-preview-header">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "1rem" }}
              >
                preview
              </span>
              Live Preview
            </div>
            <div class="admin-homepage-preview-mock">
              <For each={sortedSections()}>
                {(section) => (
                  <Show when={section.enabled}>
                    <Show
                      when={section.key === "spotlight"}
                      fallback={
                        <div class="admin-preview-rail">
                          <div class="admin-preview-rail-label">
                            <span
                              class="material-symbols-outlined"
                              style={{ "font-size": "0.85rem" }}
                            >
                              {section.icon}
                            </span>
                            {section.label}
                          </div>
                          <div class="admin-preview-rail-posters">
                            <For each={Array.from({ length: 6 })}>
                              {() => <div class="admin-preview-poster" />}
                            </For>
                          </div>
                        </div>
                      }
                    >
                      <div class="admin-preview-hero">
                        <span
                          class="material-symbols-outlined"
                          style={{
                            "font-size": "1rem",
                            "margin-right": "var(--sp-1)"
                          }}
                        >
                          {section.icon}
                        </span>
                        {section.label} (hero)
                      </div>
                    </Show>
                  </Show>
                )}
              </For>
              <Show when={activeCount() === 0}>
                <div class="admin-preview-empty">
                  All sections disabled — Discover page will be empty.
                </div>
              </Show>
            </div>
            <p
              style={{
                "font-size": "0.7rem",
                color: "var(--text-muted)",
                "margin-top": "var(--sp-3)",
                "line-height": "1.4"
              }}
            >
              Preview reflects the saved + unsaved toggle/order state.
              "Coming Soon" also requires the <code>upcoming</code> feature
              flag to be ON.
            </p>
          </div>
        </div>
      </Show>

      {/* ─── Toast ──────────────────────────────────────────────── */}
      <Show when={toast.msg()}>
        {(m) => (
          <div class={`admin-config-toast ${m().type}`}>{m().text}</div>
        )}
      </Show>
    </div>
  );
};

// ─── Sortable section row (sub-component) ──────────────────────────

interface SortableSectionRowProps {
  section: SectionMeta & { enabled: boolean; order: number };
  index: number;
  total: number;
  isDragging: boolean;
  onDragStart: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: () => void;
}

const SortableSectionRow = (props: SortableSectionRowProps) => {
  const sortable = createSortable(props.section.key);

  return (
    <div
      ref={sortable.ref}
      class={`admin-homepage-section-card ${
        props.section.enabled ? "" : "disabled-section"
      } ${props.isDragging ? "dragging" : ""}`}
      style={{
        background: "var(--glass-bg-strong)",
        border: "1px solid var(--hairline)",
        "border-radius": "var(--radius-md)"
      }}
    >
      <div
        class="admin-homepage-drag-handle"
        {...sortable.dragActivators}
        onPointerDown={() => props.onDragStart()}
        title="Drag to reorder"
        aria-label={`Drag handle for ${props.section.label}`}
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "1.1rem" }}
        >
          drag_indicator
        </span>
      </div>

      <span class="admin-homepage-section-order">#{props.index + 1}</span>

      <span class="admin-homepage-section-icon">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "1.2rem" }}
        >
          {props.section.icon}
        </span>
      </span>

      <div class="admin-homepage-section-body">
        <div class="admin-homepage-section-label">
          {props.section.label}
          <Show when={props.section.featureFlagDep}>
            <GlassBadge
              intent="warning"
              label={`needs ${props.section.featureFlagDep} flag`}
              size="compact"
            />
          </Show>
        </div>
        <div class="admin-homepage-section-desc">
          {props.section.description}
        </div>
      </div>

      <div class="admin-homepage-section-actions">
        <button
          class="admin-homepage-icon-btn"
          onClick={props.onMoveUp}
          disabled={props.index === 0}
          aria-label={`Move ${props.section.label} up`}
          title="Move up"
        >
          ↑
        </button>
        <button
          class="admin-homepage-icon-btn"
          onClick={props.onMoveDown}
          disabled={props.index === props.total - 1}
          aria-label={`Move ${props.section.label} down`}
          title="Move down"
        >
          ↓
        </button>
        <button
          class="admin-config-toggle"
          role="switch"
          aria-checked={props.section.enabled}
          aria-label={`Toggle ${props.section.label}`}
          onClick={props.onToggle}
        >
          <span class="toggle-knob" />
        </button>
      </div>
    </div>
  );
};

// ─── Toast helper ──────────────────────────────────────────────────

function signalToast() {
  const [msg, setMsg] = createSignal<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (text: string, type: "success" | "error") => {
    setMsg({ text, type });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setMsg(null), 2800);
  };
  return { msg, show };
}

export default AdminHomepagePage;
