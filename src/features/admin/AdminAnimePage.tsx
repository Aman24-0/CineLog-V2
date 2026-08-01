// src/features/admin/AdminAnimePage.tsx
//
// CineLog V2 — Admin Anime Integration Page
// ---------------------------------------------------------------------
// Phase 8 — Admin UI for the AniList integration.
//
// SECTIONS:
//   1. Master Toggle — enable/disable all anime features
//   2. Feature Toggles — per-section on/off
//      - Seasonal Carousel
//      - Characters & Staff
//      - Relations
//      - Airing Schedule
//      - Opening/Ending Themes
//      - Auto-Mapping
//   3. Performance Settings
//      - API Timeout (ms)
//      - Cache TTL: Details, Trending, Seasonal, Upcoming (hours)
//      - Rate Limit Buffer (%)
//
// DATA FLOW:
//   • GET /api/admin/anime-settings returns { settings: AnimeSettings }
//   • PUT /api/admin/anime-settings with { settings: Partial<AnimeSettings> }
//   • Each toggle autosaves on change (no Save button needed).
//   • Optimistic UI — toggle immediately, revert on error.
//
// USAGE:
//   Navigated to via /admin/anime (added to AdminShell nav).

import { createSignal, Show, onMount, type Component, type JSX } from "solid-js";

interface AnimeSettings {
  enabled: boolean;
  seasonal_carousel: boolean;
  characters_staff: boolean;
  relations: boolean;
  airing_schedule: boolean;
  opening_ending_themes: boolean;
  auto_mapping: boolean;
  api_timeout_ms: number;
  cache_ttl_details_hours: number;
  cache_ttl_trending_hours: number;
  cache_ttl_seasonal_hours: number;
  cache_ttl_upcoming_hours: number;
  rate_limit_buffer_percent: number;
}

const DEFAULTS: AnimeSettings = {
  enabled: true,
  seasonal_carousel: true,
  characters_staff: true,
  relations: true,
  airing_schedule: true,
  opening_ending_themes: true,
  auto_mapping: true,
  api_timeout_ms: 10000,
  cache_ttl_details_hours: 24,
  cache_ttl_trending_hours: 6,
  cache_ttl_seasonal_hours: 6,
  cache_ttl_upcoming_hours: 12,
  rate_limit_buffer_percent: 10
};

const TOGGLE_META: Array<{
  key: keyof AnimeSettings;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    key: "seasonal_carousel",
    label: "Seasonal Carousel",
    description: "Show \"This Season's Anime\" rail on the Discover page.",
    icon: "event"
  },
  {
    key: "characters_staff",
    label: "Characters & Voice Actors",
    description: "Show character grid with Japanese voice actor names on anime detail pages.",
    icon: "groups"
  },
  {
    key: "relations",
    label: "Relations",
    description: "Show prequels, sequels, side stories, and spin-offs on anime detail pages.",
    icon: "account_tree"
  },
  {
    key: "airing_schedule",
    label: "Airing Schedule",
    description: "Show next episode number, date, and countdown on currently-airing anime.",
    icon: "schedule"
  },
  {
    key: "opening_ending_themes",
    label: "Opening & Ending Themes",
    description: "Show theme song titles with episode ranges on anime detail pages.",
    icon: "music_note"
  },
  {
    key: "auto_mapping",
    label: "Auto-Mapping",
    description: "Automatically search AniList to map anime titles by title + year. Disable to require manual admin mapping only.",
    icon: "auto_awesome"
  }
];

const NUMERIC_META: Array<{
  key: keyof AnimeSettings;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
}> = [
  {
    key: "api_timeout_ms",
    label: "API Timeout",
    description: "How long to wait for an AniList response before giving up.",
    unit: "ms",
    min: 1000,
    max: 60000
  },
  {
    key: "cache_ttl_details_hours",
    label: "Cache TTL — Details",
    description: "How long to cache AniList detail responses (characters, studios, etc.).",
    unit: "hours",
    min: 1,
    max: 168
  },
  {
    key: "cache_ttl_trending_hours",
    label: "Cache TTL — Trending",
    description: "How long to cache the Trending Anime carousel.",
    unit: "hours",
    min: 1,
    max: 72
  },
  {
    key: "cache_ttl_seasonal_hours",
    label: "Cache TTL — Seasonal",
    description: "How long to cache the This Season's Anime carousel.",
    unit: "hours",
    min: 1,
    max: 72
  },
  {
    key: "cache_ttl_upcoming_hours",
    label: "Cache TTL — Upcoming",
    description: "How long to cache the Upcoming Anime carousel.",
    unit: "hours",
    min: 1,
    max: 168
  },
  {
    key: "rate_limit_buffer_percent",
    label: "Rate Limit Buffer",
    description: "Stop firing AniList requests when X-RateLimit-Remaining drops below this % of the bucket. 10% is a safe default.",
    unit: "%",
    min: 0,
    max: 90
  }
];

