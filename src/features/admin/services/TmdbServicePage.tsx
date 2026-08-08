// src/features/admin/services/TmdbServicePage.tsx
//
// CineLog V2 — TMDB Services Hub Page (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Single source of truth for all TMDB-related operational controls:
//   • Status (live probe from /api/admin/services/status)
//   • API key status (TMDB_API_KEY env var — present / missing)
//   • Cache metrics (entries, expired, size, by media type)
//   • Config (cache_ttl_days, fallback_language, include_adult)
//     ← MOVED here from AdminSettingsPage to enforce zero-duplication.
//        Same backing key (tmdb_settings) on /api/admin/settings.
//   • Cache management — link to the existing /admin/tmdb-cache page
//     where the operator can browse / invalidate individual entries.
//
// WHAT THIS PAGE IS NOT:
//   • It does NOT duplicate the per-row cache browser at /admin/tmdb-cache.
//     The operator clicks "Manage cache entries →" to go there.
//   • It does NOT expose the TMDB API key value. The key is shown only
//     as "Set" / "Missing". Rotating the key is a Vercel env var change.
//
// RESPONSIVE:
//   • Mobile  — all sections stack to 1 column. Save / Revert buttons
//               span full width.
//   • Desktop — config grid is 3-up; stat cards are 4-up.
//
// DATA SOURCES:
//   • /api/admin/services/status        — for the header status pill
//   • /api/admin/tmdb-cache/stats       — cache metrics (entries, size)
//   • /api/admin/settings (GET, PUT)    — tmdb_settings config object

import {
  createSignal,
  Show,
  onMount,
  For,
  type Component
} from "solid-js";
import { A } from "@solidjs/router";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassStatCard } from "~/shared/ui/glass/GlassStatCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import ServicePageHeader from "./ServicePageHeader";
import ServiceKeyStatus from "./ServiceKeyStatus";

// ─── Types ───────────────────────────────────────────────────────

interface TmdbSettings {
  cache_ttl_days: number;
  fallback_language: string;
  include_adult: boolean;
}

interface TmdbSettingsResponse {
  settings: {
    tmdb_settings: { value: TmdbSettings; updated_at: string | null };
  };
}

