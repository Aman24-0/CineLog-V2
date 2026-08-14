// src/routes/api/ott/providers.ts
//
// CineLog V2 — JustWatch OTT API: Provider Catalog
// ---------------------------------------------------------------------
// Returns the JustWatch provider catalog for the caller's country.
//
// Endpoint:
//   GET /api/ott/providers
//
// Response (200):
//   {
//     "country": "IN",
//     "providers": [
//       {
//         "id": "cGF8...",
//         "clearName": "Netflix",
//         "shortName": "NF",
//         "technicalName": "netflix",
//         "icon": "/icon/4982/{profile}/{technicalName}.{format}"
//       },
//       ...
//     ]
//   }
//
// Behavior:
//   1. Resolve the caller's profile country via `resolveJustWatchCountry`.
//      Anonymous requests fall back to "US".
//   2. Call `getProviderCatalog(country)` — cache-first, falls back to a
//      live JustWatch `packages(country, platform: WEB)` fetch on cache
//      miss, never throws.
//   3. Return `{ country, providers }`. Empty catalog is returned as
//      `providers: []` (still 200) — the UI renders an empty state.
//
// Caching:
//   - Success: `public, max-age=300, s-maxage=600` (5 min browser,
//     10 min CDN). The underlying Supabase cache has a 48h TTL, so the
//     CDN cache is just an edge cache for repeated reads.
//   - Errors: same headers (the response is still 200 with empty
//     providers — caching that for 5 min is fine).
//
// Auth: optional. Anonymous callers get "US" country.

import { getProviderCatalog } from "~/server/justwatch/service";
import { resolveJustWatchCountry } from "~/server/justwatch/region";
import type { JustWatchPackage } from "~/shared/types/justwatch";

interface APIEvent {
  request: Request;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600",
  "Content-Type": "application/json"
};

export async function GET(event: APIEvent): Promise<Response> {
  try {
    const country = await resolveJustWatchCountry(event.request);

    let providers: JustWatchPackage[];
    try {
      providers = await getProviderCatalog(country);
    } catch (err) {
      console.warn(
        "[/api/ott/providers] getProviderCatalog threw:",
        err instanceof Error ? err.message : String(err)
      );
      providers = [];
    }

    return new Response(JSON.stringify({ country, providers }), {
      status: 200,
      headers: CACHE_HEADERS
    });
  } catch (err) {
    console.warn(
      "[/api/ott/providers] GET error:",
      err instanceof Error ? err.message : String(err)
    );
    return new Response(
      JSON.stringify({ country: "US", providers: [] }),
      { status: 200, headers: CACHE_HEADERS }
    );
  }
}
