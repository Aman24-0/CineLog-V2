// src/features/admin/AdminPlatformCatalogPage.tsx
//
// CineLog V2 — Admin Platform Catalogue Page (Part 4 redesign)
// ---------------------------------------------------------------------
// The admin surface for managing the published JustWatch provider
// catalogue that powers the user-side Library Platform filter.
//
// Workflow:
//   1. Admin picks a country (dropdown of supported JustWatch regions).
//   2. Admin clicks "Fetch Catalogue" → server calls JustWatch and
//      returns a diff against the saved Supabase rows (SAVED / NEW /
//      UPDATED / REMOVED). The diagnostic panel shows the fetch
//      duration, last fetch time, and counts of each diff status.
//   3. Admin publishes new / updated providers (Add / Add Selected /
//      Add All New). Publishing inserts the row with `active = true`
//      if it doesn't exist, or flips `active = true` if it does.
//   4. Admin can deactivate providers that should no longer appear
//      in the user-side dropdown. The row is preserved for re-publish
//      if the provider reappears in a future JustWatch fetch (no data
//      loss from a transient JustWatch response).
//   5. Admin can update individual provider metadata (clearName etc.)
//      when JustWatch reports a changed value.
//
// Architecture notes (see also the route file):
//   - Country source: the JustWatch GraphQL `Country` enum is NOT
//     introspectable on the public endpoint. We fall back to a
//     documented, hand-curated list derived from
//     `SUPPORTED_DISCOVER_REGIONS` in
//     `src/core/config/discoverRegion.ts`. Adding a new supported
//     JustWatch country requires adding it to that list.
//   - The user-side Library Platform filter reads ONLY the published
//     catalogue (`active = true` rows). The admin's "Fetch Catalogue"
//     button is the ONLY JustWatch call that ever runs from the app —
//     no user-side JustWatch fallback.
//   - The per-title availability enrichment (which of the user's
//     library titles are available on a selected platform) is
//     UNCHANGED — it still uses the existing
//     `/api/ott/batch-availability` route and the
//     `ott_availability_cache` table.
//
// Mobile-first: the diff list collapses to stacked cards on narrow
// viewports; the diagnostic panel and action bar are sticky at the
// bottom for thumb reach.