interface TmdbCacheStats {
  total: number;
  expired: number;
  by_media_type: { movie: number; tv: number };
  oldest_fetched_at: string | null;
  newest_fetched_at: string | null;
  size_bytes: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ─── Component ───────────────────────────────────────────────────

const TmdbServicePage: Component = () => {
  // Config (formerly on AdminSettingsPage)
  const [settings, setSettings] = createSignal<TmdbSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  // Cache stats
  const [cacheStats, setCacheStats] = createSignal<TmdbCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = createSignal(true);

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const resp = await fetch("/api/admin/settings", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as TmdbSettingsResponse;
      setSettings(data.settings.tmdb_settings.value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchCacheStats = async () => {
    setCacheLoading(true);
    try {
      const resp = await fetch("/api/admin/tmdb-cache/stats", {
        credentials: "include"
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as TmdbCacheStats;
      setCacheStats(data);
    } catch {
      // Stats are best-effort — leave the previous value in place
    } finally {
      setCacheLoading(false);
    }
  };

  onMount(() => {
    void fetchSettings();
    void fetchCacheStats();
  });

  const updateSettings = (patch: Partial<TmdbSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
  };

  const save = async () => {
    const s = settings();
    if (!s) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { tmdb_settings: s }
        })
      });
      const json = (await resp.json()) as {
        ok: boolean;
        error?: string;
        updated?: string[];
      };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${resp.status}`);
      }
      setSuccess("Saved TMDB settings.");
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <ServicePageHeader
        icon="movie"
        name="TMDB"
        description="TMDB provides movie & TV metadata, posters, and search. Cache hits reduce external API calls."
      />

      <Show when={error()}>
        <div
          role="alert"
          class="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          <span class="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          {error()}
        </div>
      </Show>

      <Show when={success()}>
        <div
          role="status"
          class="flex items-center gap-2 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
        >
          <span class="material-symbols-outlined text-base" aria-hidden="true">
            check_circle
          </span>
          {success()}
        </div>
      </Show>

      {/* ─── Cache metrics ──────────────────────────────────────── */}
      <section class="flex flex-col gap-3">
        <h2 class="m-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          Cache metrics
        </h2>
        <Show when={cacheLoading() && !cacheStats()}>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={Array.from({ length: 4 })}>
              {() => <GlassStatCard value="" label="Loading" loading />}
            </For>
          </div>
        </Show>
        <Show when={cacheStats()}>
          {(s) => (
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <GlassStatCard
                value={(s().total ?? 0).toLocaleString()}
                label="Total Entries"
                icon="database"
                variant="glass"
              />
              <GlassStatCard
                value={(s().expired ?? 0).toLocaleString()}
                label="Expired"
                icon="schedule"
                variant="glass"
                trend={s().expired > 0 ? "down" : "neutral"}
                trendValue={s().expired > 0 ? "needs cleanup" : "clean"}
              />
              <GlassStatCard
                value={(s().by_media_type?.movie ?? 0).toLocaleString()}
                label="Movies Cached"
                icon="film"
                variant="glass"
              />
              <GlassStatCard
                value={formatBytes(s().size_bytes ?? 0)}
                label="Cache Size"
                icon="storage"
                variant="glass"
              />
            </div>
          )}
        </Show>
        <div class="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>
            Oldest fetch:{" "}
            <span class="font-mono text-text-secondary">
              {formatDate(cacheStats()?.oldest_fetched_at ?? null)}
            </span>
          </span>
          <span>
            Newest fetch:{" "}
            <span class="font-mono text-text-secondary">
              {formatDate(cacheStats()?.newest_fetched_at ?? null)}
            </span>
          </span>
        </div>
      </section>

      {/* ─── Cache hit rate (note: not tracked, transparent messaging) ──
          We do not currently track cache hits vs misses at the request
          level — the TMDB proxy at /api/media/[...path] serves from
          cache when present and falls through to TMDB on miss, but does
          not write a row to activity_log. Rather than show a fake
          percentage, we explain why the metric is empty and link to
          the cache browser where the operator can see the entries
          themselves. This respects the Phase 9 rule: "All data
          fetching must be real — no hardcoded dummy numbers." */}
      <GlassCard padding="default">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <span
              class="material-symbols-outlined text-lg text-text-soft"
              aria-hidden="true"
            >
              info
            </span>
            <div class="flex flex-col gap-1">
              <h3 class="m-0 text-sm font-semibold text-text-strong">
                Cache hit rate
              </h3>
              <p class="m-0 text-xs text-text-muted">
                Not tracked — the TMDB proxy serves cached responses
                silently without logging hit/miss. Use the cache browser
                below to inspect individual entries.
              </p>
            </div>
          </div>
          <A
            href="/admin/tmdb-cache"
            class="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-glass-border bg-glass px-3 py-2 text-xs font-semibold text-primary no-underline backdrop-blur-xl transition-[background-color] hover:bg-glass-strong"
          >
            <span class="material-symbols-outlined text-sm" aria-hidden="true">
              storage
            </span>
            Manage cache entries →
          </A>
        </div>
      </GlassCard>

      {/* ─── API key status ───────────────────────────────────────
          The key is read at build time (VITE_TMDB_API_KEY) for the
          About page diagnostic, but the actual key the server uses
          is the server-only TMDB_API_KEY env var. We can't read it
          from the client, so we rely on the live probe in the header
          to show "Operational" when the key works. The block below
          just explains where the key lives. */}
      <GlassCard padding="default">
        <h3 class="mb-3 mt-0 text-xs font-bold uppercase tracking-widest text-text-muted">
          API key
        </h3>
        <ServiceKeyStatus
          present={!!import.meta.env.VITE_TMDB_API_KEY}
          label="VITE_TMDB_API_KEY"
          hint="Server also reads TMDB_API_KEY (server-only). Rotate via Vercel dashboard."
        />
      </GlassCard>

      {/* ─── Config (moved from AdminSettingsPage) ──────────────── */}
      <GlassCard padding="comfortable">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h3 class="m-0 text-sm font-semibold text-text-strong">
              TMDB configuration
            </h3>
            <p class="mt-0.5 text-xs text-text-muted">
              Site-wide settings. Saved to app_config.tmdb_settings.
            </p>
          </div>
        </div>

        <Show when={settingsLoading() && !settings()}>
          <GlassLoadingState size="small" message="Loading TMDB settings…" class="!py-6" />
        </Show>

        <Show when={settings()}>
          {(s) => (
            <div class="flex flex-col gap-4">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-medium text-text-secondary">
                    Cache TTL (days)
                  </label>
                  <GlassInput
                    type="number"
                    min={1}
                    max={365}
                    value={String(s().cache_ttl_days)}
                    onInput={(e) =>
                      updateSettings({
                        cache_ttl_days: Number(e.currentTarget.value)
                      })
                    }
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-medium text-text-secondary">
                    Fallback language
                  </label>
                  <GlassInput
                    type="text"
                    maxlength={10}
                    placeholder="en"
                    value={s().fallback_language}
                    onInput={(e) =>
                      updateSettings({
                        fallback_language: e.currentTarget.value
                      })
                    }
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-medium text-text-secondary">
                    Adult content
                  </label>
                  <label class="flex h-[42px] cursor-pointer items-center gap-2 rounded-md border border-glass-border bg-glass px-3 text-sm text-text">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      checked={s().include_adult}
                      onChange={(e) =>
                        updateSettings({
                          include_adult: e.currentTarget.checked
                        })
                      }
                    />
                    Allow adult titles
                  </label>
                </div>
              </div>

              <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <GlassButton
                  variant="glass"
                  size="compact"
                  onClick={fetchSettings}
                  disabled={saving()}
                >
                  Revert
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="compact"
                  icon="save"
                  onClick={save}
                  loading={saving()}
                  disabled={saving()}
                >
                  Save TMDB settings
                </GlassButton>
              </div>
            </div>
          )}
        </Show>
      </GlassCard>
    </div>
  );
};

export default TmdbServicePage;
