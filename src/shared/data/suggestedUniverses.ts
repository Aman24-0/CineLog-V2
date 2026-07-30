// src/shared/data/suggestedUniverses.ts
/**
 * Suggested Universes — universes not yet added by the user.
 *
 * These appear as suggestion cards on the Collections page.
 * Users can Add, Hide, Pin, or Remove them.
 *
 * The list is curated to show the most popular cinematic universes
 * that aren't in the default curated set.
 */

export interface SuggestedUniverse {
  id: string;
  name: string;
  description: string;
  backdrop_path: string | null;
  poster_path?: string | null;
  franchiseId: string;
  tmdbCollectionId?: number;
  keywords: string[];
  entryCount: number;
}

export const SUGGESTED_UNIVERSES: SuggestedUniverse[] = [
  {
    id: "monsterverse",
    name: "MonsterVerse",
    description:
      "Godzilla, King Kong, and the Titans clash in Legendary's MonsterVerse.",
    backdrop_path: "/sy6DvAuB89M2Sp5lOJPOpOdc7Q2.jpg",
    franchiseId: "horror",
    tmdbCollectionId: 578261,
    keywords: ["godzilla", "kong", "monsterverse", "skull island"],
    entryCount: 5
  },
  {
    id: "conjuring",
    name: "The Conjuring Universe",
    description:
      "Ed and Lorraine Warren's terrifying investigations and the connected horror saga.",
    backdrop_path: "/wVYREi6Mg0Zmh0gijMOg1kTchvQ.jpg",
    franchiseId: "horror",
    tmdbCollectionId: 313086,
    keywords: ["conjuring", "annabelle", "nun", "valak"],
    entryCount: 8
  },
  {
    id: "mission-impossible",
    name: "Mission: Impossible",
    description:
      "Ethan Hunt's impossible missions across decades of action-packed espionage.",
    backdrop_path: "/h1mdalOmOWy8Ek0Zbm4e5bWrOn9.jpg",
    franchiseId: "spy-thriller",
    tmdbCollectionId: 537,
    keywords: ["mission impossible", "ethan hunt"],
    entryCount: 8
  },
  {
    id: "dune",
    name: "Dune",
    description:
      "Denis Villeneuve's epic adaptation of Frank Herbert's sci-fi masterwork.",
    backdrop_path: "/jYEW5xZgZG2e3T5m6Y0Y0g0X0Y0.jpg",
    franchiseId: "sci-fi-saga",
    tmdbCollectionId: 886484,
    keywords: ["dune", "arrakis", "paul atreides"],
    entryCount: 2
  },
  {
    id: "the-matrix",
    name: "The Matrix",
    description: "The iconic sci-fi saga that redefined action cinema.",
    backdrop_path: "/f8U2LM8S0m3k0O3i8Q0j0g0X0Y0.jpg",
    franchiseId: "sci-fi-saga",
    tmdbCollectionId: 2344,
    keywords: ["matrix", "neo", "trinity"],
    entryCount: 4
  },
  {
    id: "avatar",
    name: "Avatar",
    description: "James Cameron's groundbreaking visual odyssey on Pandora.",
    backdrop_path: "/s16H6tpK2ut74D3Dh1TI9n9UAO0.jpg",
    franchiseId: "sci-fi-saga",
    tmdbCollectionId: 858363,
    keywords: ["avatar", "pandora", "way of water"],
    entryCount: 2
  },
  {
    id: "indiana-jones",
    name: "Indiana Jones",
    description:
      "Harrison Ford's legendary archaeologist in five thrilling adventures.",
    backdrop_path: null,
    franchiseId: "adventure",
    tmdbCollectionId: 84,
    keywords: ["indiana jones", "raiders"],
    entryCount: 5
  },
  {
    id: "jurassic-park",
    name: "Jurassic Park",
    description:
      "The complete Jurassic saga — from Spielberg's original to the World trilogy.",
    backdrop_path: "/oQiKQsYUdV8sLpR2lR2k0W0X0Y0.jpg",
    franchiseId: "adventure",
    tmdbCollectionId: 328,
    keywords: ["jurassic park", "jurassic world", "dinosaurs"],
    entryCount: 6
  },
  {
    id: "fast-furious",
    name: "Fast & Furious",
    description:
      "From street racing to international espionage — the family rides together.",
    backdrop_path: "/3X5XIh0jY0g0X0Y0Z0W0V0U0T0.jpg",
    franchiseId: "fast-saga",
    tmdbCollectionId: 948485,
    keywords: ["fast and furious", "fast & furious", "furious"],
    entryCount: 10
  },
  {
    id: "pirates-caribbean",
    name: "Pirates of the Caribbean",
    description:
      "Captain Jack Sparrow's swashbuckling adventures across the high seas.",
    backdrop_path: "/bOGOGOGO0X0Y0Z0W0V0U0T0S0R0.jpg",
    franchiseId: "adventure",
    tmdbCollectionId: 295,
    keywords: ["pirates of the caribbean", "jack sparrow"],
    entryCount: 5
  },
  {
    id: "transformers",
    name: "Transformers",
    description:
      "Autobots and Decepticons wage war on Earth in Michael Bay's explosive saga.",
    backdrop_path: null,
    franchiseId: "adventure",
    tmdbCollectionId: 86038,
    keywords: ["transformers", "optimus prime", "autobots"],
    entryCount: 7
  },
  {
    id: "planet-of-the-apes",
    name: "Planet of the Apes",
    description:
      "The rebooted simian saga — from Rise to Kingdom of the Planet of the Apes.",
    backdrop_path: null,
    franchiseId: "sci-fi-saga",
    tmdbCollectionId: 173855,
    keywords: ["planet of the apes", "caesar"],
    entryCount: 4
  }
];
