// Quick verification script for share utilities
// Run with: npx tsx scripts/verify_share.ts

import {
  buildShareUrl,
  resolveTitle,
  formatReleaseDate,
  formatRating,
  truncateOverview,
  buildShareText,
  sanitizeFilename,
  getBaseUrl,
} from "../src/shared/utils/share";
import type { TMDBDetails } from "../src/shared/types";

const baseUrl = getBaseUrl();
console.log("Base URL:", baseUrl);
console.log("Movie URL:", buildShareUrl("movie", 3392));
console.log("TV URL:", buildShareUrl("tv", 46298));

const sampleDetails: TMDBDetails = {
  id: 3392,
  title: "Dolittle",
  overview:
    "A physician who can talk to animals embarks on an adventure to find a legendary island with a young apprentice and a crew of strange pets.",
  release_date: "2020-01-01",
  vote_average: 6.2,
  genres: [
    { id: 12, name: "Adventure" },
    { id: 35, name: "Comedy" },
    { id: 10751, name: "Family" },
  ],
  media_type: "movie",
};

console.log("\nMovie share text:");
console.log(buildShareText(sampleDetails, "movie", 3392));

const sampleSeries: TMDBDetails = {
  id: 46298,
  name: "Dark",
  overview:
    "A missing child causes four families to help each other for answers. What they could not imagine is that this mystery would be connected to innumerable other secrets of the small town.",
  first_air_date: "2017-12-01",
  vote_average: 8.7,
  number_of_seasons: 3,
  number_of_episodes: 26,
  genres: [
    { id: 18, name: "Crime" },
    { id: 18, name: "Drama" },
    { id: 10765, name: "Sci-Fi & Fantasy" },
  ],
  media_type: "tv",
};

console.log("\nTV share text:");
console.log(buildShareText(sampleSeries, "tv", 46298));

console.log("\nSanitize filename:", sanitizeFilename("Dolittle: A Strange/Adventure*"));
console.log("Format rating 0:", formatRating(0));
console.log("Format rating 7.5:", formatRating(7.5));
console.log("Format rating null:", formatRating(null));
console.log("Truncate overview:", truncateOverview("Lorem ipsum dolor sit amet ".repeat(20), 100));
console.log("Resolve title (movie):", resolveTitle(sampleDetails));
console.log("Resolve title (tv):", resolveTitle(sampleSeries));
console.log("Format release date:", formatReleaseDate("2025-07-18"));
console.log("Format invalid date:", formatReleaseDate("garbage"));
