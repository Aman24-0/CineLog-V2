// src/features/admin/AdminPlatformCatalogPage.tsx
//
// CineLog V2 — Admin Platform Catalogue Page (Part 4 redesign)
// ---------------------------------------------------------------------
// The admin surface for managing the published JustWatch provider
// catalogue that powers the user-side Library Platform filter.
//
// WORKFLOW (Save Selected = complete published catalogue):
//   1. Admin picks a country (dropdown of supported JustWatch regions).
//   2. Admin clicks "Fetch Catalogue" → server calls JustWatch and
//      returns a diff against the saved Supabase rows (SAVED / NEW /
//      UPDATED / REMOVED). The diagnostic panel shows the fetch
//      duration, last fetch time, and counts of each diff status.
//   3. The provider list renders with checkboxes. Initial selection
//      reflects the CURRENT published state:
//        - SAVED + active=true   → checked
//        - SAVED + active=false  → unchecked
//        - NEW (not in Supabase) → unchecked
//        - REMOVED (not in latest JustWatch) → unchecked AND
//          disabled (the admin can't select a provider JustWatch no
//          longer returns; the row is preserved in Supabase but will
//          be deactivated on Save Selected because it's not in the
//          selected set).
//   4. Admin toggles checkboxes to choose the EXACT set of providers
//      to publish.
//   5. Admin clicks "Save Selected":
//        - If the selection is empty, a confirm dialog warns that
//          all platforms will be removed from the user Platform
//          filter. The admin can confirm or cancel.
//        - On confirm, the page calls POST
//          /api/admin/platform-catalog/save-selection with the
//          country + the full JustWatchPackage[] for the selected
//          providers. The server upserts the selected providers
//          with `active = true` AND deactivates ALL OTHER rows for
//          the same country (country-isolated).
//   6. After Save Selected succeeds, the page re-fetches the diff
//      so the checkboxes reflect the new saved state.
//
// KEY DIFFERENCE FROM THE OLD "Add Selected":
//   - OLD: `handlePublishSelected` only UPSERTS active=true for the
//     selected providers. Providers the admin didn't select KEEP
//     their previous active state — so a previously-active provider
//     stays active even if the admin unchecks it.
//   - NEW: `handleSaveSelected` makes the EXACT selected set the
//     complete published catalogue. Unselected providers (including
//     previously-active ones) become `active = false`. This is the
//     "complete selection" model the spec requires.
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
  // `selected` is the SET of technicalName values the admin has
  // checked. It's initialized from the saved rows where
  // `saved.active === true` on every Fetch Catalogue, and the admin
  // can toggle any checkbox to add/remove from this set. The set
  // represents the EXACT catalogue the admin wants to publish —
  // Save Selected will make this set the complete published
  // catalogue (everything else becomes `active = false`).
  const [selected, setSelected] = createSignal<Set<string>>(new Set<string>());

  // Mutation in-flight flags so the user gets immediate feedback.
  const [saving, setSaving] = createSignal(false);
  const [deactivating, setDeactivating] = createSignal(false);
  const [updating, setUpdating] = createSignal(false);
  const [mutationError, setMutationError] = createSignal<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = createSignal<string | null>(
    null
  );

  // Empty-selection confirm dialog state. When the admin clicks
  // "Save Selected" with 0 providers checked, we show a confirm
  // dialog instead of immediately saving (the zero-selection case
  // deactivates ALL rows for the country, which the user Platform
  // filter would render as "No platforms available for your
  // country"). The admin can confirm or cancel.
  const [confirmEmpty, setConfirmEmpty] = createSignal(false);

  // ── Fetch handler: calls JustWatch + returns the diff ──────────
  const handleFetch = async () => {
    setFetching(true);
    setFetchError(null);
    setMutationError(null);
    setMutationSuccess(null);
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
      // Initialize the selection from the CURRENT published state:
      //   - SAVED + active=true   → checked
      //   - SAVED + active=false  → unchecked
      //   - NEW (not in Supabase) → unchecked
      //   - REMOVED               → unchecked (and the checkbox is
      //                            disabled in the UI because the
      //                            provider isn't in the JustWatch
      //                            response, so it can't be selected
      //                            for publishing)
      //
      // This is the "selection source of truth" rule from the spec:
      //   checked = saved row exists AND saved.active === true
      //
      // We do NOT pre-select NEW providers (the old behavior did,
      // which caused accidental publishing of every newly-
      // discovered provider). The admin explicitly opts in to
      // publishing each provider by checking it.
      setSelected(
        new Set<string>(
          data.diff
            .filter((d) => d.saved?.active === true)
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

  // ── Save Selected handler ──────────────────────────────────────
  // Makes the EXACT selected set the complete published catalogue
  // for the country. Calls the dedicated save-selection route (NOT
  // the old publish route) so the server can atomically upsert +
  // deactivate-others in one request.
  const handleSaveSelected = async (providers: JustWatchPackage[]) => {
    setSaving(true);
    setMutationError(null);
    setMutationSuccess(null);
    try {
      const res = await fetch("/api/admin/platform-catalog/save-selection", {
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
      const result = (await res.json()) as {
        ok: boolean;
        published: number;
        deactivated: number;
      };
      setMutationSuccess(
        `Saved: ${result.published} published, ${result.deactivated} deactivated.`
      );
      // Re-fetch the diff so the checkboxes reflect the new saved
      // state (selected providers are now SAVED + active=true; any
      // previously-active providers the admin unchecked are now
      // SAVED + active=false and will render unchecked).
      await handleFetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Build the JustWatchPackage[] for the currently-selected
  // technical names, using the JustWatch metadata from the latest
  // fetch. This is what we send to the save-selection route.
  const buildSelectedProviders = (): JustWatchPackage[] => {
    const sel = selected();
    const providers: JustWatchPackage[] = [];
    for (const entry of fetchResult()?.diff ?? []) {
      if (sel.has(entry.technical_name) && entry.justwatch) {
        providers.push(entry.justwatch);
      }
    }
    return providers;
  };

  // Click handler for the "Save Selected" button. If the selection
  // is empty, show the confirm dialog instead of saving immediately.
  const onClickSaveSelected = () => {
    const providers = buildSelectedProviders();
    if (providers.length === 0) {
      setConfirmEmpty(true);
      return;
    }
    void handleSaveSelected(providers);
  };

  // Confirm handler for the empty-selection dialog. The admin has
  // acknowledged that saving 0 providers will remove all platforms
  // from the user Platform filter.
  const onConfirmEmptySave = () => {
    setConfirmEmpty(false);
    void handleSaveSelected([]);
  };

  // ── Deactivate handler (per-row, kept for quick one-off) ──────
  // The per-row "Deactivate" button is kept as a quick way to
  // deactivate a single provider WITHOUT going through the full
  // Save Selected flow. It calls the existing deactivate route
  // (country-scoped, single technical_name). After deactivating,
  // the page re-fetches the diff so the checkbox reflects the new
  // state (unchecked + inactive).
  const handleDeactivate = async (technicalName: string) => {
    setDeactivating(true);
    setMutationError(null);
    setMutationSuccess(null);
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
      setMutationSuccess(`Deactivated ${technicalName}.`);
      await handleFetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeactivating(false);
    }
  };

  // ── Update metadata handler (per-row, kept for metadata edits) ─
  // The per-row "Update metadata" button is kept because metadata
  // edits (clearName / shortName / icon_template) are independent of
  // the publish/active state. The admin can update a provider's
  // metadata without changing its active flag.
  const handleUpdateMetadata = async (entry: DiffEntry) => {
    if (!entry.justwatch) return;
    setUpdating(true);
    setMutationError(null);
    setMutationSuccess(null);
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
      setMutationSuccess(`Updated metadata for ${entry.clear_name}.`);
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
    // Clear any success message when the admin starts editing the
    // selection again — otherwise the stale "Saved: 4 published"
        // message would linger and confuse the admin about whether
        // their new edits have been saved.
    setMutationSuccess(null);
  };

  const selectedCount = createMemo(() => selected().size);

  // `publishedCount` is the count of saved rows where active=true
  // for the current country. This is the CURRENT published state
  // (before any pending Save Selected). The diagnostic panel shows
  // this as "Published" — distinct from "Selected" (the admin's
  // current checkbox state) and "JustWatch providers" (the latest
  // fetch count).
  const publishedCount = createMemo(() => {
    const rows = fetchResult()?.saved_rows ?? [];
    return rows.filter((r) => r.active).length;
  });

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
          Check the providers you want to publish and click
          "Save Selected" — the EXACT selected set becomes the
          complete published catalogue for the country (everything
          else becomes inactive).
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
                setMutationError(null);
                setMutationSuccess(null);
                setConfirmEmpty(false);
              }}
              class="w-full rounded-lg border border-hairline bg-glass-strong px-3 py-2 text-text-strong"
              disabled={fetching() || saving()}
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
            disabled={fetching() || saving()}
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
          Saving a catalogue for one country does NOT affect other
          countries.
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
              {/* "Published" = the CURRENT count of active=true rows
                  for the country (before any pending Save Selected).
                  This is distinct from "Selected" (the admin's
                  current checkbox state) and from "JustWatch
                  providers" (the latest fetch count). */}
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Published
                </div>
                <div class="type-body mt-1 font-semibold text-emerald-400">
                  {publishedCount()}
                </div>
              </div>
              {/* "Selected" = the admin's CURRENT checkbox state
                  (live — updates as the admin toggles checkboxes).
                  After Save Selected, this number becomes the new
                  "Published" count. */}
              <div class="rounded-lg border border-hairline bg-glass p-3">
                <div class="type-meta text-xs uppercase tracking-widest text-text-muted">
                  Selected
                </div>
                <div class="type-body mt-1 font-semibold text-sky-400">
                  {selectedCount()}
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

      {/* Success / error messages */}
      <Show when={mutationSuccess()}>
        <GlassCard class="border border-emerald-500/40 p-4">
          <p class="type-body text-emerald-400">
            <strong>Saved.</strong> {mutationSuccess()}
          </p>
        </GlassCard>
      </Show>
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

      {/* Empty-selection confirm dialog */}
      <Show when={confirmEmpty()}>
        <div
          class="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-empty-title"
        >
          <GlassCard class="w-full max-w-md p-6">
            <h2
              id="confirm-empty-title"
              class="type-headline mb-2 text-lg text-text-strong"
            >
              No platforms selected
            </h2>
            <p class="type-body-soft mb-4 text-sm leading-relaxed">
              You're about to save an empty selection. This will
              remove ALL platforms from the user Platform filter for
              this country — users will see "No platforms available
              for your country" until you publish providers again.
              The existing provider rows are NOT deleted (they become
              inactive and can be re-published later).
            </p>
            <div class="flex justify-end gap-2">
              <GlassButton
                variant="ghost"
                onClick={() => setConfirmEmpty(false)}
                disabled={saving()}
              >
                Cancel
              </GlassButton>
              <GlassButton
                variant="danger"
                onClick={() => onConfirmEmptySave()}
                disabled={saving()}
              >
                {saving() ? "Saving…" : "Continue — save empty"}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      </Show>

      {/* Diff list + action bar */}
      <Show when={fetchResult()}>
        {(result) => (
          <>
            {/* Sticky action bar — the primary workflow is now
                "Save Selected" (makes the EXACT selected set the
                complete published catalogue). The old "Add Selected"
                and "Add All New" buttons were REMOVED because they
                conflicted with the exact-selection model. */}
            <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-glass-strong/95 p-3 backdrop-blur">
              <span class="type-meta text-xs uppercase tracking-widest text-text-muted">
                {selectedCount()} selected
              </span>
              <div class="flex-1" />
              <GlassButton
                variant="primary"
                onClick={() => onClickSaveSelected()}
                disabled={saving()}
                title="Make the exact selected set the complete published catalogue for this country. Everything else becomes inactive."
              >
                {saving() ? "Saving…" : "Save Selected"}
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
                    // A REMOVED entry (JustWatch no longer returns
                    // it) can't be selected for publishing because
                    // we don't have its JustWatchPackage metadata
                    // to upsert. The checkbox is disabled. The row
                    // is preserved in Supabase; if it was active
                    // before, Save Selected will deactivate it
                    // (because it's not in the selected set).
                    const isRemovable = () => entry.status === "REMOVED";
                    return (
                      <GlassCard class="p-3">
                        <div class="flex flex-wrap items-center gap-3">
                          {/* Checkbox for select-to-publish.
              The checkbox represents "should this provider be
              published?" — NOT "is this provider new?". The
              admin can check/uncheck ANY provider regardless
              of its diff status (SAVED / NEW / UPDATED). Only
              REMOVED entries are disabled because we don't
              have the JustWatch metadata to upsert. */}
                          <input
                            type="checkbox"
                            checked={isSelected()}
                            onChange={() => toggleSelected(entry.technical_name)}
                            disabled={isRemovable()}
                            class="h-4 w-4 cursor-pointer accent-[var(--p)] disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Select ${entry.clear_name}`}
                            title={
                              isRemovable()
                                ? "Not in latest JustWatch fetch — cannot be selected for publishing. Save Selected will deactivate it if it was active."
                                : "Check to include in the published catalogue"
                            }
                          />

                          {/* Status badge — kept for diff context.
              Selection is INDEPENDENT from diff status: a SAVED
              provider can be unchecked, a NEW provider can be
              checked, an UPDATED provider can be checked. The
              checkbox represents "should this provider be
              published?", NOT "is this provider new?". */}
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
                              <Show when={entry.saved?.active === true}>
                                {" · "}
                                <span class="text-emerald-400">published</span>
                              </Show>
                              <Show when={entry.saved && entry.saved.active === false}>
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

                          {/* Per-row actions.
              The per-row "Add" / "Publish update" buttons were
              REMOVED — the primary workflow is now "Save
              Selected" which handles the complete catalogue in
              one atomic operation. The per-row "Deactivate" and
              "Update metadata" buttons are kept for quick one-
              off actions that don't warrant a full Save
              Selected. */}
                          <div class="flex shrink-0 gap-1">
                            <Show when={entry.status === "UPDATED"}>
                              <GlassButton
                                variant="ghost"
                                onClick={() => void handleUpdateMetadata(entry)}
                                disabled={updating() || saving()}
                                title="Update saved metadata from JustWatch (does not change active state)"
                              >
                                Update metadata
                              </GlassButton>
                            </Show>
                            <Show when={entry.saved && entry.saved.active}>
                              <GlassButton
                                variant="danger"
                                onClick={() => void handleDeactivate(entry.technical_name)}
                                disabled={deactivating() || saving()}
                                title="Deactivate — hide from user Library immediately (without a full Save Selected)"
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
