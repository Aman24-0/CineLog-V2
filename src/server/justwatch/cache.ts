// src/server/justwatch/cache.ts
//
// CineLog V2 — JustWatch OTT Migration — Cache Layer (Supabase)
// ---------------------------------------------------------------------
// Reads + writes the three tables introduced by the Chunk 1 migration
// `supabase/migrations/20260818_justwatch_ott_migration.sql`:
//
//   • justwatch_provider_catalog  (PK: country, technical_name)
//   • justwatch_title_mapping     (PK: media_type, tmdb_id, country)
//   • ott_availability_cache      (PK: media_type, tmdb_id, country)
//
// All writes go through the service-role Supabase client (bypasses RLS),
// mirroring the pattern established in `src/server/audio-language/cache.ts`:
//   - Lazy-init `createClient` using `VITE_SUPABASE_URL` +
//     `SUPABASE_SERVICE_ROLE_KEY`.
//   - Auth options: `{ autoRefreshToken: false, persistSession: false }`.
//   - Errors during client init or query are caught and logged via
//     `console.warn`; the caller sees `null` / no-op writes rather than
//     thrown errors. This matches the audio-language cache's
//     "never throw to UI" philosophy.
//
// Country is always part of the cache key for every table — JustWatch
// offer data and provider availability are country-specific, so an "IN"
// row must never be returned for a "DE" request (same isolation rule as
// the audio-language cache).
//
// TTL is expressed as a `expires_at timestamptz` column. Reads filter on
// `expires_at > now()` so expired rows are ignored (and naturally
// refreshed by the service layer above).

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "~/lib/supabase/database.types";
import type {
  JustWatchOffer,
  JustWatchPackage
} from "~/shared/types/justwatch";

// ---------------------------------------------------------------------------
// Local Database augmentation
// ---------------------------------------------------------------------------

// The three new tables are NOT yet reflected in `database.types.ts` (that
// file is regenerated from a live Supabase schema and is shared with the
// rest of the codebase). To get full type safety on `.from(...)` calls
// without modifying the canonical types file, we locally augment the
// `Database` type via intersection. Once `database.types.ts` is
// regenerated to include these tables, this local augmentation should
// be removed.
type JustWatchAugmentedTables = {
  justwatch_provider_catalog: {
    Row: {
      country: string;
      package_id: string;
      clear_name: string;
      short_name: string;
      technical_name: string;
      icon_template: string;
      fetched_at: string;
      expires_at: string;
      // Part 4 — published/active flag + admin-management timestamps.
      active: boolean;
      last_fetched_at: string | null;
      published_at: string | null;
      updated_at: string | null;
    };
    Insert: {
      country: string;
      package_id: string;
      clear_name: string;
      short_name: string;
      technical_name: string;
      icon_template: string;
      fetched_at?: string;
      expires_at?: string;
      active?: boolean;
      last_fetched_at?: string | null;
      published_at?: string | null;
      updated_at?: string | null;
    };
    Update: {
      country?: string;
      package_id?: string;
      clear_name?: string;
      short_name?: string;
      technical_name?: string;
      icon_template?: string;
      fetched_at?: string;
      expires_at?: string;
      active?: boolean;
      last_fetched_at?: string | null;
      published_at?: string | null;
      updated_at?: string | null;
    };
    Relationships: [];
  };
  justwatch_title_mapping: {
    Row: {
      media_type: "movie" | "tv";
      tmdb_id: number;
      country: string;
      justwatch_node_id: string;
      resolved_at: string;
      expires_at: string;
    };
    Insert: {
      media_type: "movie" | "tv";
      tmdb_id: number;
      country: string;
      justwatch_node_id: string;
      resolved_at?: string;
      expires_at: string;
    };
    Update: {
      media_type?: "movie" | "tv";
      tmdb_id?: number;
      country?: string;
      justwatch_node_id?: string;
      resolved_at?: string;
      expires_at?: string;
    };
    Relationships: [];
  };
  ott_availability_cache: {
    Row: {
      media_type: "movie" | "tv";
      tmdb_id: number;
      country: string;
      justwatch_node_id: string;
      offers: Json;
      fetched_at: string;
      expires_at: string;
    };
    Insert: {
      media_type: "movie" | "tv";
      tmdb_id: number;
      country: string;
      justwatch_node_id: string;
      offers: Json;
      fetched_at?: string;
      expires_at: string;
    };
    Update: {
      media_type?: "movie" | "tv";
      tmdb_id?: number;
      country?: string;
      justwatch_node_id?: string;
      offers?: Json;
      fetched_at?: string;
      expires_at?: string;
    };
    Relationships: [];
  };
};

