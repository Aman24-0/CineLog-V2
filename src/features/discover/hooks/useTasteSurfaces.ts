// src/features/discover/hooks/useTasteSurfaces.ts
import { createResource, createMemo, Accessor } from "solid-js";
import type {
  TasteProfile,
  WatchlistItem,
  TMDBTitle,
  TasteSurface
} from "~/shared/types";
import {
  discoverMovies,
  getRecommendations,
  searchMulti
} from "~/core/tmdb/discover";

/* Franchise keyword table — mirrored for the continue-franchise surface. */
const FRANCHISES: { name: string; keywords: string[] }[] = [
  { name: "Marvel Cinematic Universe", keywords: ["avengers", "iron man", "captain america", "thor", "black panther", "doctor strange", "spider-man", "guardians of the galaxy", "black widow", "hawkeye", "eternals", "shang-chi", "ant-man", "captain marvel"] },
  { name: "DC Extended Universe", keywords: ["batman", "superman", "wonder woman", "aquaman", "flash", "justice league", "suicide squad", "man of steel", "black adam", "shazam"] },
  { name: "Harry Potter", keywords: ["harry potter", "deathly hallows", "philosopher's stone", "chamber of secrets", "prisoner of azkaban", "goblet of fire", "order of the phoenix", "half-blood prince", "fantastic beasts"] },
  { name: "Mission Impossible", keywords: ["mission impossible"] },
  { name: "John Wick", keywords: ["john wick"] },
  { name: "Fast & Furious", keywords: ["fast and furious", "fast & furious", "furious", "tokyo drift"] },
  { name: "Star Wars", keywords: ["star wars", "empire strikes back", "return of the jedi", "force awakens", "last jedi", "rise of skywalker"] },
  { name: "Lord of the Rings", keywords: ["lord of the rings", "hobbit", "fellowship of the ring", "two towers", "return of the king"] }
];

interface UseTasteSurfacesArgs {
  taste: Accessor<TasteProfile>;
  vault: Accessor<WatchlistItem[]>;
}

/**
 * useTasteSurfaces — builds 0-3 vault-derived shelves for Fold 2.
 *
 * Each surface is framed as "Because you…" — never as a category:
 *   - because-you-loved     — recommendations from the user's highest-rated completed title
 *   - continue-franchise    — missing entries in an active franchise
 *   - directors-you-love    — films by a top director (via TMDB person search → discover)
 *
 * Empty surfaces are filtered out. The UI never shows empty shelves.
 *
 * Architecture: adding a 4th surface only requires adding a builder
 * function here and pushing it into the result. The TasteSurface
 * component renders any TasteSurface.
 */
export function useTasteSurfaces(args: UseTasteSurfacesArgs) {
  const tasteSig = createMemo(() => {
    const t = args.taste();
    return JSON.stringify({
      s: t.seedTitle?.id ?? null,
      f: t.activeFranchises.map((f) => f.name),
      d: t.topDirectors.map((d) => d.name)
    });
  });

  const vaultIds = createMemo(() => new Set(args.vault().map((m) => String(m.id))));

  const filterAndTake = (list: TMDBTitle[], count: number): TMDBTitle[] => {
    const inVault = vaultIds();
    return list
      .filter((t) => !inVault.has(String(t.id)) && (t.poster_path || t.backdrop_path))
      .slice(0, count);
  };

  const fetcher = async (): Promise<TasteSurface[]> => {
    const taste = args.taste();
    const out: TasteSurface[] = [];

    /* 1. because-you-loved — recommendations from seed title */
    if (taste.seedTitle) {
      try {
        const recs = await getRecommendations(taste.seedTitle.media_type, taste.seedTitle.id);
        const filtered = filterAndTake(recs, 8);
        if (filtered.length > 0) {
          const seedName = taste.seedTitle.title || taste.seedTitle.name || "a title you loved";
          const rating = taste.seedTitle.rating ?? 9;
          out.push({
            kind: "because-you-loved",
            intent: `Because you loved ${seedName}`,
            subtitle: `${filtered.length} titles in the same vein as your ${rating}/10`,
            icon: "favorite",
            items: filtered
          });
        }
      } catch (e) { /* skip */ }
    }

    /* 2. continue-franchise — missing entries in an active franchise */
    if (taste.activeFranchises.length > 0) {
      try {
        const franchise = taste.activeFranchises[0];
        const franchiseDef = FRANCHISES.find((f) => f.name === franchise.name);
        if (franchiseDef) {
          const ownedKeywords = new Set(
            args.vault()
              .filter((m) => {
                const t = (m.title || m.name || "").toLowerCase();
                return franchiseDef.keywords.some((k) => t.includes(k));
              })
              .map((m) => (m.title || m.name || "").toLowerCase())
          );
          const missingKeyword = franchiseDef.keywords.find(
            (k) => !ownedKeywords.has(k) && !Array.from(ownedKeywords).some((o) => o.includes(k))
          ) || franchiseDef.keywords[0];

          const results = await searchMulti(missingKeyword);
          const matched = results.filter((t) => {
            const name = (t.title || t.name || "").toLowerCase();
            return franchiseDef.keywords.some((k) => name.includes(k));
          });
          const filtered = filterAndTake(matched.length > 0 ? matched : results, 8);
          if (filtered.length > 0) {
            out.push({
              kind: "continue-franchise",
              intent: `Continue the ${franchise.name}`,
              subtitle: `${franchise.missing} entr${franchise.missing === 1 ? "y" : "ies"} missing from your vault`,
              icon: "account_tree",
              items: filtered
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    /* 3. directors-you-love — films by a top director (TMDB search) */
    if (taste.topDirectors.length > 0) {
      try {
        const director = taste.topDirectors[0];
        const results = await searchMulti(director.name);
        // Filter to movies only (people results already filtered out by searchMulti)
        const movies = results.filter((t) => t.media_type === "movie");
        const filtered = filterAndTake(movies, 8);
        if (filtered.length > 0) {
          out.push({
            kind: "directors-you-love",
            intent: `From ${director.name}, a director you love`,
            subtitle: `${filtered.length} films — you've loved ${director.count} of their titles`,
            icon: "person",
            items: filtered
          });
        }
      } catch (e) { /* skip */ }
    }

    return out;
  };

  const [surfaces] = createResource(tasteSig, fetcher);

  return { surfaces };
}
