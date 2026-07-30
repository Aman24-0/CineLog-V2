// src/features/admin/AdminHomepagePage.tsx
//
// CineLog V2 — Admin Homepage Sections Page
// ---------------------------------------------------------------------
// UI:
//   - List of 16 Discover sections, each as a draggable card
//   - Each card shows: section name, current order, enabled toggle
//   - "Move up" / "Move down" buttons to reorder
//   - Save button to commit changes
//   - Live preview of the resulting order
//
// Backend:
//   GET /api/admin/homepage     — fetch current config
//   PUT /api/admin/homepage     — save updated config

import {
  createSignal,
  Show,
  For,
  onMount,
  createMemo,
  type Component,
  type JSX
} from "solid-js";

interface SectionConfig {
  enabled: boolean;
  order: number;
}

interface HomepageConfig {
  sections: Record<string, SectionConfig>;
}

const SECTION_META: {
  key: string;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "genre_explorer",
    label: "Genre Explorer",
    description: "Chips + continuous carousel for browsing by genre.",
    icon: "🎭"
  },
  {
    key: "spotlight",
    label: "Spotlight",
    description: "Hero card with a single highlighted title.",
    icon: "🔦"
  },
  {
    key: "continue_universes",
    label: "Continue Your Universes",
    description: "Resume curated universes the user has started.",
    icon: "📚"
  },
  {
    key: "insight_strip",
    label: "Insight Strip",
    description: "Quick stat cards (watch time, top genres, etc.).",
    icon: "📊"
  },
  {
    key: "trending",
    label: "Trending This Week",
    description: "TMDB trending movies & series.",
    icon: "🔥"
  },
  {
    key: "theatres",
    label: "In Theatres Now",
    description: "Currently playing in theatres (region-aware).",
    icon: "🎬"
  },
  {
    key: "because_you_love",
    label: "Because You Love…",
    description: "Personalized recommendations based on vault.",
    icon: "❤️"
  },
  {
    key: "surprise_me",
    label: "Surprise Me",
    description: "Random title picker (gated by random_picker flag).",
    icon: "🎲"
  },
  {
    key: "weekend_picks",
    label: "Weekend Picks",
    description: "Editorial picks for the weekend.",
    icon: "📅"
  },
  {
    key: "step_outside",
    label: "Step Outside Your Taste",
    description: "Titles outside the user's usual genres.",
    icon: "🧭"
  },
  {
    key: "hidden_gems",
    label: "Hidden Gems",
    description: "Low-vote high-rated titles.",
    icon: "💎"
  },
  {
    key: "top_rated_movies",
    label: "Top Rated Movies",
    description: "All-time top-rated movies from TMDB.",
    icon: "⭐"
  },
  {
    key: "top_rated_series",
    label: "Top Rated Series",
    description: "All-time top-rated TV series from TMDB.",
    icon: "📺"
  },
  {
    key: "new_on_ott",
    label: "New on OTT",
    description: "Streaming provider releases (region-aware).",
    icon: "🎥"
  },
  {
    key: "new_seasons",
    label: "New Seasons",
    description: "Recently-released new seasons.",
    icon: "🆕"
  },
  {
    key: "coming_soon",
    label: "Coming Soon",
    description: "Upcoming releases (gated by upcoming flag).",
    icon: "🔜"
  }
];