type JustWatchDatabase = Database & {
  public: {
    Tables: JustWatchAugmentedTables;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Service-role client (lazy init, server-only, never throws)
// ---------------------------------------------------------------------------
//
// `getServiceClient()` returns `null` (and warns) when env vars are missing,
// instead of throwing. This makes the cache layer resilient on Vercel
// preview deployments where `SUPABASE_SERVICE_ROLE_KEY` may not yet be
// configured — cache reads return `null` (→ service falls through to
// live JustWatch), cache writes are skipped (no-op), and the route still
// returns 200 with live data. Mirrors the "fail open" philosophy of
// `src/lib/supabase/server.ts` and the audio-language cache.

let _client: ReturnType<typeof createClient<JustWatchDatabase>> | null = null;
let _clientInitAttempted = false;

function getServiceClient(): ReturnType<typeof createClient<JustWatchDatabase>> | null {
  if (_client) return _client;
  if (_clientInitAttempted) return null; // already failed once — don't retry
  _clientInitAttempted = true;

  // Read env vars via both `import.meta.env` (Vite-inlined at build time)
  // and `process.env` (runtime env on Vercel serverless) — same pattern
  // as `src/server/justwatch/region.ts:readEnv`.
  let url: string | undefined;
  let serviceKey: string | undefined;
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    if (env) {
      url = env.VITE_SUPABASE_URL;
      serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    }
  } catch {
    /* not in a Vite context */
  }
  if (!url && typeof process !== "undefined" && process.env) {
    url = process.env.VITE_SUPABASE_URL;
  }
  if (!serviceKey && typeof process !== "undefined" && process.env) {
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  if (!url || !serviceKey) {
    console.warn(
      "[justwatch/cache] service client unavailable — missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Cache reads will miss (falling through to live JustWatch) and cache writes will be skipped."
    );
    return null;
  }

  try {
    _client = createClient<JustWatchDatabase>(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    return _client;
  } catch (err) {
    console.warn(
      "[justwatch/cache] service client init failed:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// TTL helpers
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * MS_PER_HOUR).toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString();
}

// ---------------------------------------------------------------------------
// 1. Provider catalog — read
// ---------------------------------------------------------------------------

/**
 * Read the cached JustWatch provider catalog for a country. Returns rows
 * whose `expires_at` is still in the future. Rows are sorted by
 * `clear_name` ascending so the consumer can render providers in a
 * stable alphabetical order.
 *
 * Returns `null` when no fresh row exists (caller should fetch from
 * JustWatch and call `upsertProviderCatalog`).
 */
export async function getCachedProviderCatalog(
  country: string
): Promise<JustWatchPackage[] | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("justwatch_provider_catalog")
      .select(
        "package_id, clear_name, short_name, technical_name, icon_template"
      )
      .eq("country", country)
      .gt("expires_at", nowIso)
      .order("clear_name", { ascending: true });

    if (error) {
      console.warn(
        "[justwatch/cache] getCachedProviderCatalog query error:",
        error.message
      );
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map((row) => ({
      id: row.package_id,
      clearName: row.clear_name,
      shortName: row.short_name,
      technicalName: row.technical_name,
      icon: row.icon_template
    }));
  } catch (err) {
    // Defensive: supabase-js normally returns errors in `res.error`, but
    // a network failure, RLS rejection, or unexpected runtime error can
    // still throw. Never propagate to the service layer.
    console.warn(
      "[justwatch/cache] getCachedProviderCatalog threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Provider catalog — write
// ---------------------------------------------------------------------------

/**
 * Upsert a freshly-fetched provider catalog for a country. Each provider
 * row is keyed by (country, technical_name) — JustWatch `technicalName`
 * is stable per country (e.g. "amazonprimevideo" in IN, "amazonprime" in
 * DE), so re-upserting after a country change will create new rows rather
 * than overwriting the old country's rows.
 *
 * Default TTL is 48 hours. Provider catalogs change slowly (new providers
 * appear on the order of months), but we keep the TTL short to allow
 * icon URL rotations and shortName updates to propagate.
 */
export async function upsertProviderCatalog(
  country: string,
  providers: JustWatchPackage[],
  ttlHours = 48
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  if (providers.length === 0) return;

  try {
    const fetchedAt = new Date().toISOString();
    const expiresAt = hoursFromNow(ttlHours);

    const rows = providers.map((p) => ({
      country,
      package_id: p.id,
      clear_name: p.clearName,
      short_name: p.shortName,
      technical_name: p.technicalName,
      icon_template: p.icon,
      fetched_at: fetchedAt,
      expires_at: expiresAt
    }));

    const { error } = await supabase
      .from("justwatch_provider_catalog")
      .upsert(rows, {
        onConflict: "country,technical_name",
        ignoreDuplicates: false
      });

    if (error) {
      console.warn(
        "[justwatch/cache] upsertProviderCatalog upsert error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] upsertProviderCatalog threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// 2b. Published provider catalog — Part 4 redesign
// ---------------------------------------------------------------------------

/**
 * Read the PUBLISHED JustWatch provider catalogue for a country.
 * Returns ONLY rows with `active = true` (no `expires_at` filter —
 * published rows do NOT expire; admin-controlled refresh is the
 * source of truth). Sorted by `clear_name` ascending.
 *
 * This is the user-side read path: the Library Platform filter
 * dropdown options are derived from this list. NO JustWatch
 * fallback — if no rows are published for the country, the
 * catalogue is empty and the dropdown shows "No platforms
 * available for your country".
 *
 * Returns `null` on any cache error (caller should treat as
 * "no catalogue available" — the dropdown renders its empty state).
 */
export async function getPublishedProviderCatalog(
  country: string
): Promise<JustWatchPackage[] | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("justwatch_provider_catalog")
      .select(
        "package_id, clear_name, short_name, technical_name, icon_template"
      )
      .eq("country", country)
      .eq("active", true)
      .order("clear_name", { ascending: true });

    if (error) {
      console.warn(
        "[justwatch/cache] getPublishedProviderCatalog query error:",
        error.message
      );
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map((row) => ({
      id: row.package_id,
      clearName: row.clear_name,
      shortName: row.short_name,
      technicalName: row.technical_name,
      icon: row.icon_template
    }));
  } catch (err) {
    console.warn(
      "[justwatch/cache] getPublishedProviderCatalog threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Read the FULL provider catalogue for a country (active AND
 * inactive rows), with admin-only fields. Used by the admin
 * Platform Catalogue page to render the comparison view against
 * the latest JustWatch fetch.
 *
 * Sorted by `clear_name` ascending.
 */
export interface ProviderCatalogRow {
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

export async function getFullProviderCatalog(
  country: string
): Promise<ProviderCatalogRow[] | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("justwatch_provider_catalog")
      .select(
        "country, package_id, clear_name, short_name, technical_name, icon_template, fetched_at, expires_at, active, last_fetched_at, published_at, updated_at"
      )
      .eq("country", country)
      .order("clear_name", { ascending: true });

    if (error) {
      console.warn(
        "[justwatch/cache] getFullProviderCatalog query error:",
        error.message
      );
      return null;
    }

    return (data ?? []) as ProviderCatalogRow[];
  } catch (err) {
    console.warn(
      "[justwatch/cache] getFullProviderCatalog threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Publish (set `active = true`) for one or more providers in a
 * country. If the row doesn't exist yet (a NEW provider from a
 * JustWatch fetch), it's inserted with `active = true`. If the
 * row already exists, `active` is flipped to `true` and
 * `published_at` is stamped. `last_fetched_at` is bumped to now
 * (the admin is publishing a freshly-fetched row).
 *
 * Used by the admin Platform Catalogue page's "Add" / "Add
 * Selected" / "Add All New" actions.
 *
 * `providers` is the JustWatch packages to publish (typically a
 * subset of the latest JustWatch fetch response).
 */
export async function publishProviders(
  country: string,
  providers: JustWatchPackage[]
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  if (!providers || providers.length === 0) return;

  try {
    const nowIso = new Date().toISOString();
    const longExpiresAt = daysFromNow(365 * 10); // published rows don't expire; set a far-future date to satisfy NOT NULL
    const rows = providers.map((p) => ({
      country,
      package_id: p.id,
      clear_name: p.clearName,
      short_name: p.shortName,
      technical_name: p.technicalName,
      icon_template: p.icon,
      fetched_at: nowIso,
      expires_at: longExpiresAt,
      active: true,
      last_fetched_at: nowIso,
      published_at: nowIso,
      updated_at: nowIso
    }));

    const { error } = await supabase
      .from("justwatch_provider_catalog")
      .upsert(rows, {
        onConflict: "country,technical_name",
        ignoreDuplicates: false
      });

    if (error) {
      console.warn(
        "[justwatch/cache] publishProviders upsert error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] publishProviders threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Update a single provider's display metadata (clearName /
 * shortName / icon_template). Stamps `updated_at = now()`.
 *
 * Used by the admin Platform Catalogue page's "Update metadata"
 * action when a JustWatch fetch reports a changed clearName etc.
 * The `active` flag is NOT touched (a metadata edit doesn't
 * change publish state).
 */
export async function updateProviderMetadata(
  country: string,
  technicalName: string,
  patch: {
    clearName?: string;
    shortName?: string;
    iconTemplate?: string;
  }
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  try {
    const nowIso = new Date().toISOString();
    const update: {
      updated_at: string;
      clear_name?: string;
      short_name?: string;
      icon_template?: string;
    } = { updated_at: nowIso };
    if (typeof patch.clearName === "string") update.clear_name = patch.clearName;
    if (typeof patch.shortName === "string") update.short_name = patch.shortName;
    if (typeof patch.iconTemplate === "string") update.icon_template = patch.iconTemplate;

    const { error } = await supabase
      .from("justwatch_provider_catalog")
      .update(update)
      .eq("country", country)
      .eq("technical_name", technicalName);

    if (error) {
      console.warn(
        "[justwatch/cache] updateProviderMetadata update error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] updateProviderMetadata threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Deactivate (set `active = false`) for one or more providers in a
 * country. The row is NOT deleted — the admin can re-publish it
 * later if the provider reappears in a JustWatch fetch (so user-
 * side data isn't lost due to a transient JustWatch response).
 *
 * Used by the admin Platform Catalogue page's "Deactivate" /
 * "Deactivate Selected" actions.
 */
export async function deactivateProviders(
  country: string,
  technicalNames: string[]
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  if (!technicalNames || technicalNames.length === 0) return;

  try {
    const { error } = await supabase
      .from("justwatch_provider_catalog")
      .update({ active: false, updated_at: new Date().toISOString() })
      .in("technical_name", technicalNames)
      .eq("country", country);

    if (error) {
      console.warn(
        "[justwatch/cache] deactivateProviders update error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] deactivateProviders threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Mark `last_fetched_at = now()` for one or more providers in a
 * country after an admin JustWatch fetch confirmed the row's
 * metadata is still current (so the admin UI can show "last seen
 * on <date>"). The `active` flag is NOT touched.
 */
export async function markProvidersLastFetched(
  country: string,
  technicalNames: string[]
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  if (!technicalNames || technicalNames.length === 0) return;

  try {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("justwatch_provider_catalog")
      .update({ last_fetched_at: nowIso })
      .in("technical_name", technicalNames)
      .eq("country", country);

    if (error) {
      console.warn(
        "[justwatch/cache] markProvidersLastFetched update error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] markProvidersLastFetched threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// 2c. Save exact selection — "Save Selected" admin action
// ---------------------------------------------------------------------

/**
 * Save the admin's EXACT selected set as the complete published
 * catalogue for a country.
 *
 * This is the "Save Selected" operation (replaces the old additive
 * "Add Selected" semantics). After this call:
 *   - every provider in `selectedProviders` has `active = true` for
 *     the given country (inserted if it doesn't exist, upserted if
 *     it does);
 *   - EVERY OTHER row for the same country has `active = false`
 *     (rows are NOT physically deleted — they're preserved for re-
 *     publish later, per the active/inactive architecture);
 *   - rows for OTHER countries are NOT touched (country isolation).
 *
 * This is implemented as TWO Supabase calls (not a single RPC) but
 * the two calls together form the complete synchronization:
 *   1. Upsert all selected providers with `active = true` +
 *      `published_at = now()` + `last_fetched_at = now()` +
 *      `updated_at = now()`.
 *   2. Update ALL rows for the country that are NOT in the selected
 *      set to `active = false` + `updated_at = now()`.
 *
 * Edge cases:
 *   - Empty `selectedProviders` (admin saves with 0 checked): step 1
 *     is skipped (no rows to upsert), step 2 deactivates ALL rows for
 *     the country. The admin UI guards against accidental zero-
 *     selection with a confirm dialog, but the server allows it
 *     because the empty catalogue is a valid state.
 *   - Provider already in Supabase with `active = true` and still
 *     selected: upsert refreshes `last_fetched_at` + `published_at`
 *     to now (no semantic change — it stays published).
 *   - Provider already in Supabase with `active = false` and now
 *     selected: upsert flips `active = true` + stamps `published_at`
 *     + `updated_at`.
 *   - Provider already in Supabase with `active = true` but NOT
 *     selected: step 2 deactivates it (`active = false`). This is
 *     the key new behavior — previously-active providers that the
 *     admin unchecks become inactive.
 *   - Provider NOT in Supabase (NEW from JustWatch) and selected:
 *     step 1 inserts it with `active = true` + `published_at = now`.
 *   - Provider in Supabase but NOT in the latest JustWatch fetch
 *     (REMOVED status): if the admin can't select it (it's not in
 *     the JustWatch response), it's NOT in `selectedProviders`, so
 *     step 2 deactivates it. The row is preserved for re-publish if
 *     JustWatch returns it again later.
 *
 * Country isolation: both Supabase calls are scoped to
 * `country = ?`. Rows for other countries are NEVER touched — saving
 * the IN catalogue does NOT modify US rows.
 *
 * @returns `{ published, deactivated }` counts for the audit log +
 *          the admin UI's success toast. Returns `{ published: 0,
 *          deactivated: 0 }` if the service client is unavailable
 *          (cache init error) — the route handler treats this as a
 *          500.
 */
export async function saveSelectionToPublishedCatalog(
  country: string,
  selectedProviders: JustWatchPackage[]
): Promise<{ published: number; deactivated: number }> {
  const supabase = getServiceClient();
  if (!supabase) {
    return { published: 0, deactivated: 0 };
  }

  const nowIso = new Date().toISOString();
  const longExpiresAt = daysFromNow(365 * 10); // published rows don't expire; satisfy NOT NULL
  const selectedTechnicalNames = new Set<string>(
    (selectedProviders ?? [])
      .filter(
        (p) =>
          !!p &&
          typeof p.technicalName === "string" &&
          p.technicalName.length > 0
      )
      .map((p) => p.technicalName)
  );

  let deactivatedCount = 0;

  try {
    // 1. Upsert all selected providers as active = true.
    if (selectedProviders && selectedProviders.length > 0) {
      const rows = selectedProviders
        .filter(
          (p): p is JustWatchPackage =>
            !!p &&
            typeof p.technicalName === "string" &&
            typeof p.clearName === "string" &&
            p.technicalName.length > 0 &&
            p.clearName.length > 0
        )
        .map((p) => ({
          country,
          package_id: p.id,
          clear_name: p.clearName,
          short_name: p.shortName,
          technical_name: p.technicalName,
          icon_template: p.icon,
          fetched_at: nowIso,
          expires_at: longExpiresAt,
          active: true,
          last_fetched_at: nowIso,
          published_at: nowIso,
          updated_at: nowIso
        }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("justwatch_provider_catalog")
          .upsert(rows, {
            onConflict: "country,technical_name",
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.warn(
            "[justwatch/cache] saveSelectionToPublishedCatalog upsert error:",
            upsertError.message
          );
          // Don't return early — still run the deactivate step so the
          // admin doesn't end up with a half-applied selection. The
          // deactivate step is what enforces "unselected = inactive",
          // and it's better to deactivate the unselected providers
          // even if some selected upserts failed.
        }
      }
    }

    // 2. Deactivate ALL OTHER rows for the same country.
    //
    // We use the raw `.filter()` method to build a `not.in.(...)`
    // clause, mirroring the value-cleaning logic that supabase-js's
    // `.in()` helper uses internally (see
    // node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts).
    // We do NOT use `.not(column, "in", value)` because `.not()`
    // passes `value` through unchanged and expects the caller to
    // produce the raw PostgREST syntax — the array form is easier
    // to get wrong. Building the cleaned string ourselves and using
    // `.filter()` lets us handle:
    //   - Empty selected set: skip the `not.in` clause entirely,
    //     which deactivates ALL rows for the country (the zero-
    //     selection case the admin UI guards with a confirm dialog).
    //   - Values containing a literal `"`: escape as `""` (PostgREST
    //     uses doubled double-quotes for escaping inside quoted
    //     strings — same as CSV).
    //
    // We always wrap every value in double quotes for
    // predictability. PostgREST strips the surrounding quotes if
    // the value contains no reserved chars; if it does (`,` `(` `)`
    // per https://postgrest.org/en/stable/api.html#reserved-
    // characters), the quotes are required.
    const cleanedSelected = Array.from(selectedTechnicalNames)
      .map((s) => {
        const escaped = s.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(",");

    let deactivateQuery = supabase
      .from("justwatch_provider_catalog")
      .update({ active: false, updated_at: nowIso })
      .eq("country", country);

    if (selectedTechnicalNames.size > 0) {
      // Add `technical_name=not.in.("a","b","c")` so we deactivate
      // only rows whose technical_name is NOT in the selected set.
      deactivateQuery = deactivateQuery.filter(
        "technical_name",
        "not.in",
        `(${cleanedSelected})`
      );
    }
    // If selectedTechnicalNames is empty, the query is just
    // `UPDATE ... WHERE country = ?` — deactivates all rows for the
    // country (the zero-selection case).

    const { data: deactivatedData, error: deactivateError } =
      await deactivateQuery.select("technical_name");

    if (deactivateError) {
      console.warn(
        "[justwatch/cache] saveSelectionToPublishedCatalog deactivate error:",
        deactivateError.message
      );
    } else if (Array.isArray(deactivatedData)) {
      deactivatedCount = deactivatedData.length;
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] saveSelectionToPublishedCatalog threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return {
    published: selectedTechnicalNames.size,
    deactivated: deactivatedCount
  };
}


// ---------------------------------------------------------------------------
// 3. Title mapping — read
// ---------------------------------------------------------------------------

/**
 * Read the cached JustWatch node ID for a TMDB title in a country.
 * Returns `null` when no fresh mapping exists.
 */
export async function getCachedTitleMapping(
  mediaType: "movie" | "tv",
  tmdbId: number,
  country: string
): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("justwatch_title_mapping")
      .select("justwatch_node_id")
      .eq("media_type", mediaType)
      .eq("tmdb_id", tmdbId)
      .eq("country", country)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (error) {
      console.warn(
        "[justwatch/cache] getCachedTitleMapping query error:",
        error.message
      );
      return null;
    }

    if (!data) return null;
    return data.justwatch_node_id;
  } catch (err) {
    console.warn(
      "[justwatch/cache] getCachedTitleMapping threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Title mapping — write
// ---------------------------------------------------------------------------

/**
 * Upsert a TMDB → JustWatch node ID mapping for a country. The cache key
 * is (media_type, tmdb_id, country); re-resolving the same title in a
 * different country creates a separate row.
 *
 * Default TTL is 30 days — TMDB↔JustWatch mappings are very stable
 * (JustWatch node IDs rarely change once a title is indexed).
 */
export async function upsertTitleMapping(
  mediaType: "movie" | "tv",
  tmdbId: number,
  country: string,
  justwatchNodeId: string,
  ttlDays = 30
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  try {
    const expiresAt = daysFromNow(ttlDays);
    const { error } = await supabase
      .from("justwatch_title_mapping")
      .upsert(
        {
          media_type: mediaType,
          tmdb_id: tmdbId,
          country,
          justwatch_node_id: justwatchNodeId,
          expires_at: expiresAt
        },
        {
          onConflict: "media_type,tmdb_id,country",
          ignoreDuplicates: false
        }
      );

    if (error) {
      console.warn(
        "[justwatch/cache] upsertTitleMapping upsert error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] upsertTitleMapping threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// 5. OTT availability — read
// ---------------------------------------------------------------------------

/**
 * Read the cached OTT offers for a TMDB title in a country.
 * Returns `{ justwatchNodeId, offers }` or `null` when no fresh row
 * exists. The cached `offers` JSONB is parsed back into a typed
 * `JustWatchOffer[]` (best-effort cast — the row was written by us, so
 * the shape is trusted).
 */
export async function getCachedOttAvailability(
  mediaType: "movie" | "tv",
  tmdbId: number,
  country: string
): Promise<{ justwatchNodeId: string; offers: JustWatchOffer[] } | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("ott_availability_cache")
      .select("justwatch_node_id, offers")
      .eq("media_type", mediaType)
      .eq("tmdb_id", tmdbId)
      .eq("country", country)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (error) {
      console.warn(
        "[justwatch/cache] getCachedOttAvailability query error:",
        error.message
      );
      return null;
    }

    if (!data) return null;

    // Cast the JSONB blob to the typed offer array. We wrote it, so the
    // shape is trusted. If JustWatch ever changes its offer schema and we
    // cache stale-shape data, callers should defensively handle missing
    // fields (the JustWatchOffer type already marks most fields optional
    // or nullable).
    const offers = (data.offers as unknown as JustWatchOffer[]) ?? [];

    return {
      justwatchNodeId: data.justwatch_node_id,
      offers
    };
  } catch (err) {
    console.warn(
      "[justwatch/cache] getCachedOttAvailability threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 6. OTT availability — write
// ---------------------------------------------------------------------------

/**
 * Upsert a freshly-fetched OTT availability payload for a TMDB title in
 * a country. The full offers array is stored as JSONB so the consumer
 * can render the "Where to Watch" panel without re-querying JustWatch.
 *
 * Default TTL is 48 hours — OTT availability changes more frequently
 * than title mappings (new providers sign on, existing providers pull
 * titles), but not so frequently that we want to hit JustWatch on every
 * details-page load.
 */
export async function upsertOttAvailability(
  mediaType: "movie" | "tv",
  tmdbId: number,
  country: string,
  justwatchNodeId: string,
  offers: JustWatchOffer[],
  ttlHours = 48
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  try {
    const fetchedAt = new Date().toISOString();
    const expiresAt = hoursFromNow(ttlHours);

    const { error } = await supabase
      .from("ott_availability_cache")
      .upsert(
        {
          media_type: mediaType,
          tmdb_id: tmdbId,
          country,
          justwatch_node_id: justwatchNodeId,
          offers: JSON.stringify(offers) as unknown as Json,
          fetched_at: fetchedAt,
          expires_at: expiresAt
        },
        {
          onConflict: "media_type,tmdb_id,country",
          ignoreDuplicates: false
        }
      );

    if (error) {
      console.warn(
        "[justwatch/cache] upsertOttAvailability upsert error:",
        error.message
      );
    }
  } catch (err) {
    console.warn(
      "[justwatch/cache] upsertOttAvailability threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
