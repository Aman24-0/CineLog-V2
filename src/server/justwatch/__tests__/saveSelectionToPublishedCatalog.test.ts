// src/server/justwatch/__tests__/saveSelectionToPublishedCatalog.test.ts
//
// Tests for the `saveSelectionToPublishedCatalog` helper in
// src/server/justwatch/cache.ts.
//
// This helper implements the "Save Selected = complete published
// catalogue" admin operation:
//   1. Upsert all selected providers with `active = true`.
//   2. Deactivate ALL OTHER rows for the same country
//      (`active = false`).
//   3. Country-isolated — never touches other countries' rows.
//
// The Supabase client is mocked so we can verify the exact upsert +
// update calls without a real database.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock Supabase client ──────────────────────────────────────────
//
// `saveSelectionToPublishedCatalog` calls
//   supabase.from("justwatch_provider_catalog").upsert(rows, {...})
// and
//   supabase.from("justwatch_provider_catalog").update({active:false,...})
//     .eq("country", country).filter("technical_name", "not.in", "(...)").select("technical_name")
//
// We capture these calls via chainable mock builders.

interface CapturedUpsert {
  rows: unknown[];
  options: { onConflict: string; ignoreDuplicates: boolean } | undefined;
}
interface CapturedUpdate {
  patch: Record<string, unknown>;
  filters: { column: string; operator: string; value: unknown }[];
  selectColumns: string | undefined;
}

const upsertCalls: CapturedUpsert[] = [];
const updateCalls: CapturedUpdate[] = [];

const updateReturnMock = {
  // chainable filters
  eq(column: string, _value: unknown) {
    lastUpdate().filters.push({ column, operator: "eq", value: _value });
    return updateReturnMock;
  },
  filter(column: string, operator: string, value: unknown) {
    lastUpdate().filters.push({ column, operator, value });
    return updateReturnMock;
  },
  select(columns: string) {
    lastUpdate().selectColumns = columns;
    // Final await returns { data, error }.
    return Promise.resolve({
      data: deactivatedRowsReturn,
      error: null as Error | null
    });
  }
};

// The data returned by the deactivated update's `.select()`.
// Tests can override this per-test to simulate the count of rows
// deactivated.
let deactivatedRowsReturn: unknown[] = [];

function lastUpdate(): CapturedUpdate {
  return updateCalls[updateCalls.length - 1];
}

const fromMock = vi.fn((table: string) => {
  if (table !== "justwatch_provider_catalog") {
    throw new Error(`unexpected table: ${table}`);
  }
  return {
    upsert(rows: unknown[], options?: { onConflict: string; ignoreDuplicates: boolean }) {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: null as Error | null });
    },
    update(patch: Record<string, unknown>) {
      updateCalls.push({ patch, filters: [], selectColumns: undefined });
      return updateReturnMock;
    }
  };
});

// Mock @supabase/supabase-js so createClient returns an object with
// `.from(...)`. We also stub env vars so the cache layer's
// `getServiceClient()` returns our mock client.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock })
}));

