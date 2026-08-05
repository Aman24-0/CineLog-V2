// src/features/admin/AdminAnimePage.tsx
//
// CineLog V2 — Admin Anime Management Page (Phase 9 Chunk 5c)
// ---------------------------------------------------------------------
// The single admin surface for AniList integration. Three tabs:
//
//   1. SETTINGS — every toggle in the `anime_settings` JSONB.
//      Strict user-side mapping: each toggle below maps 1:1 to a
//      field returned by `useAnimeSettings` (the public hook the
//      Discover page + Details modal actually read). No dummy
//      toggles.
//
//   2. MAPPING QUEUE — list / search / filter / approve / edit /
//      delete TMDB ↔ AniList mappings from the `anime_mappings`
//      table. Approving = promoting confidence to "manual" (the
//      highest tier — never auto-overwritten). Rejecting = DELETE.
//
//   3. CACHE STATUS — AniList cache TTLs, timeout config, and rate
//      limit buffer. These are the same numeric fields exposed via
//      useAnimeSettings (cacheTtl*, apiTimeoutMs, rateLimitBufferPercent)
//      so this tab is the operational view of those settings —
//      editing them here updates the same JSONB the Settings tab
//      edits, just presented in a stat-card layout. No duplication:
//      the underlying value is one row in app_config.
//
// ZERO DUPLICATION: Anime settings live ONLY on this page. The
// AniList Services Hub page (/admin/services/anilist) intentionally
// does NOT replicate any toggle — it links here instead. (Audit
// verified before rewrite.)
//
// NO OMDB: This page references only AniList + TMDB. No OMDB code
// paths touched.
//
// MOBILE-FIRST: Tab bar is a horizontal scroll strip on narrow
// viewports. The mapping queue table collapses to stacked cards on
// <720px (each row becomes a card with the same fields, just
// vertically arranged). Settings toggles and numeric inputs are
// responsive. Modal forms collapse to single column on mobile.

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component,
  type JSX
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassTabs, type GlassTabItem } from "~/shared/ui/glass/GlassTabs";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";

// ─── Types ─────────────────────────────────────────────────────────

