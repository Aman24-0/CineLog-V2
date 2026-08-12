// Full end-to-end POC: resolver + all sources (no Supabase cache).
// Run with: TMDB_API_KEY=xxx node /tmp/full-poc.mjs
//
// Without TMDB_API_KEY, the resolver will skip the TMDB translations
// source (returns success:false with "TMDB_API_KEY not configured")
// and the original-languages list will be empty. JustWatch will still
// return its data, so dubbedLanguages will equal detectedAudioLanguages
// (no original-language subtraction possible).

import { resolveAudioLanguages } from "../src/server/audio-language/resolver.ts";
import { JustWatchSource } from "../src/server/audio-language/sources/justwatch.ts";
import { TmdbTranslationsSource } from "../src/server/audio-language/sources/tmdb-translations.ts";

const sources = [new JustWatchSource(), new TmdbTranslationsSource()];

const TEST_CASES = [
  { title: "Midsommar", tmdbId: 530385, type: "movie" },
  { title: "Avengers: Endgame", tmdbId: 299534, type: "movie" },
  { title: "Frozen II", tmdbId: 330457, type: "movie" },
  { title: "Inception", tmdbId: 27205, type: "movie" },
  { title: "3 Idiots", tmdbId: 20453, type: "movie" },
  { title: "Baahubali 2", tmdbId: 370826, type: "movie" },
  { title: "Sintel", tmdbId: 45421, type: "movie" }
];

console.log("=".repeat(72));
console.log("FULL WORKER POC — resolver + all sources");
console.log(`TMDB_API_KEY: ${process.env.TMDB_API_KEY ? "set" : "(not set — TMDB source will fail)"}`);
console.log(`Sources: ${sources.map((s) => s.name).join(", ")}`);
console.log("=".repeat(72));

for (const tc of TEST_CASES) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`TEST: ${tc.title} (${tc.type}/${tc.tmdbId})`);
  console.log("-".repeat(72));

  // Pass the title as a hint via the resolver — but the resolver's
  // TMDB fetch will return the actual title for the source adapter.
  // For POC purposes when no TMDB_API_KEY, we patch the input by
  // calling resolveAudioLanguages with the imdbId arg undefined.
  // To make the JustWatch source findable without TMDB, we manually
  // construct the source input — but the resolver doesn't expose
  // that hook. Instead, we run the JustWatch source directly for
  // POC + the resolver separately (which will show TMDB translations
  // if a key is set).

  const result = await resolveAudioLanguages(sources, tc.tmdbId, tc.type, {
    region: "IN"
  });

  console.log(`  Status:           ${result.status}`);
  console.log(`  IMDb ID:          ${result.imdbId ?? "(unresolved)"}`);
  console.log(
    `  Original/spoken:  ${result.originalLanguages.map((l) => `${l.code} (${l.name})`).join(", ") || "(none — TMDB_API_KEY missing or no spoken_languages)"}`
  );
  console.log(
    `  Detected audio:   ${result.detectedAudioLanguages.map((l) => `${l.code}(${l.confidence[0]})`).join(", ") || "(none)"}`
  );
  console.log(
    `  Final dubbed:     ${result.dubbedLanguages.map((l) => `${l.code} (${l.name}, ${l.confidence}, [${l.sources.join(",")}])`).join(", ") || "(none)"}`
  );
  console.log(`  Sources:`);
  for (const sr of result.sources) {
    const langs = sr.languages.map((l) => l.code ?? l.raw).join(",") || "(none)";
    console.log(
      `    - ${sr.source}: ${sr.success ? (sr.noData ? "noData" : "ok") : "ERROR"} | ${langs}` +
        (sr.error ? ` | ${sr.error}` : "")
    );
  }
}

console.log(`\n${"=".repeat(72)}`);
console.log("POC COMPLETE");
console.log("=".repeat(72));
