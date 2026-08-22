// src/lib/supabase/repositories/externalIds.ts
//
// Read-only accessors for identifiers persisted in `external_ids`.
// External identifiers are deliberately kept distinct from CineLog's vault UUID
// so exports can use only IDs recognized by the destination service.

import { getClient, toError, type TypedSupabaseClient } from "./shared";

export type SupportedExternalIdProvider = "imdb" | "trakt" | "tvdb";

export type ExternalIdSet = Partial<
  Record<SupportedExternalIdProvider, string>
>;

export type ExternalIdsByVaultId = Map<string, ExternalIdSet>;

function isSupportedProvider(
  provider: string
): provider is SupportedExternalIdProvider {
  return provider === "imdb" || provider === "trakt" || provider === "tvdb";
}

/**
 * Fetch supported external identifiers for a batch of vault UUIDs.
 *
 * The table is protected by RLS, so callers only receive identifiers for vault
 * items readable by the currently authenticated user. Unknown providers are
 * intentionally ignored here because they are not accepted by Trakt CSV.
 */
export async function getExternalIdsByVaultIds(
  vaultIds: readonly string[],
  supabase: TypedSupabaseClient = getClient()
): Promise<{ data: ExternalIdsByVaultId; error: Error | null }> {
  const ids = [...new Set(vaultIds.filter(Boolean))];
  if (ids.length === 0) return { data: new Map(), error: null };

  // PostgREST serializes `.in()` values in the request URL. Keep batches well
  // below common URL limits so libraries with thousands of titles retain their
  // imported identifiers instead of silently losing that export coverage.
  const queryBatches = Array.from(
    { length: Math.ceil(ids.length / 100) },
    (_, index) => ids.slice(index * 100, index * 100 + 100)
  );
  const results = await Promise.all(
    queryBatches.map((batch) =>
      supabase
        .from("external_ids")
        .select("vault_id, provider, external_id")
        .in("vault_id", batch)
    )
  );

  const byVaultId: ExternalIdsByVaultId = new Map();
  for (const { data, error } of results) {
    if (error) return { data: new Map(), error: toError(error) };

    for (const row of data ?? []) {
      if (!isSupportedProvider(row.provider)) continue;

      const externalId = row.external_id.trim();
      if (!externalId) continue;

      const current = byVaultId.get(row.vault_id) ?? {};
      current[row.provider] = externalId;
      byVaultId.set(row.vault_id, current);
    }
  }

  return { data: byVaultId, error: null };
}