// Stub env vars so getServiceClient() doesn't bail with "missing
// env vars". The cache layer reads them via import.meta.env +
// process.env.
beforeEach(() => {
  upsertCalls.length = 0;
  updateCalls.length = 0;
  deactivatedRowsReturn = [];
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

// We use dynamic import + vi.resetModules so each test gets a fresh
// cache module (the service client is a module-level singleton).
async function importFreshHelper() {
  vi.resetModules();
  const mod = await import("../cache");
  return mod.saveSelectionToPublishedCatalog;
}

// ─── Helper to build a JustWatchPackage ──────────────────────────

function pkg(technicalName: string, clearName?: string) {
  return {
    id: `id-${technicalName}`,
    clearName: clearName ?? technicalName,
    shortName: technicalName.slice(0, 2).toUpperCase(),
    technicalName,
    icon: `/icon/${technicalName}`
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe("saveSelectionToPublishedCatalog", () => {
  it("upserts the selected providers with active = true", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    const selected = [pkg("netflix"), pkg("prime")];
    await saveSelectionToPublishedCatalog("IN", selected);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toHaveLength(2);
    // Each row should have active = true.
    for (const row of upsertCalls[0].rows as Array<Record<string, unknown>>) {
      expect(row.country).toBe("IN");
      expect(row.active).toBe(true);
      expect(row.published_at).toBeTruthy();
      expect(row.last_fetched_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    }
    // Upsert uses the (country, technical_name) conflict target.
    expect(upsertCalls[0].options?.onConflict).toBe("country,technical_name");
  });

  it("deactivates all OTHER rows for the same country (not.in filter)", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    const selected = [pkg("netflix"), pkg("prime")];
    // Simulate that 88 rows got deactivated.
    deactivatedRowsReturn = Array.from({ length: 88 }, (_, i) => ({
      technical_name: `other_${i}`
    }));
    const result = await saveSelectionToPublishedCatalog("IN", selected);

    expect(updateCalls).toHaveLength(1);
    const upd = updateCalls[0];
    expect(upd.patch.active).toBe(false);
    expect(upd.patch.updated_at).toBeTruthy();
    // Filters: country=IN AND technical_name not.in ("netflix","prime").
    expect(upd.filters).toContainEqual({
      column: "country",
      operator: "eq",
      value: "IN"
    });
    const notInFilter = upd.filters.find(
      (f) => f.column === "technical_name" && f.operator === "not.in"
    );
    expect(notInFilter).toBeTruthy();
    // The value is the raw PostgREST string `("netflix","prime")`.
    expect(notInFilter!.value).toContain('"netflix"');
    expect(notInFilter!.value).toContain('"prime"');
    expect(upd.selectColumns).toBe("technical_name");
    expect(result.published).toBe(2);
    expect(result.deactivated).toBe(88);
  });

  it("with an empty selection, deactivates ALL rows for the country (no not.in filter)", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    deactivatedRowsReturn = [{ technical_name: "netflix" }, { technical_name: "prime" }];
    const result = await saveSelectionToPublishedCatalog("IN", []);

    // No upsert (nothing to publish).
    expect(upsertCalls).toHaveLength(0);
    // One update that deactivates ALL rows for the country.
    expect(updateCalls).toHaveLength(1);
    const upd = updateCalls[0];
    expect(upd.patch.active).toBe(false);
    expect(upd.filters).toContainEqual({
      column: "country",
      operator: "eq",
      value: "IN"
    });
    // No not.in filter — the country filter alone scopes the update.
    const notInFilter = upd.filters.find(
      (f) => f.column === "technical_name" && f.operator === "not.in"
    );
    expect(notInFilter).toBeUndefined();
    expect(result.published).toBe(0);
    expect(result.deactivated).toBe(2);
  });

  it("country-isolated — the deactivate filter always includes country=XX (never a global update)", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    await saveSelectionToPublishedCatalog("US", [pkg("netflix")]);

    expect(updateCalls).toHaveLength(1);
    const countryFilter = updateCalls[0].filters.find(
      (f) => f.column === "country" && f.operator === "eq"
    );
    expect(countryFilter).toBeTruthy();
    expect(countryFilter!.value).toBe("US");
  });

  it("escapes literal double-quotes in technical names (PostgREST doubled-quote escape)", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    // A technicalName containing a literal " — PostgREST escapes
    // internal " as "" inside a quoted string.
    await saveSelectionToPublishedCatalog("IN", [pkg('weird"name')]);

    const notInFilter = updateCalls[0].filters.find(
      (f) => f.column === "technical_name" && f.operator === "not.in"
    );
    expect(notInFilter).toBeTruthy();
    // The value should contain `"weird""name"` (doubled " inside the
    // quotes).
    expect(notInFilter!.value).toContain('"weird""name"');
  });

  it("filters out malformed providers (missing technicalName or clearName) before upserting", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    const selected = [
      pkg("netflix"),
      { ...pkg(""), technicalName: "" }, // empty technicalName
      { ...pkg("bad"), clearName: "" } // empty clearName
    ];
    await saveSelectionToPublishedCatalog("IN", selected);

    // Only the valid "netflix" should be upserted.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toHaveLength(1);
    expect((upsertCalls[0].rows[0] as Record<string, unknown>).technical_name).toBe("netflix");
  });

  it("returns { published: 0, deactivated: 0 } if the service client is unavailable", async () => {
    // Remove env vars so getServiceClient() returns null.
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    const result = await saveSelectionToPublishedCatalog("IN", [pkg("netflix")]);
    expect(result).toEqual({ published: 0, deactivated: 0 });
    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("stamps published_at + last_fetched_at + updated_at to the same now() timestamp on upsert", async () => {
    const saveSelectionToPublishedCatalog = await importFreshHelper();
    await saveSelectionToPublishedCatalog("IN", [pkg("netflix")]);
    const row = upsertCalls[0].rows[0] as Record<string, unknown>;
    expect(row.published_at).toBe(row.last_fetched_at);
    expect(row.published_at).toBe(row.updated_at);
    // Should be a valid ISO timestamp.
    expect(() => new Date(row.published_at as string).getTime()).not.toThrow();
  });
});
