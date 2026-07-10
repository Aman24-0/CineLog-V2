// src/__test-fixtures__/mockSupabase.ts
//
// Mock Supabase client factory for repository tests.
//
// The repositories use a builder-style query API:
//   supabase.from(table).select().eq("col", val).is("col", null).maybeSingle()
//
// Each chain method returns the same builder, so we build a single mock
// object with all chainable methods. The final `.maybeSingle()` or
// awaited query resolves to `{ data, error }`.

import { vi } from "vitest";

export interface MockQueryBuilder {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
}

export interface MockSupabaseOptions {
  /** The data to return from a list query (`.from().select()` without .single). */
  listData?: unknown[];
  /** The data to return from a `.single()` query (insert/update/delete + select). */
  singleData?: unknown | null;
  /** The data to return from a `.maybeSingle()` query (get/getItem checks). Defaults to singleData. */
  maybeSingleData?: unknown | null;
  /** The error to return. */
  error?: Error | null;
}

/**
 * Create a mock Supabase client with a chainable query builder.
 *
 * Usage:
 *   const client = createMockSupabase({ listData: [row1, row2] });
 *   const repo = new VaultRepository(client);
 *   const result = await repo.getVaultByStatus("user-1", "watching");
 *   expect(result.data).toEqual([row1, row2]);
 */
export function createMockSupabase(options: MockSupabaseOptions = {}): {
  query: MockQueryBuilder;
  client: Record<string, unknown>;
} {
  const { listData = [], singleData = null, maybeSingleData, error = null } = options;
  // maybeSingleData defaults to singleData for backward compat
  const maybeData = maybeSingleData !== undefined ? maybeSingleData : singleData;

  // The "result" that awaiting the query produces.
  const listResult = { data: listData, error };
  const singleResult = { data: singleData, error };
  const maybeResult = { data: maybeData, error };

  // Build a self-referential query builder. Every chain method returns
  // `builder` (except .single/.maybeSingle which return a thenable that
  // resolves to singleResult, and the bare-await which resolves to listResult).
  const builder: Record<string, unknown> = {};

  // The builder itself is thenable — awaiting it (without .single) returns
  // the list result. This mirrors Supabase's PostgrestBuilder which is
  // a Promise-compatible object.
  builder.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(listResult).then(resolve),
  );
  builder.catch = vi.fn((_reject: (e: unknown) => unknown) =>
    Promise.resolve(listResult),
  );

  // Chain methods that return the builder
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.upsert = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.neq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.not = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.ilike = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.range = vi.fn(() => builder);

  // Terminal methods — return a NEW thenable that resolves to the single result
  builder.single = vi.fn(() => ({
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(singleResult).then(resolve),
    catch: () => Promise.resolve(singleResult),
  }));
  builder.maybeSingle = vi.fn(() => ({
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(maybeResult).then(resolve),
    catch: () => Promise.resolve(maybeResult),
  }));

  const client = {
    from: builder.from,
  };

  return { query: builder as unknown as MockQueryBuilder, client };
}

/**
 * Create a mock that returns an error.
 */
export function createMockSupabaseError(error: Error): {
  query: MockQueryBuilder;
  client: Record<string, unknown>;
} {
  return createMockSupabase({ error, listData: [], singleData: null });
}