const AdminHomepagePage: Component = () => {
  const [config, setConfig] = createSignal<HomepageConfig>({ sections: {} });
  const [originalConfig, setOriginalConfig] = createSignal<HomepageConfig>({
    sections: {}
  });
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchConfig = async () => {
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

  // Sort sections by order for display
  const sortedSections = createMemo(() => {
    const cfg = config();
    return SECTION_META.map((meta) => ({
      ...meta,
      enabled: cfg.sections[meta.key]?.enabled ?? true,
      order: cfg.sections[meta.key]?.order ?? 999
    })).sort((a, b) => a.order - b.order);
  });

  const isDirty = createMemo(() => {
    const orig = JSON.stringify(originalConfig());
    const curr = JSON.stringify(config());
    return orig !== curr;
  });

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

    // Swap the order values of the two adjacent sections
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
        showToast(body.error || "Failed to save", "error");
      } else {
        setConfig(body.config);
        setOriginalConfig(body.config);
        showToast("Homepage sections updated", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!confirm("Reset all section orders and visibility to defaults?"))
      return;
    const defaults: HomepageConfig = {
      sections: Object.fromEntries(
        SECTION_META.map((m, i) => [m.key, { enabled: true, order: i + 1 }])
      )
    };
    setConfig(defaults);
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
            Homepage Sections
          </h2>
          <p
            style={{
              "font-size": "0.875rem",
              color: "var(--text-muted)",
              margin: 0
            }}
          >
            Toggle and reorder the 16 Discover sections. Changes apply to all
            users immediately.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", "flex-shrink": 0 }}>
          <button
            onClick={resetToDefaults}
            style={btnSecondary}
            disabled={loading() || saving()}
          >
            Reset
          </button>
          <button
            onClick={save}
            disabled={!isDirty() || saving() || loading()}
            style={isDirty() && !saving() ? btnPrimary : btnDisabled}
          >
            {saving() ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <Show when={error()}>
        <div role="alert" style={alertError}>
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-3)"
          }}
        >
          <For each={Array.from({ length: 8 })}>
            {() => <div style={{ ...skeletonCard, height: "70px" }} />}
          </For>
        </div>
      </Show>

      <Show when={!loading()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-2)"
          }}
        >
          <For each={sortedSections()}>
            {(section, idx) => (
              <div
                style={{
                  ...cardStyle,
                  opacity: section.enabled ? 1 : 0.55,
                  "border-color": section.enabled
                    ? "var(--hairline)"
                    : "var(--hairline-strong)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--sp-3)",
                    flex: 1
                  }}
                >
                  <span
                    style={{
                      "font-size": "1.25rem",
                      width: "28px",
                      "text-align": "center"
                    }}
                  >
                    {section.icon}
                  </span>
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-weight": "600",
                        color: "var(--text)",
                        "font-size": "0.95rem"
                      }}
                    >
                      {section.label}
                    </div>
                    <div
                      style={{
                        "font-size": "0.8rem",
                        color: "var(--text-muted)",
                        "margin-top": "2px"
                      }}
                    >
                      {section.description}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--sp-2)"
                  }}
                >
                  <span
                    style={{
                      "font-size": "0.75rem",
                      color: "var(--text-muted)",
                      "min-width": "20px",
                      "text-align": "right"
                    }}
                  >
                    #{section.order}
                  </span>
                  <button
                    onClick={() => moveSection(section.key, -1)}
                    disabled={idx() === 0}
                    style={idx() === 0 ? iconBtnDisabled : iconBtn}
                    aria-label={`Move ${section.label} up`}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveSection(section.key, 1)}
                    disabled={idx() === sortedSections().length - 1}
                    style={
                      idx() === sortedSections().length - 1
                        ? iconBtnDisabled
                        : iconBtn
                    }
                    aria-label={`Move ${section.label} down`}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => toggleEnabled(section.key)}
                    style={section.enabled ? toggleOn : toggleOff}
                    aria-label={`Toggle ${section.label}`}
                  >
                    {section.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={toast()}>
        <div
          style={{
            position: "fixed",
            bottom: "var(--sp-6)",
            right: "var(--sp-6)",
            "z-index": 100,
            background:
              toast()?.type === "success"
                ? "rgb(34, 197, 94)"
                : "rgb(239, 68, 68)",
            color: "white",
            padding: "var(--sp-3) var(--sp-4)",
            "border-radius": "var(--radius-md)",
            "font-size": "0.875rem",
            "font-weight": "600",
            "box-shadow": "0 10px 25px rgba(0,0,0,0.3)"
          }}
        >
          {toast()?.msg}
        </div>
      </Show>
    </div>
  );
};

// ─── Style constants ────────────────────────────────────────────────

const cardStyle: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  padding: "var(--sp-3) var(--sp-4)",
  display: "flex",
  "align-items": "center",
  gap: "var(--sp-3)",
  transition: "opacity 0.15s, border-color 0.15s"
};

const skeletonCard: JSX.CSSProperties = {
  background: "var(--tier-1)",
  border: "1px solid var(--hairline)",
  "border-radius": "var(--radius-lg)",
  animation: "pulse 1.5s ease-in-out infinite"
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

const btnDisabled: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-2) var(--sp-4)",
  "border-radius": "var(--radius-md)",
  "font-weight": "500",
  "font-size": "0.875rem",
  cursor: "not-allowed",
  opacity: 0.5
};

const iconBtn: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text)",
  border: "1px solid var(--hairline)",
  width: "28px",
  height: "28px",
  "border-radius": "var(--radius-sm)",
  cursor: "pointer",
  "font-size": "0.875rem",
  display: "flex",
  "align-items": "center",
  "justify-content": "center"
};

const iconBtnDisabled: JSX.CSSProperties = {
  ...iconBtn,
  opacity: 0.3,
  cursor: "not-allowed"
};

const toggleOn: JSX.CSSProperties = {
  background: "var(--accent, #00d9a3)",
  color: "var(--void, #0a0e14)",
  border: "none",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.75rem",
  cursor: "pointer",
  "min-width": "42px"
};

const toggleOff: JSX.CSSProperties = {
  background: "var(--tier-2)",
  color: "var(--text-muted)",
  border: "1px solid var(--hairline)",
  padding: "var(--sp-1) var(--sp-3)",
  "border-radius": "var(--radius-sm)",
  "font-weight": "700",
  "font-size": "0.75rem",
  cursor: "pointer",
  "min-width": "42px"
};

export default AdminHomepagePage;