const AdminAnimePage: Component = () => {
  const [settings, setSettings] = createSignal<AnimeSettings>(DEFAULTS);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal<Record<string, boolean>>({});

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/anime-settings");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { settings?: Partial<AnimeSettings> };
      if (data.settings) {
        setSettings({ ...DEFAULTS, ...data.settings });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchSettings);

  const updateSetting = async <K extends keyof AnimeSettings>(
    key: K,
    value: AnimeSettings[K]
  ) => {
    const prev = settings();
    const next = { ...prev, [key]: value };
    setSettings(next);
    setSaving({ ...saving(), [key]: true });
    try {
      const resp = await fetch("/api/admin/anime-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [key]: value } })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { settings: AnimeSettings };
      setSettings(data.settings);
    } catch (err) {
      // Revert on error.
      setSettings(prev);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      const nextSaving = { ...saving() };
      delete nextSaving[key as string];
      setSaving(nextSaving);
    }
  };

  // ─── Styles (inline to match AdminFeatureFlagsPage pattern) ──────

  const containerStyle: JSX.CSSProperties = {
    "max-width": "780px",
    margin: "0 auto",
    padding: "var(--sp-6) var(--sp-4)"
  };
  const headerStyle: JSX.CSSProperties = {
    "margin-bottom": "var(--sp-6)"
  };
  const sectionStyle: JSX.CSSProperties = {
    "margin-bottom": "var(--sp-6)",
    background: "var(--tier-1)",
    border: "1px solid var(--hairline)",
    "border-radius": "var(--radius-md)",
    padding: "var(--sp-6)"
  };
  const cardStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "var(--sp-4)",
    padding: "var(--sp-3) 0",
    "border-bottom": "1px solid var(--hairline)"
  };
  const numericRowStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "var(--sp-4)",
    padding: "var(--sp-3) 0",
    "border-bottom": "1px solid var(--hairline)"
  };
  const inputStyle: JSX.CSSProperties = {
    width: "100px",
    padding: "var(--sp-2) var(--sp-3)",
    background: "var(--tier-2)",
    border: "1px solid var(--hairline)",
    "border-radius": "var(--radius-sm)",
    color: "var(--text)",
    "font-size": "0.875rem"
  };
  const toggleBtnStyle = (on: boolean): JSX.CSSProperties => ({
    position: "relative",
    width: "44px",
    height: "24px",
    "border-radius": "12px",
    background: on ? "var(--p)" : "var(--tier-3)",
    border: "1px solid var(--hairline)",
    cursor: "pointer",
    transition: "background 0.15s ease",
    flex: "none"
  });
  const toggleKnobStyle = (on: boolean): JSX.CSSProperties => ({
    position: "absolute",
    top: "2px",
    left: on ? "22px" : "2px",
    width: "18px",
    height: "18px",
    "border-radius": "50%",
    background: "var(--text-on-primary, #fff)",
    transition: "left 0.15s ease"
  });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, "font-size": "1.5rem", color: "var(--text)" }}>
          Anime Integration
        </h1>
        <p
          style={{
            margin: "var(--sp-1) 0 0 0",
            "font-size": "0.875rem",
            color: "var(--text-muted)"
          }}
        >
          Configure the AniList GraphQL integration. AniList provides
          anime-specific enrichment (characters, voice actors, relations,
          airing schedule, theme songs) on top of TMDB metadata.
        </p>
      </div>

      <Show when={error()}>
        <div
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            background: "rgba(220, 50, 47, 0.1)",
            border: "1px solid rgba(220, 50, 47, 0.3)",
            "border-radius": "var(--radius-sm)",
            color: "var(--text)",
            "margin-bottom": "var(--sp-4)",
            "font-size": "0.875rem"
          }}
        >
          {error()}
        </div>
      </Show>

      <Show when={!loading()} fallback={<div style={{ padding: "var(--sp-8)", "text-align": "center", color: "var(--text-muted)" }}>Loading…</div>}>
        {/* Master Toggle */}
        <section style={sectionStyle}>
          <h2 style={{ margin: "0 0 var(--sp-2) 0", "font-size": "1.125rem", color: "var(--text)" }}>
            Master Toggle
          </h2>
          <p style={{ margin: "0 0 var(--sp-4) 0", "font-size": "0.8125rem", color: "var(--text-muted)" }}>
            Disable to turn off ALL AniList features. The Discover anime
            carousels, anime detail sections, and anime recommendations
            will all be hidden. TMDB and MDBList continue to work.
          </p>
          <div style={cardStyle}>
            <div>
              <div style={{ "font-weight": 600, color: "var(--text)", "font-size": "0.9375rem" }}>
                Enable Anime Integration
              </div>
              <div style={{ "font-size": "0.75rem", color: "var(--text-muted)", "margin-top": "2px" }}>
                Master switch for all AniList features
              </div>
            </div>
            <button
              type="button"
              style={toggleBtnStyle(settings().enabled)}
              onClick={() => updateSetting("enabled", !settings().enabled)}
              aria-label="Toggle anime integration"
            >
              <span style={toggleKnobStyle(settings().enabled)} />
            </button>
          </div>
        </section>

        {/* Feature Toggles */}
        <section style={sectionStyle}>
          <h2 style={{ margin: "0 0 var(--sp-2) 0", "font-size": "1.125rem", color: "var(--text)" }}>
            Feature Toggles
          </h2>
          <p style={{ margin: "0 0 var(--sp-4) 0", "font-size": "0.8125rem", color: "var(--text-muted)" }}>
            Turn individual anime features on or off. Each toggle takes
            effect immediately for all users.
          </p>
          {TOGGLE_META.map((meta) => (
            <div style={cardStyle}>
              <div style={{ display: "flex", gap: "var(--sp-3)", "align-items": "flex-start", flex: "1" }}>
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "20px", color: "var(--p)", "margin-top": "2px" }}
                  aria-hidden="true"
                >
                  {meta.icon}
                </span>
                <div>
                  <div style={{ "font-weight": 600, color: "var(--text)", "font-size": "0.9375rem" }}>
                    {meta.label}
                  </div>
                  <div style={{ "font-size": "0.75rem", color: "var(--text-muted)", "margin-top": "2px" }}>
                    {meta.description}
                  </div>
                </div>
              </div>
              <button
                type="button"
                style={toggleBtnStyle(settings()[meta.key] as boolean)}
                onClick={() =>
                  updateSetting(meta.key, !(settings()[meta.key] as boolean))
                }
                disabled={!settings().enabled}
                aria-label={`Toggle ${meta.label}`}
              >
                <span style={toggleKnobStyle(settings()[meta.key] as boolean)} />
              </button>
            </div>
          ))}
        </section>

        {/* Performance Settings */}
        <section style={sectionStyle}>
          <h2 style={{ margin: "0 0 var(--sp-2) 0", "font-size": "1.125rem", color: "var(--text)" }}>
            Performance & Caching
          </h2>
          <p style={{ margin: "0 0 var(--sp-4) 0", "font-size": "0.8125rem", color: "var(--text-muted)" }}>
            Tune AniList request timeouts and cache TTLs. Higher TTLs
            reduce AniList API load but mean slower updates when AniList
            data changes.
          </p>
          {NUMERIC_META.map((meta) => (
            <div style={numericRowStyle}>
              <div style={{ flex: "1" }}>
                <div style={{ "font-weight": 600, color: "var(--text)", "font-size": "0.9375rem" }}>
                  {meta.label}
                </div>
                <div style={{ "font-size": "0.75rem", color: "var(--text-muted)", "margin-top": "2px" }}>
                  {meta.description}
                </div>
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "var(--sp-2)" }}>
                <input
                  type="number"
                  value={String(settings()[meta.key])}
                  min={meta.min}
                  max={meta.max}
                  disabled={!settings().enabled}
                  style={inputStyle}
                  onChange={(e) => {
                    const v = parseInt(e.currentTarget.value, 10);
                    if (!Number.isNaN(v)) {
                      updateSetting(meta.key, v as unknown as never);
                    }
                  }}
                />
                <span style={{ "font-size": "0.75rem", color: "var(--text-muted)", "min-width": "44px" }}>
                  {meta.unit}
                </span>
              </div>
            </div>
          ))}
        </section>

        <div
          style={{
            "margin-top": "var(--sp-4)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "var(--tier-2)",
            "border-radius": "var(--radius-sm)",
            "font-size": "0.75rem",
            color: "var(--text-muted)"
          }}
        >
          AniList GraphQL endpoint: <code>https://graphql.anilist.co</code>
          <br />
          Anonymous rate limit: 90 req/min/IP. Set <code>ANILIST_ACCESS_TOKEN</code> in
          the server env to raise this to 120 req/min.
        </div>
      </Show>
    </div>
  );
};

export default AdminAnimePage;