interface AnimeSettings {
  enabled: boolean;
  seasonal_carousel: boolean;
  trending_carousel: boolean;
  upcoming_carousel: boolean;
  top_rated_carousel: boolean;
  hidden_gems_carousel: boolean;
  popular_carousel: boolean;
  anime_movies_carousel: boolean;
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

type TabValue = "settings" | "mappings" | "cache";

type Confidence = "high" | "medium" | "low" | "manual";

interface AnimeMapping {
  id: string;
  tmdb_id: number;
  tmdb_type: "movie" | "tv";
  anilist_id: number;
  anilist_type: "ANIME" | "MANGA";
  title: string | null;
  match_confidence: Confidence;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MappingsResponse {
  mappings: AnimeMapping[];
  total: number;
  limit: number;
  offset: number;
}

interface EditForm {
  id: string;
  tmdb_id: string;
  tmdb_type: "movie" | "tv";
  anilist_id: string;
  anilist_type: "ANIME" | "MANGA";
  title: string;
  match_confidence: Confidence;
}

// ─── Defaults ──────────────────────────────────────────────────────

const DEFAULTS: AnimeSettings = {
  enabled: true,
  seasonal_carousel: true,
  trending_carousel: true,
  upcoming_carousel: true,
  top_rated_carousel: true,
  hidden_gems_carousel: true,
  popular_carousel: true,
  anime_movies_carousel: true,
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

// ─── Toggle metadata ───────────────────────────────────────────────
//
// Each entry maps 1:1 to a field on the `useAnimeSettings` hook.
// The `userSide` field documents where the toggle actually takes
// effect on the user side — this is the strict user-side mapping
// required by Phase 9.

interface ToggleMeta {
  key: keyof AnimeSettings;
  label: string;
  description: string;
  icon: string;
  userSide: string;
}

const CAROUSEL_TOGGLES: ToggleMeta[] = [
  {
    key: "trending_carousel",
    label: "Trending Anime Carousel",
    description: "Show the \"Trending Anime\" rail on the Discover page.",
    icon: "whatshot",
    userSide: "useAnimeSettings.trendingCarousel → DiscoverPage rail"
  },
  {
    key: "seasonal_carousel",
    label: "Seasonal Anime Carousel",
    description: "Show \"This Season's Anime\" rail on the Discover page.",
    icon: "event",
    userSide: "useAnimeSettings.seasonalCarousel → DiscoverPage rail"
  },
  {
    key: "upcoming_carousel",
    label: "Upcoming Anime Carousel",
    description: "Show the \"Upcoming Anime\" rail on the Discover page.",
    icon: "upcoming",
    userSide: "useAnimeSettings.upcomingCarousel → DiscoverPage rail"
  },
  {
    key: "top_rated_carousel",
    label: "Top Rated Anime Carousel",
    description: "Show the \"Top Rated Anime\" rail on the Discover page.",
    icon: "star",
    userSide: "useAnimeSettings.topRatedCarousel → DiscoverPage rail"
  },
  {
    key: "popular_carousel",
    label: "Popular Anime Carousel",
    description: "Show the \"Popular Anime\" rail on the Discover page.",
    icon: "trending_up",
    userSide: "useAnimeSettings.popularCarousel → DiscoverPage rail"
  },
  {
    key: "hidden_gems_carousel",
    label: "Hidden Gems Anime Carousel",
    description: "Show the \"Hidden Gems Anime\" rail on the Discover page.",
    icon: "diamond",
    userSide: "useAnimeSettings.hiddenGemsCarousel → DiscoverPage rail"
  },
  {
    key: "anime_movies_carousel",
    label: "Anime Films Carousel",
    description: "Show the \"Anime Films\" rail on the Discover page.",
    icon: "movie",
    userSide: "useAnimeSettings.animeMoviesCarousel → DiscoverPage rail"
  }
];

const DETAIL_TOGGLES: ToggleMeta[] = [
  {
    key: "characters_staff",
    label: "Characters & Voice Actors",
    description:
      "Show character grid with Japanese voice actor names on anime detail pages.",
    icon: "groups",
    userSide: "useAnimeSettings.charactersStaff → DetailsModal section"
  },
  {
    key: "relations",
    label: "Relations",
    description:
      "Show prequels, sequels, side stories, and spin-offs on anime detail pages.",
    icon: "account_tree",
    userSide: "useAnimeSettings.relations → DetailsModal section"
  },
  {
    key: "airing_schedule",
    label: "Airing Schedule",
    description:
      "Show next episode number, date, and countdown on currently-airing anime.",
    icon: "schedule",
    userSide: "useAnimeSettings.airingSchedule → DetailsModal section"
  },
  {
    key: "opening_ending_themes",
    label: "Opening & Ending Themes",
    description:
      "Show theme song titles with episode ranges on anime detail pages.",
    icon: "music_note",
    userSide: "useAnimeSettings.openingEndingThemes → DetailsModal section"
  }
];

const AUTOMATION_TOGGLES: ToggleMeta[] = [
  {
    key: "auto_mapping",
    label: "Auto-Mapping",
    description:
      "Automatically search AniList to map anime titles by title + year. Disable to require manual admin mapping only.",
    icon: "auto_awesome",
    userSide:
      "useAnimeSettings.autoMapping → useAnimeEnrichment autoMap() gate"
  }
];

// ─── Numeric (cache + timeout) metadata ────────────────────────────

interface NumericMeta {
  key: keyof AnimeSettings;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
}

const NUMERIC_META: NumericMeta[] = [
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
    description:
      "How long to cache AniList detail responses (characters, studios, etc.).",
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
    description:
      "Stop firing AniList requests when X-RateLimit-Remaining drops below this % of the bucket. 10% is a safe default.",
    unit: "%",
    min: 0,
    max: 90
  }
];

// ─── Confidence metadata ───────────────────────────────────────────

const CONFIDENCE_META: Record<
  Confidence,
  { label: string; intent: "success" | "warning" | "danger" | "primary"; description: string }
> = {
  high: {
    label: "High",
    intent: "success",
    description: "Strong title + year match. Auto-applied."
  },
  medium: {
    label: "Medium",
    intent: "warning",
    description: "Title match without confident year. Auto-applied."
  },
  low: {
    label: "Low",
    intent: "danger",
    description: "Weak / fuzzy match. Needs admin review."
  },
  manual: {
    label: "Manual",
    intent: "primary",
    description: "Admin-approved. Never overwritten by auto-mapping."
  }
};

// ─── Page component ────────────────────────────────────────────────

const AdminAnimePage: Component = () => {
  const [tab, setTab] = createSignal<TabValue>("settings");
  const [settings, setSettings] = createSignal<AnimeSettings>(DEFAULTS);
  const [loadingSettings, setLoadingSettings] = createSignal(true);
  const [settingsError, setSettingsError] = createSignal<string | null>(null);
  const [savingKey, setSavingKey] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Settings load + save ─────────────────────────────────────
  const fetchSettings = async () => {
    setLoadingSettings(true);
    setSettingsError(null);
    try {
      const resp = await fetch("/api/admin/anime-settings");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { settings?: Partial<AnimeSettings> };
      if (data.settings) {
        setSettings({ ...DEFAULTS, ...data.settings });
      }
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Failed to load settings"
      );
    } finally {
      setLoadingSettings(false);
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
    setSavingKey(key as string);
    try {
      const resp = await fetch("/api/admin/anime-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [key]: value } })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { settings: AnimeSettings };
      setSettings(data.settings);
      showToast("Saved", "success");
    } catch (err) {
      setSettings(prev);
      showToast(
        err instanceof Error ? err.message : "Save failed",
        "error"
      );
    } finally {
      setSavingKey(null);
    }
  };

  // ── Tab definitions ──────────────────────────────────────────
  const tabs = createMemo<GlassTabItem<TabValue>[]>(() => [
    { value: "settings", label: "Settings", icon: "tune" },
    { value: "mappings", label: "Mapping Queue", icon: "fact_check" },
    { value: "cache", label: "Cache Status", icon: "cached" }
  ]);

  return (
    <div class="admin-anime-page">
      <div class="admin-anime-header">
        <h2 class="admin-anime-title">Anime Integration</h2>
        <p class="admin-anime-subtitle">
          Configure the AniList GraphQL integration. AniList provides
          anime-specific enrichment (characters, voice actors, relations,
          airing schedule, theme songs) on top of TMDB metadata. Settings
          apply instantly to all users.
        </p>
      </div>

      <GlassTabs
        items={tabs()}
        value={tab()}
        onChange={setTab}
        variant="pill"
        size="default"
        aria-label="Anime management sections"
      />

      <Show when={settingsError()}>
        <div role="alert" class="admin-anime-alert">
          {settingsError()}
        </div>
      </Show>

      <Show when={tab() === "settings"}>
        <SettingsTab
          settings={settings()}
          loading={loadingSettings()}
          savingKey={savingKey()}
          masterDisabled={!settings().enabled}
          onToggle={(k, v) => updateSetting(k, v)}
        />
      </Show>

      <Show when={tab() === "mappings"}>
        <MappingsTab showToast={showToast} autoMappingOn={() => settings().auto_mapping} />
      </Show>

      <Show when={tab() === "cache"}>
        <CacheTab
          settings={settings()}
          loading={loadingSettings()}
          savingKey={savingKey()}
          masterDisabled={!settings().enabled}
          onNumeric={(k, v) => updateSetting(k, v)}
        />
      </Show>

      <Show when={toast()}>
        <div
          class="admin-anime-toast"
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

// ─── Settings tab ──────────────────────────────────────────────────

function SettingsTab(props: {
  settings: AnimeSettings;
  loading: boolean;
  savingKey: string | null;
  masterDisabled: boolean;
  onToggle: <K extends keyof AnimeSettings>(k: K, v: AnimeSettings[K]) => void;
}) {
  return (
    <Show
      when={!props.loading}
      fallback={
        <div class="admin-anime-loading">Loading settings…</div>
      }
    >
      {/* Master Toggle */}
      <GlassCard padding="comfortable" class="admin-anime-section">
        <SectionHeader
          title="Master Toggle"
          icon="power_settings_new"
          subtitle="Disable to turn off ALL AniList features. The Discover anime carousels, anime detail sections, and anime recommendations will all be hidden. TMDB and MDBList continue to work."
        />
        <ToggleRow
          icon="animation"
          label="Enable Anime Integration"
          description="Master switch for all AniList features"
          userSide="useAnimeSettings.enabled → every anime consumer"
          on={props.settings.enabled}
          saving={props.savingKey === "enabled"}
          disabled={false}
          onToggle={() => props.onToggle("enabled", !props.settings.enabled)}
        />
      </GlassCard>

      {/* Carousels */}
      <GlassCard padding="comfortable" class="admin-anime-section">
        <SectionHeader
          title="Discover Carousels"
          icon="view_carousel"
          subtitle="Toggle individual anime rails on the Discover page. Each maps 1:1 to a hook accessor read by DiscoverPage."
        />
        <For each={CAROUSEL_TOGGLES}>
          {(meta) => (
            <ToggleRow
              icon={meta.icon}
              label={meta.label}
              description={meta.description}
              userSide={meta.userSide}
              on={props.settings[meta.key] as boolean}
              saving={props.savingKey === (meta.key as string)}
              disabled={!props.settings.enabled}
              onToggle={() =>
                props.onToggle(
                  meta.key,
                  !(props.settings[meta.key] as boolean)
                )
              }
            />
          )}
        </For>
      </GlassCard>

      {/* Detail sections */}
      <GlassCard padding="comfortable" class="admin-anime-section">
        <SectionHeader
          title="Details Modal Sections"
          icon="read_more"
          subtitle="Toggle individual sections of the anime Details modal. Each maps 1:1 to a hook accessor read by DetailsModal."
        />
        <For each={DETAIL_TOGGLES}>
          {(meta) => (
            <ToggleRow
              icon={meta.icon}
              label={meta.label}
              description={meta.description}
              userSide={meta.userSide}
              on={props.settings[meta.key] as boolean}
              saving={props.savingKey === (meta.key as string)}
              disabled={!props.settings.enabled}
              onToggle={() =>
                props.onToggle(
                  meta.key,
                  !(props.settings[meta.key] as boolean)
                )
              }
            />
          )}
        </For>
      </GlassCard>

      {/* Automation */}
      <GlassCard padding="comfortable" class="admin-anime-section">
        <SectionHeader
          title="Automation"
          icon="smart_toy"
          subtitle="Control how new anime titles get mapped to AniList IDs. Disable auto-mapping to require manual admin review of every new mapping."
        />
        <For each={AUTOMATION_TOGGLES}>
          {(meta) => (
            <ToggleRow
              icon={meta.icon}
              label={meta.label}
              description={meta.description}
              userSide={meta.userSide}
              on={props.settings[meta.key] as boolean}
              saving={props.savingKey === (meta.key as string)}
              disabled={!props.settings.enabled}
              onToggle={() =>
                props.onToggle(
                  meta.key,
                  !(props.settings[meta.key] as boolean)
                )
              }
            />
          )}
        </For>
      </GlassCard>

      <div class="admin-anime-footnote">
        AniList GraphQL endpoint: <code>https://graphql.anilist.co</code>
        <br />
        Anonymous rate limit: 90 req/min/IP. Set{" "}
        <code>ANILIST_ACCESS_TOKEN</code> in the server env to raise this
        to 120 req/min.
      </div>
    </Show>
  );
}

// ─── Mappings tab ──────────────────────────────────────────────────

function MappingsTab(props: {
  showToast: (msg: string, type: "success" | "error") => void;
  autoMappingOn: () => boolean;
}) {
  const [mappings, setMappings] = createSignal<AnimeMapping[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");
  const [confidenceFilter, setConfidenceFilter] = createSignal<Confidence | "all">("all");
  const [offset, setOffset] = createSignal(0);
  const [limit] = createSignal(50);
  const [editModal, setEditModal] = createSignal<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = createSignal(false);

  // Debounce search via setTimeout — we don't pull in a debounce lib
  // for a single text input.
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (v: string) => {
    setSearch(v);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setOffset(0);
      void fetchMappings();
    }, 300);
  };

  const fetchMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit()));
      params.set("offset", String(offset()));
      if (confidenceFilter() !== "all") {
        params.set("confidence", confidenceFilter());
      }
      const q = search().trim();
      if (q) params.set("q", q);

      const resp = await fetch(
        `/api/admin/anime-mappings?${params.toString()}`,
        { credentials: "include" }
      );
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as MappingsResponse;
      setMappings(data.mappings);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void fetchMappings());

