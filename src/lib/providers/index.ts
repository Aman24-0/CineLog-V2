// src/lib/providers/index.ts
//
// Provider Plugin Architecture — Phase 11
// ---------------------------------------------------------------------
// Re-exports the MetadataProvider interface + ProviderRegistry and
// registers the built-in providers (AniList) on first import.
//
// TMDB and MDBList are NOT wrapped as MetadataProviders yet because
// their existing call sites are too numerous to refactor in one pass.
// The pattern is here for future migrations and for adding new
// providers (MAL, Kitsu, JustWatch) without touching consumers.

export * from "./BaseProvider";
export { AniListProvider } from "./AniListProvider";

import { providerRegistry } from "./BaseProvider";
import { AniListProvider } from "./AniListProvider";

// Register AniList once at module load. Idempotent — the registry
// dedupes by provider.id, so multiple imports don't double-register.
providerRegistry.register(AniListProvider);
