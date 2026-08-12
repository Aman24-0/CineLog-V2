// POC test — exercises JustWatch source directly with known titles.
// Used to verify real audio-language data is retrieved BEFORE wiring
// up the full worker (which requires a TMDB API key for original-language
// resolution).
//
// Usage:  node /tmp/jw-poc.mjs
//
// This bypasses the resolver + TMDB + cache. It only tests the
// JustWatch source adapter end-to-end: search → offers → audioLanguages.

import { JustWatchSource } from "../src/server/audio-language/sources/justwatch.ts";

const source = new JustWatchSource();

const TEST_CASES = [
  { title: "Midsommar", type: "movie", tmdbId: 530385, expected: "English-only in IN" },
  { title: "Avengers: Endgame", type: "movie", tmdbId: 299534, expected: "Hindi/Tamil/Telugu dubs" },
  { title: "Frozen II", type: "movie", tmdbId: 330457, expected: "Hindi/Tamil/Telugu dubs" },
  { title: "Inception", type: "movie", tmdbId: 27205, expected: "Hindi/Tamil/Telugu dubs" },
  { title: "3 Idiots", type: "movie", tmdbId: 20453, expected: "Hindi original" },
  { title: "Baahubali 2", type: "movie", tmdbId: 370826, expected: "Telugu/Tamil/Hindi" },
  { title: "Money Heist", type: "tv", tmdbId: 71446, expected: "Hindi dubs on Netflix" },
  { title: "Stranger Things", type: "tv", tmdbId: 66732, expected: "Hindi dubs on Netflix" },
  { title: "Sintel", type: "movie", tmdbId: 45421, expected: "No data expected" }
];

console.log("=".repeat(72));
console.log("JUSTWATCH SOURCE — DIRECT POC TEST");
console.log("Region: IN | Platform: WEB");
console.log("=".repeat(72));

for (const tc of TEST_CASES) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`TEST: ${tc.title} (${tc.type}/${tc.tmdbId})`);
  console.log(`Expected: ${tc.expected}`);
  console.log("-".repeat(72));

  const result = await source.getAudioLanguages({
    tmdbId: tc.tmdbId,
    type: tc.type,
    region: "IN",
    title: tc.title
  });

  console.log(`  Source:     ${result.source}`);
  console.log(`  Success:    ${result.success}${result.noData ? " (noData)" : ""}`);
  if (result.error) console.log(`  Error:      ${result.error}`);
  console.log(`  Languages:  ${result.languages.map((l) => l.code ?? l.raw).join(", ") || "(none)"}`);
  console.log(`  Confidence: ${result.defaultConfidence ?? "medium"}`);
  console.log(`  CheckedAt:  ${result.checkedAt}`);
}

console.log(`\n${"=".repeat(72)}`);
console.log("POC COMPLETE");
console.log("=".repeat(72));