  // Refetch when filter / offset changes.
  // (search has its own debounced refetch.)
  const refetchOnFilterChange = (next: Confidence | "all") => {
    setConfidenceFilter(next);
    setOffset(0);
    void fetchMappings();
  };

  const approve = async (m: AnimeMapping) => {
    try {
      const resp = await fetch("/api/admin/anime-mappings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: m.id,
          match_confidence: "manual" as Confidence
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        props.showToast(body.error || "Failed to approve", "error");
        return;
      }
      props.showToast("Mapping approved (confidence → manual)", "success");
      setMappings((prev) =>
        prev.map((x) => (x.id === m.id ? (body.mapping as AnimeMapping) : x))
      );
    } catch {
      props.showToast("Network error", "error");
    }
  };

  const reject = async (m: AnimeMapping) => {
    if (
      !confirm(
        `Delete mapping for TMDB #${m.tmdb_id} → AniList #${m.anilist_id}?`
      )
    )
      return;
    try {
      const resp = await fetch(`/api/admin/anime-mappings?id=${m.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        props.showToast(body.error || "Failed to delete", "error");
        return;
      }
      props.showToast("Mapping deleted", "success");
      setMappings((prev) => prev.filter((x) => x.id !== m.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      props.showToast("Network error", "error");
    }
  };

  const openEdit = (m: AnimeMapping) => {
    setEditModal({
      id: m.id,
      tmdb_id: String(m.tmdb_id),
      tmdb_type: m.tmdb_type,
      anilist_id: String(m.anilist_id),
      anilist_type: m.anilist_type,
      title: m.title ?? "",
      match_confidence: m.match_confidence
    });
  };

  const saveEdit = async () => {
    const form = editModal();
    if (!form) return;
    const tmdbId = parseInt(form.tmdb_id, 10);
    const anilistId = parseInt(form.anilist_id, 10);
    if (Number.isNaN(tmdbId) || tmdbId <= 0) {
      props.showToast("TMDB ID must be a positive integer", "error");
      return;
    }
    if (Number.isNaN(anilistId) || anilistId <= 0) {
      props.showToast("AniList ID must be a positive integer", "error");
      return;
    }
    setSavingEdit(true);
    try {
      const resp = await fetch("/api/admin/anime-mappings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          tmdb_id: tmdbId,
          tmdb_type: form.tmdb_type,
          anilist_id: anilistId,
          anilist_type: form.anilist_type,
          title: form.title || null,
          match_confidence: form.match_confidence
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        props.showToast(body.error || "Failed to save", "error");
        return;
      }
      props.showToast("Mapping updated", "success");
      setMappings((prev) =>
        prev.map((x) => (x.id === form.id ? (body.mapping as AnimeMapping) : x))
      );
      setEditModal(null);
    } catch {
      props.showToast("Network error", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const hasNext = createMemo(() => offset() + limit() < total());
  const hasPrev = createMemo(() => offset() > 0);

  const nextPage = () => {
    if (!hasNext()) return;
    setOffset(offset() + limit());
    void fetchMappings();
  };
  const prevPage = () => {
    if (!hasPrev()) return;
    setOffset(Math.max(0, offset() - limit()));
    void fetchMappings();
  };

  return (
    <div class="admin-anime-mappings">
      {/* Toolbar: search + filter chips */}
      <GlassCard padding="default" class="admin-anime-mappings-toolbar">
        <div class="admin-anime-search">
          <GlassInput
            icon="search"
            placeholder="Search by TMDB ID, AniList ID, or title…"
            value={search()}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
            aria-label="Search anime mappings"
          />
        </div>
        <div class="admin-anime-filter-chips" role="group" aria-label="Filter by confidence">
          <FilterChip
            label="All"
            active={confidenceFilter() === "all"}
            onClick={() => refetchOnFilterChange("all")}
          />
          <For each={Object.entries(CONFIDENCE_META)}>
            {([key, meta]) => (
              <FilterChip
                label={meta.label}
                intent={meta.intent}
                active={confidenceFilter() === (key as Confidence)}
                onClick={() => refetchOnFilterChange(key as Confidence)}
              />
            )}
          </For>
        </div>
      </GlassCard>

      <Show when={!props.autoMappingOn()}>
        <div class="admin-anime-notice">
          <span class="material-symbols-outlined" aria-hidden="true">
            info
          </span>
          Auto-mapping is disabled. New mappings will only appear here
          if an admin adds them manually. Re-enable in the Settings tab
          to allow auto-detection.
        </div>
      </Show>

      <Show when={error()}>
        <div role="alert" class="admin-anime-alert">
          Failed to load: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <For each={Array.from({ length: 4 })}>
          {() => <div class="admin-anime-skeleton" style={{ height: "60px" }} />}
        </For>
      </Show>

      <Show when={!loading() && mappings().length === 0}>
        <GlassEmptyState
          icon="fact_check"
          title="No mappings found"
          message={
            search() || confidenceFilter() !== "all"
              ? "No mappings match your filters. Try clearing the search or selecting 'All'."
              : "The mapping table is empty. Auto-detected mappings will appear here for review once users trigger anime enrichment."
          }
          variant="compact"
          surface
        />
      </Show>

      <Show when={!loading() && mappings().length > 0}>
        <div class="admin-anime-mappings-table" role="table" aria-label="Anime mappings">
          <div class="admin-anime-mappings-thead" role="row">
            <span class="admin-anime-col-tmdb">TMDB</span>
            <span class="admin-anime-col-anilist">AniList</span>
            <span class="admin-anime-col-title">Title</span>
            <span class="admin-anime-col-confidence">Confidence</span>
            <span class="admin-anime-col-actions">Actions</span>
          </div>
          <For each={mappings()}>
            {(m) => (
              <MappingRow
                mapping={m}
                onApprove={() => approve(m)}
                onReject={() => reject(m)}
                onEdit={() => openEdit(m)}
              />
            )}
          </For>
        </div>

        {/* Pagination */}
        <div class="admin-anime-pagination">
          <GlassButton
            variant="secondary"
            size="compact"
            icon="arrow_back"
            onClick={prevPage}
            disabled={!hasPrev()}
          >
            Prev
          </GlassButton>
          <span class="admin-anime-pagination-info">
            {offset() + 1}–{Math.min(offset() + limit(), total())} of{" "}
            {total()}
          </span>
          <GlassButton
            variant="secondary"
            size="compact"
            icon="arrow_forward"
            iconPosition="right"
            onClick={nextPage}
            disabled={!hasNext()}
          >
            Next
          </GlassButton>
        </div>
      </Show>

      {/* Edit modal */}
      <Show when={editModal()}>
        <EditMappingModal
          form={editModal()!}
          saving={savingEdit()}
          onClose={() => !savingEdit() && setEditModal(null)}
          onUpdate={(patch) =>
            setEditModal({ ...editModal()!, ...patch })
          }
          onSave={saveEdit}
        />
      </Show>
    </div>
  );
}

function MappingRow(props: {
  mapping: AnimeMapping;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const conf = () => CONFIDENCE_META[props.mapping.match_confidence];
  return (
    <div class="admin-anime-mapping-row" role="row">
      <div class="admin-anime-cell admin-anime-cell-tmdb" data-label="TMDB">
        <GlassBadge intent="default" size="compact" label={props.mapping.tmdb_type} />
        <span class="admin-anime-id">#{props.mapping.tmdb_id}</span>
      </div>
      <div class="admin-anime-cell admin-anime-cell-anilist" data-label="AniList">
        <GlassBadge intent="info" size="compact" label={props.mapping.anilist_type} />
        <span class="admin-anime-id">#{props.mapping.anilist_id}</span>
      </div>
      <div class="admin-anime-cell admin-anime-cell-title" data-label="Title">
        <Show when={props.mapping.title} fallback={<span class="admin-anime-no-title">—</span>}>
          <span class="admin-anime-title-text">{props.mapping.title}</span>
        </Show>
      </div>
      <div class="admin-anime-cell admin-anime-cell-confidence" data-label="Confidence">
        <GlassBadge
          intent={conf().intent}
          size="compact"
          label={conf().label}
        />
        <span class="admin-anime-confidence-desc">{conf().description}</span>
      </div>
      <div class="admin-anime-cell admin-anime-cell-actions" data-label="Actions">
        <Show when={props.mapping.match_confidence !== "manual"}>
          <button
            type="button"
            class="admin-anime-icon-btn admin-anime-icon-btn-approve focus-ring"
            onClick={props.onApprove}
            aria-label="Approve mapping (set confidence to manual)"
            title="Approve (→ manual)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              check
            </span>
          </button>
        </Show>
        <button
          type="button"
          class="admin-anime-icon-btn focus-ring"
          onClick={props.onEdit}
          aria-label="Edit mapping"
          title="Edit"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            edit
          </span>
        </button>
        <button
          type="button"
          class="admin-anime-icon-btn admin-anime-icon-btn-danger focus-ring"
          onClick={props.onReject}
          aria-label="Delete mapping"
          title="Delete"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            delete
          </span>
        </button>
      </div>
    </div>
  );
}

function EditMappingModal(props: {
  form: EditForm;
  saving: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<EditForm>) => void;
  onSave: () => void;
}) {
  return (
    <div
      class="admin-anime-modal-overlay"
      onClick={() => props.onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit anime mapping"
    >
      <div
        class="admin-anime-modal-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="admin-anime-modal-header">
          <h3 class="admin-anime-modal-title">Edit Mapping</h3>
          <button
            type="button"
            class="admin-anime-icon-btn focus-ring"
            onClick={() => props.onClose()}
            aria-label="Close"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div class="admin-anime-modal-body">
          <div class="admin-anime-form-grid">
            <Field label="TMDB ID *">
              <input
                type="number"
                class="admin-anime-input"
                value={props.form.tmdb_id}
                onInput={(e) =>
                  props.onUpdate({ tmdb_id: e.currentTarget.value })
                }
                required
              />
            </Field>
            <Field label="TMDB Type">
              <select
                class="admin-anime-input"
                value={props.form.tmdb_type}
                onChange={(e) =>
                  props.onUpdate({
                    tmdb_type: e.currentTarget.value as "movie" | "tv"
                  })
                }
              >
                <option value="tv">TV</option>
                <option value="movie">Movie</option>
              </select>
            </Field>
            <Field label="AniList ID *">
              <input
                type="number"
                class="admin-anime-input"
                value={props.form.anilist_id}
                onInput={(e) =>
                  props.onUpdate({ anilist_id: e.currentTarget.value })
                }
                required
              />
            </Field>
            <Field label="AniList Type">
              <select
                class="admin-anime-input"
                value={props.form.anilist_type}
                onChange={(e) =>
                  props.onUpdate({
                    anilist_type: e.currentTarget.value as "ANIME" | "MANGA"
                  })
                }
              >
                <option value="ANIME">ANIME</option>
                <option value="MANGA">MANGA</option>
              </select>
            </Field>
          </div>

          <Field label="Title (optional)">
            <input
              type="text"
              class="admin-anime-input"
              value={props.form.title}
              onInput={(e) =>
                props.onUpdate({ title: e.currentTarget.value })
              }
              placeholder="AniList title for display"
            />
          </Field>

          <Field label="Confidence">
            <select
              class="admin-anime-input"
              value={props.form.match_confidence}
              onChange={(e) =>
                props.onUpdate({
                  match_confidence: e.currentTarget.value as Confidence
                })
              }
            >
              <For each={Object.entries(CONFIDENCE_META)}>
                {([key, meta]) => (
                  <option value={key}>
                    {meta.label} — {meta.description}
                  </option>
                )}
              </For>
            </select>
          </Field>
        </div>

        <div class="admin-anime-modal-footer">
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
            Save
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ─── Cache tab ─────────────────────────────────────────────────────

function CacheTab(props: {
  settings: AnimeSettings;
  loading: boolean;
  savingKey: string | null;
  masterDisabled: boolean;
  onNumeric: <K extends keyof AnimeSettings>(k: K, v: AnimeSettings[K]) => void;
}) {
  // Stat tiles derived from settings — read-only summary.
  const statTiles = createMemo(() => [
    {
      label: "Details Cache TTL",
      value: `${props.settings.cache_ttl_details_hours}h`,
      icon: "database",
      hint: "AniList detail responses"
    },
    {
      label: "Trending Cache TTL",
      value: `${props.settings.cache_ttl_trending_hours}h`,
      icon: "whatshot",
      hint: "Trending carousel"
    },
    {
      label: "Seasonal Cache TTL",
      value: `${props.settings.cache_ttl_seasonal_hours}h`,
      icon: "event",
      hint: "This Season carousel"
    },
    {
      label: "Upcoming Cache TTL",
      value: `${props.settings.cache_ttl_upcoming_hours}h`,
      icon: "upcoming",
      hint: "Upcoming carousel"
    }
  ]);

  return (
    <Show
      when={!props.loading}
      fallback={<div class="admin-anime-loading">Loading cache config…</div>}
    >
      {/* Stat tiles (read-only summary) */}
      <div class="admin-anime-cache-tiles">
        <For each={statTiles()}>
          {(tile) => (
            <GlassCard padding="default" class="admin-anime-cache-tile">
              <span class="material-symbols-outlined admin-anime-cache-tile-icon">
                {tile.icon}
              </span>
              <div class="admin-anime-cache-tile-value">{tile.value}</div>
              <div class="admin-anime-cache-tile-label">{tile.label}</div>
              <div class="admin-anime-cache-tile-hint">{tile.hint}</div>
            </GlassCard>
          )}
        </For>
      </div>

      {/* Editable numeric config (same fields, in-place edit) */}
      <GlassCard padding="comfortable" class="admin-anime-section">
        <SectionHeader
          title="Performance & Caching"
          icon="speed"
          subtitle="Tune AniList request timeouts and cache TTLs. Higher TTLs reduce AniList API load but mean slower updates when AniList data changes. Edits here update the same JSONB the Settings tab edits."
        />
        <For each={NUMERIC_META}>
          {(meta) => (
            <NumericRow
              label={meta.label}
              description={meta.description}
              unit={meta.unit}
              min={meta.min}
              max={meta.max}
              value={props.settings[meta.key] as number}
              saving={props.savingKey === (meta.key as string)}
              disabled={props.masterDisabled}
              onChange={(v) =>
                props.onNumeric(meta.key, v as unknown as never)
              }
            />
          )}
        </For>
      </GlassCard>

      <div class="admin-anime-footnote">
        AniList GraphQL endpoint:{" "}
        <code>https://graphql.anilist.co</code>
        <br />
        Anonymous rate limit: 90 req/min/IP. Set{" "}
        <code>ANILIST_ACCESS_TOKEN</code> in the server env to raise this
        to 120 req/min.
        <br />
        In-memory client cache TTL: 5 minutes (not configurable —
        built into the AniList client).
      </div>
    </Show>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function SectionHeader(props: {
  title: string;
  icon: string;
  subtitle: string;
}) {
  return (
    <div class="admin-anime-section-header">
      <span class="material-symbols-outlined admin-anime-section-icon">
        {props.icon}
      </span>
      <div>
        <h3 class="admin-anime-section-title">{props.title}</h3>
        <p class="admin-anime-section-subtitle">{props.subtitle}</p>
      </div>
    </div>
  );
}

function ToggleRow(props: {
  icon: string;
  label: string;
  description: string;
  userSide: string;
  on: boolean;
  saving: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      class="admin-anime-toggle-row"
      classList={{ "is-disabled": props.disabled }}
    >
      <div class="admin-anime-toggle-info">
        <span class="material-symbols-outlined admin-anime-toggle-icon">
          {props.icon}
        </span>
        <div class="admin-anime-toggle-text">
          <div class="admin-anime-toggle-label">{props.label}</div>
          <div class="admin-anime-toggle-desc">{props.description}</div>
          <div class="admin-anime-toggle-userside">
            <span class="material-symbols-outlined" aria-hidden="true">
              link
            </span>
            {props.userSide}
          </div>
        </div>
      </div>
      <div class="admin-anime-toggle-control">
        <Show when={props.saving}>
          <span class="admin-anime-saving-indicator">Saving…</span>
        </Show>
        <ToggleSwitch
          on={props.on}
          disabled={props.disabled}
          onClick={props.onToggle}
          ariaLabel={`Toggle ${props.label}`}
        />
      </div>
    </div>
  );
}

function ToggleSwitch(props: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      class="admin-anime-toggle-switch"
      classList={{ "is-on": props.on, "is-disabled": props.disabled }}
      onClick={() => !props.disabled && props.onClick()}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      aria-pressed={props.on}
    >
      <span class="admin-anime-toggle-knob" />
    </button>
  );
}

function NumericRow(props: {
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  saving: boolean;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div class="admin-anime-numeric-row">
      <div class="admin-anime-numeric-info">
        <div class="admin-anime-numeric-label">{props.label}</div>
        <div class="admin-anime-numeric-desc">{props.description}</div>
      </div>
      <div class="admin-anime-numeric-control">
        <Show when={props.saving}>
          <span class="admin-anime-saving-indicator">Saving…</span>
        </Show>
        <input
          type="number"
          class="admin-anime-input admin-anime-input-numeric"
          value={String(props.value)}
          min={props.min}
          max={props.max}
          disabled={props.disabled}
          onChange={(e) => {
            const v = parseInt(e.currentTarget.value, 10);
            if (!Number.isNaN(v)) {
              props.onChange(v);
            }
          }}
        />
        <span class="admin-anime-numeric-unit">{props.unit}</span>
      </div>
    </div>
  );
}

function FilterChip(props: {
  label: string;
  intent?: "success" | "warning" | "danger" | "primary" | "default";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="admin-anime-filter-chip"
      classList={{
        "is-active": props.active,
        [`is-${props.intent ?? "default"}`]: !!props.intent
      }}
      onClick={props.onClick}
      aria-pressed={props.active}
    >
      {props.label}
    </button>
  );
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <div class="admin-anime-field">
      <label class="admin-anime-field-label">{props.label}</label>
      {props.children}
    </div>
  );
}

export default AdminAnimePage;