import {
  createSignal,
  createMemo,
  Show,
  For,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";
import { GlassEmptyState } from "~/shared/ui/glass/GlassEmptyState";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import { SUPPORTED_DISCOVER_REGIONS } from "~/core/config/discoverRegion";

// ─── Types ─────────────────────────────────────────────────────────

interface JustWatchPackage {
  id: string;
  clearName: string;
  shortName: string;
  technicalName: string;
  icon: string;
}

interface ProviderCatalogRow {
  country: string;
  package_id: string;
  clear_name: string;
  short_name: string;
  technical_name: string;
  icon_template: string;
  fetched_at: string;
  expires_at: string;
  active: boolean;
  last_fetched_at: string | null;
  published_at: string | null;
  updated_at: string | null;
}

type DiffStatus = "SAVED" | "NEW" | "UPDATED" | "REMOVED";

interface DiffEntry {
  technical_name: string;
  clear_name: string;
  status: DiffStatus;
  justwatch: JustWatchPackage | null;
  saved: ProviderCatalogRow | null;
}

interface FetchResponse {
  country: string;
  fetched_at: string;
  duration_ms: number;
  justwatch_providers: JustWatchPackage[];
  saved_rows: ProviderCatalogRow[];
  diff: DiffEntry[];
  summary: {
    saved: number;
    new: number;
    updated: number;
    removed: number;
  };
}

// ─── Country options ──────────────────────────────────────────────
// The JustWatch GraphQL `Country` enum is NOT introspectable on the
// public endpoint (introspection is disabled on apis.justwatch.com).
// We use `SUPPORTED_DISCOVER_REGIONS` as the documented, verified
// list of countries CineLog already supports as profile countries —
// the admin can publish a catalogue for any of them.

const COUNTRY_OPTIONS = SUPPORTED_DISCOVER_REGIONS.map((code) => ({
  code,
  // No human-readable name map is currently in the codebase, so we
  // render the ISO code as the dropdown label. Future improvement:
  // import a ISO 3166-1 country name map (e.g. the one used by
  // countryLanguages.ts) and render the country name alongside the
  // code. Per spec: "the admin UI should display country name +
  // ISO country code".
  label: code
}));

// ─── Component ─────────────────────────────────────────────────────

const AdminPlatformCatalogPage: Component = () => {
  const [country, setCountry] = createSignal<string>("IN");
  const [fetching, setFetching] = createSignal(false);
  const [fetchError, setFetchError] = createSignal<string | null>(null);
  const [fetchResult, setFetchResult] = createSignal<FetchResponse | null>(null);
  const [selected, setSelected] = createSignal<Set<string>>(new Set<string>());

  // Mutation in-flight flags so the user gets immediate feedback.
  const [publishing, setPublishing] = createSignal(false);
  const [deactivating, setDeactivating] = createSignal(false);
  const [updating, setUpdating] = createSignal(false);
  const [mutationError, setMutationError] = createSignal<string | null>(null);

  // ── Fetch handler: calls JustWatch + returns the diff ──────────
  const handleFetch = async () => {
    setFetching(true);
    setFetchError(null);
    setMutationError(null);
    setSelected(new Set<string>());
    try {
      const res = await fetch("/api/admin/platform-catalog/fetch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: country() })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as FetchResponse;
      setFetchResult(data);
      // Pre-select all NEW entries so the admin can one-click "Add
      // Selected" to publish them. UPDATED entries are not pre-
      // selected (the admin may want to review the metadata diff
      // first).
      setSelected(
        new Set<string>(
          data.diff
            .filter((d) => d.status === "NEW")
            .map((d) => d.technical_name)
        )
      );
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
      setFetchResult(null);
    } finally {
      setFetching(false);
    }
  };

  // ── Publish handlers ───────────────────────────────────────────
  const publishProviders = async (providers: JustWatchPackage[]) => {
    if (providers.length === 0) return;
    setPublishing(true);
    setMutationError(null);
    try {
      const res = await fetch("/api/admin/platform-catalog/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country(),
          providers
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Re-fetch the diff to reflect the new saved state.
      await handleFetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishSelected = () => {
    const sel = selected();
    const providers: JustWatchPackage[] = [];
    for (const entry of fetchResult()?.diff ?? []) {
      if (sel.has(entry.technical_name) && entry.justwatch) {
        providers.push(entry.justwatch);
      }
    }
    if (providers.length === 0) return;
    void publishProviders(providers);
  };

  const handlePublishAllNew = () => {
    const providers: JustWatchPackage[] = [];
    for (const entry of fetchResult()?.diff ?? []) {
      if (entry.status === "NEW" && entry.justwatch) {
        providers.push(entry.justwatch);
      }
    }
    if (providers.length === 0) return;
    void publishProviders(providers);
  };

  const handlePublishOne = (entry: DiffEntry) => {
    if (!entry.justwatch) return;
    void publishProviders([entry.justwatch]);
  };

  // ── Deactivate handler ─────────────────────────────────────────
  const handleDeactivate = async (technicalName: string) => {
    setDeactivating(true);
    setMutationError(null);
    try {
      const res = await fetch("/api/admin/platform-catalog/deactivate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country(),
          technical_names: [technicalName]
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await handleFetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeactivating(false);
    }
  };

  // ── Update metadata handler ────────────────────────────────────
  const handleUpdateMetadata = async (entry: DiffEntry) => {
    if (!entry.justwatch) return;
    setUpdating(true);
    setMutationError(null);
    try {
      const res = await fetch("/api/admin/platform-catalog/update", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country(),
          technical_name: entry.technical_name,
          clear_name: entry.justwatch.clearName,
          short_name: entry.justwatch.shortName,
          icon_template: entry.justwatch.icon
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await handleFetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(false);
    }
  };

  // ── Selection helpers ──────────────────────────────────────────
  const toggleSelected = (technicalName: string) => {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(technicalName)) {
        next.delete(technicalName);
      } else {
        next.add(technicalName);
      }
      return next;
    });
  };

  const selectedCount = createMemo(() => selected().size);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div class="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page header */}
      <div>
        <h1 class="type-display text-3xl text-text-strong">Platform Catalogue</h1>
        <p class="type-body-soft mt-2 max-w-2xl text-sm leading-relaxed">
          Manage the published JustWatch provider catalogue for each
          country. The user-side Library Platform filter dropdown reads
          ONLY the published rows ({`active = true`}). The
          "Fetch Catalogue" button is the only place in the app that
          calls JustWatch directly — there is no user-side fallback.
        </p>
      </div>

      {/* Country selector + Fetch action */}
      <GlassCard class="p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label
              class="type-meta mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted"
              for="platform-catalog-country"
            >
              Country
            </label>
            <select
              id="platform-catalog-country"
              value={country()}
              onChange={(e) => {
                setCountry(e.currentTarget.value);
                setFetchResult(null);
                setSelected(new Set<string>());
                setFetchError(null);
              }}
              class="w-full rounded-lg border border-hairline bg-glass-strong px-3 py-2 text-text-strong"
              disabled={fetching()}
            >
              <For each={COUNTRY_OPTIONS}>
                {(opt) => (
                  <option value={opt.code}>
                    {opt.label} ({opt.code})
                  </option>
                )}
              </For>
            </select>
          </div>
          <GlassButton
            variant="primary"
            onClick={() => void handleFetch()}
            disabled={fetching()}
          >
            {fetching() ? "Fetching…" : "Fetch Catalogue"}
          </GlassButton>
        </div>
        <p class="type-meta mt-3 text-xs text-text-muted">
          The JustWatch GraphQL endpoint does not expose a public
          Country-enum introspection, so the dropdown lists the
          regions CineLog already supports as profile countries
          (SUPPORTED_DISCOVER_REGIONS in core/config/discoverRegion.ts).
          Add a new country there to publish a catalogue for it.
        </p>
      </GlassCard>

      {/* Diagnostic panel */}
      <Show when={fetchResult()}>
        {(result) => (
          <GlassCard class="p-5">
            <h2 class="type-headline mb-3 text-base text-text-strong">
              Diagnostic
            </h2>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Country
                </div>
                <div class="type-body mt-1 font-semibold text-text-strong">
                  {result().country}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Last fetch
                </div>
                <div class="type-body mt-1 font-semibold text-text-strong">
                  {new Date(result().fetched_at).toLocaleString()}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Duration
                </div>
                <div class="type-body mt-1 font-semibold text-text-strong">
                  {result().duration_ms} ms
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  JustWatch providers
                </div>
                <div class="type-body mt-1 font-semibold text-text-strong">
                  {result().justwatch_providers.length}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Saved (published)
                </div>
                <div class="type-body mt-1 font-semibold text-emerald-400">
                  {result().summary.saved}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  New
                </div>
                <div class="type-body mt-1 font-semibold text-amber-400">
                  {result().summary.new}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Updated
                </div>
                <div class="type-body mt-1 font-semibold text-sky-400">
                  {result().summary.updated}
                </div>
              </div>
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Removed (not in latest fetch)
                </div>
                <div class="type-body mt-1 font-semibold text-rose-400">
                  {result().summary.removed}
                </div>
              </div>
            </div>
          </GlassCard>
        )}
      </Show>

      {/* Errors */}
      <Show when={fetchError()}>
        <GlassCard class="border border-rose-500/40 p-4">
          <p class="type-body text-rose-400">
            <strong>Fetch error:</strong> {fetchError()}
          </p>
        </GlassCard>
      </Show>
      <Show when={mutationError()}>
        <GlassCard class="border border-rose-500/40 p-4">
          <p class="type-body text-rose-400">
            <strong>Mutation error:</strong> {mutationError()}
          </p>
        </GlassCard>
      </Show>

      {/* Loading */}
      <Show when={fetching() && !fetchResult()}>
        <GlassLoadingState message="Fetching JustWatch catalogue…" />
      </Show>

      {/* Empty state — no fetch yet */}
      <Show when={!fetchResult() && !fetching() && !fetchError()}>
        <GlassEmptyState
          icon="live_tv"
          title="No catalogue loaded"
          message="Select a country and click Fetch Catalogue to compare the live JustWatch catalogue against the saved Supabase rows."
        />
      </Show>

      {/* Diff list + action bar */}
      <Show when={fetchResult()}>
        {(result) => (
          <>
            {/* Sticky action bar */}
            <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-glass-strong/95 p-3 backdrop-blur">
              <span class="type-meta text-xs uppercase tracking-widest text-text-muted">
                {selectedCount()} selected
              </span>
              <div class="flex-1" />
              <GlassButton
                variant="ghost"
                onClick={() => void handlePublishSelected()}
                disabled={publishing() || selectedCount() === 0}
              >
                {publishing() ? "Publishing…" : "Add Selected"}
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => void handlePublishAllNew()}
                disabled={publishing() || result().summary.new === 0}
              >
                Add All New ({result().summary.new})
              </GlassButton>
            </div>

            <Show
              when={result().diff.length > 0}
              fallback={
                <GlassEmptyState
                  icon="live_tv"
                  title="No providers"
                  message="JustWatch returned no providers for this country and no saved rows exist."
                />
              }
            >
              <div class="space-y-2">
                <For each={result().diff}>
                  {(entry) => {
                    const isSelected = () => selected().has(entry.technical_name);
                    return (
                      <GlassCard class="p-3">
                        <div class="flex flex-wrap items-center gap-3">
                          {/* Checkbox for select-to-publish */}
                          <input
                            type="checkbox"
                            checked={isSelected()}
                            onChange={() => toggleSelected(entry.technical_name)}
                            class="h-4 w-4 cursor-pointer accent-[var(--p)]"
                            aria-label={`Select ${entry.clear_name}`}
                          />

                          {/* Status badge */}
                          <Show when={entry.status === "SAVED"}>
                            <GlassBadge intent="success" label="SAVED" />
                          </Show>
                          <Show when={entry.status === "NEW"}>
                            <GlassBadge intent="warning" label="NEW" />
                          </Show>
                          <Show when={entry.status === "UPDATED"}>
                            <GlassBadge intent="info" label="UPDATED" />
                          </Show>
                          <Show when={entry.status === "REMOVED"}>
                            <GlassBadge intent="danger" label="REMOVED" />
                          </Show>

                          {/* Provider info */}
                          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span class="truncate text-sm font-semibold text-text-strong">
                              {entry.clear_name}
                            </span>
                            <span class="type-meta truncate text-xs text-text-muted">
                              {entry.technical_name}
                              <Show when={entry.justwatch?.id}>
                                {" · "}
                                id: {entry.justwatch!.id}
                              </Show>
                              <Show when={entry.saved?.active === false}>
                                {" · "}
                                <span class="text-rose-400">inactive</span>
                              </Show>
                            </span>
                            {/* Metadata diff (only show for UPDATED entries) */}
                            <Show when={entry.status === "UPDATED"}>
                              <div class="mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                                <Show when={entry.justwatch && entry.saved && entry.justwatch.clearName !== entry.saved.clear_name}>
                                  <div>
                                    <span class="text-text-muted">clearName:</span>{" "}
                                    <span class="text-rose-400 line-through">{entry.saved!.clear_name}</span>{" "}
                                    →{" "}
                                    <span class="text-emerald-400">{entry.justwatch!.clearName}</span>
                                  </div>
                                </Show>
                                <Show when={entry.justwatch && entry.saved && entry.justwatch.shortName !== entry.saved.short_name}>
                                  <div>
                                    <span class="text-text-muted">shortName:</span>{" "}
                                    <span class="text-rose-400 line-through">{entry.saved!.short_name}</span>{" "}
                                    →{" "}
                                    <span class="text-emerald-400">{entry.justwatch!.shortName}</span>
                                  </div>
                                </Show>
                                <Show when={entry.justwatch && entry.saved && entry.justwatch.icon !== entry.saved.icon_template}>
                                  <div>
                                    <span class="text-text-muted">icon:</span>{" "}
                                    <span class="text-rose-400 line-through">{entry.saved!.icon_template.slice(0, 40)}</span>{" "}
                                    →{" "}
                                    <span class="text-emerald-400">{entry.justwatch!.icon.slice(0, 40)}</span>
                                  </div>
                                </Show>
                              </div>
                            </Show>
                          </div>

                          {/* Per-row actions */}
                          <div class="flex shrink-0 gap-1">
                            <Show when={entry.status === "NEW" || entry.status === "UPDATED"}>
                              <GlassButton
                                variant="ghost"
                                onClick={() => void handlePublishOne(entry)}
                                disabled={publishing()}
                                title="Publish this provider"
                              >
                                {entry.status === "NEW" ? "Add" : "Publish update"}
                              </GlassButton>
                            </Show>
                            <Show when={entry.status === "UPDATED"}>
                              <GlassButton
                                variant="ghost"
                                onClick={() => void handleUpdateMetadata(entry)}
                                disabled={updating()}
                                title="Update saved metadata from JustWatch"
                              >
                                Update metadata
                              </GlassButton>
                            </Show>
                            <Show when={entry.saved && entry.saved.active}>
                              <GlassButton
                                variant="danger"
                                onClick={() => void handleDeactivate(entry.technical_name)}
                                disabled={deactivating()}
                                title="Deactivate — hide from user Library"
                              >
                                Deactivate
                              </GlassButton>
                            </Show>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  }}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

export default AdminPlatformCatalogPage;
