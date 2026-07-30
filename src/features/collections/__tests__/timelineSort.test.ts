// src/features/collections/__tests__/timelineSort.test.ts
import { describe, it, expect } from "vitest";
import {
  sortAndEnrich,
  groupByPhase,
  groupByStoryYear,
  type TimelineItem
} from "../components/timelineSort";
import {
  makeCollectionEntry,
  makeMovie,
  makeTVSeries
} from "~/__test-fixtures__/factories";
import type { CollectionEntry } from "~/shared/types";

describe("sortAndEnrich", () => {
  const entries: CollectionEntry[] = [
    makeCollectionEntry({ id: "1", release_date: "2023-06-15", order: 2 }),
    makeCollectionEntry({ id: "2", release_date: "2020-01-01", order: 1 }),
    makeCollectionEntry({ id: "3", release_date: "2021-03-10", order: 3 })
  ];

  it("sorts by release order (release_date ascending)", () => {
    const result = sortAndEnrich(entries, [], "release");
    expect(result.map((r) => r.entry.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by chronological order (curated order field)", () => {
    const result = sortAndEnrich(entries, [], "chronological");
    expect(result.map((r) => r.entry.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts by saga order (phase then order)", () => {
    const sagaEntries: CollectionEntry[] = [
      makeCollectionEntry({ id: "1", phase: "Phase 2", order: 1 }),
      makeCollectionEntry({ id: "2", phase: "Phase 1", order: 2 }),
      makeCollectionEntry({ id: "3", phase: "Phase 1", order: 1 })
    ];
    const result = sortAndEnrich(sagaEntries, [], "saga");
    expect(result.map((r) => r.entry.id)).toEqual(["3", "2", "1"]);
  });

  it("sorts by story order (incidentYear then storyOrder fallback)", () => {
    // The Storyline sort uses `incidentYear` (the in-universe year of
    // incident set by the admin — e.g. 1943 for Captain America: The
    // First Avenger, 1995 for Captain Marvel). Lower year = earlier.
    const storyEntries: CollectionEntry[] = [
      makeCollectionEntry({ id: "1", incidentYear: 1943, order: 1 }),
      makeCollectionEntry({ id: "2", incidentYear: 2008, order: 1 }),
      makeCollectionEntry({ id: "3", incidentYear: 1990, order: 1 })
    ];
    const result = sortAndEnrich(storyEntries, [], "story");
    expect(result.map((r) => r.entry.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by story order falls back to storyOrder when incidentYear missing", () => {
    // Entries without an incidentYear sink to the bottom and are sorted
    // by storyOrder (legacy DB column) as fallback.
    const storyEntries: CollectionEntry[] = [
      makeCollectionEntry({
        id: "1",
        incidentYear: undefined,
        storyOrder: 5,
        order: 5
      }),
      makeCollectionEntry({
        id: "2",
        incidentYear: 1995,
        storyOrder: 1,
        order: 1
      }),
      makeCollectionEntry({
        id: "3",
        incidentYear: undefined,
        storyOrder: 2,
        order: 2
      })
    ];
    const result = sortAndEnrich(storyEntries, [], "story");
    // id:2 (1995) comes first; id:1 and id:3 have no incidentYear so they
    // fall back to storyOrder — id:3 (storyOrder=2) before id:1 (storyOrder=5).
    expect(result.map((r) => r.entry.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by custom order (pinned first, then customOrder)", () => {
    const customEntries: CollectionEntry[] = [
      makeCollectionEntry({ id: "1", customOrder: 1, isPinned: false }),
      makeCollectionEntry({ id: "2", customOrder: 0, isPinned: true }),
      makeCollectionEntry({ id: "3", customOrder: 0, isPinned: false })
    ];
    const result = sortAndEnrich(customEntries, [], "custom");
    // Pinned first (id:2), then by customOrder (id:3 before id:1)
    expect(result.map((r) => r.entry.id)).toEqual(["2", "3", "1"]);
  });

  it("enriches with vault status (inVault, status, rating)", () => {
    const vault = [makeMovie({ id: "2", status: "Completed", rating: 9 })];
    const result = sortAndEnrich(entries, vault, "release");
    const item2 = result.find((r) => r.entry.id === "2");
    expect(item2?.inVault).toBe(true);
    expect(item2?.status).toBe("Completed");
    expect(item2?.rating).toBe(9);
    expect(item2?.vaultItem).not.toBeNull();
  });

  it("sets inVault=false for entries not in vault", () => {
    const result = sortAndEnrich(entries, [], "release");
    expect(result.every((r) => r.inVault === false)).toBe(true);
    expect(result.every((r) => r.vaultItem === null)).toBe(true);
  });

  it("matches vault entries by id + media_type (no cross-namespace collision)", () => {
    const entries2: CollectionEntry[] = [
      makeCollectionEntry({ id: "1398", media_type: "movie" }),
      makeCollectionEntry({ id: "1398", media_type: "tv" })
    ];
    const vault = [makeTVSeries({ id: "1398" })]; // only tv/1398 in vault
    const result = sortAndEnrich(entries2, vault, "release");
    const movie = result.find((r) => r.entry.media_type === "movie");
    const tv = result.find((r) => r.entry.media_type === "tv");
    expect(movie?.inVault).toBe(false);
    expect(tv?.inVault).toBe(true);
  });

  it("uses order ?? 0 when order is undefined (chronological)", () => {
    const entries2: CollectionEntry[] = [
      makeCollectionEntry({ id: "1", order: undefined }),
      makeCollectionEntry({ id: "2", order: undefined })
    ];
    const result = sortAndEnrich(entries2, [], "chronological");
    expect(result).toHaveLength(2);
  });

  it("handles entries without release_date (treated as empty string)", () => {
    const entries2: CollectionEntry[] = [
      makeCollectionEntry({ id: "1", release_date: undefined }),
      makeCollectionEntry({ id: "2", release_date: "2020-01-01" })
    ];
    const result = sortAndEnrich(entries2, [], "release");
    // Empty string sorts before any date
    expect(result[0].entry.id).toBe("1");
  });
});

describe("groupByPhase", () => {
  it("returns null when order is not 'saga'", () => {
    const items: TimelineItem[] = [];
    expect(groupByPhase(items, "release")).toBeNull();
    expect(groupByPhase(items, "chronological")).toBeNull();
    expect(groupByPhase(items, "story")).toBeNull();
    expect(groupByPhase(items, "custom")).toBeNull();
  });

  it("groups items by phase (input must be pre-sorted by phase)", () => {
    // groupByPhase creates a new group each time the phase changes,
    // so input must be pre-sorted (sortAndEnrich handles this in prod).
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ phase: "Phase 1" }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      },
      {
        entry: makeCollectionEntry({ phase: "Phase 1" }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      },
      {
        entry: makeCollectionEntry({ phase: "Phase 2" }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByPhase(items, "saga");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].phase).toBe("Phase 1");
    expect(result![0].items).toHaveLength(2);
    expect(result![1].phase).toBe("Phase 2");
    expect(result![1].items).toHaveLength(1);
  });

  it("groups items with undefined phase as 'Other'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ phase: undefined }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByPhase(items, "saga");
    expect(result![0].phase).toBe("Other");
  });
});

describe("groupByStoryYear", () => {
  it("returns null when order is not 'story'", () => {
    const items: TimelineItem[] = [];
    expect(groupByStoryYear(items, "release")).toBeNull();
    expect(groupByStoryYear(items, "saga")).toBeNull();
  });

  it("groups by positive year > 1800 as plain number (input pre-sorted)", () => {
    // groupByStoryYear creates a new group each time the year changes,
    // so input must be pre-sorted (sortAndEnrich handles this in prod).
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: 2008 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      },
      {
        entry: makeCollectionEntry({ storyYear: 2008 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      },
      {
        entry: makeCollectionEntry({ storyYear: 2012 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].yearLabel).toBe("2008");
    expect(result![0].items).toHaveLength(2);
    expect(result![1].yearLabel).toBe("2012");
  });

  it("labels negative storyYear as 'BBY'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: -100 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result![0].yearLabel).toBe("100 BBY");
  });

  it("labels storyYear=0 as '0 BBY / ABY'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: 0 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result![0].yearLabel).toBe("0 BBY / ABY");
  });

  it("labels small positive year (<=1800) as 'ABY'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: 500 }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result![0].yearLabel).toBe("500 ABY");
  });

  it("labels undefined storyYear as 'Unknown'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: undefined }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result![0].yearLabel).toBe("Unknown");
  });

  it("labels null storyYear as 'Unknown'", () => {
    const items: TimelineItem[] = [
      {
        entry: makeCollectionEntry({ storyYear: null as unknown as undefined }),
        vaultItem: null,
        inVault: false,
        status: null,
        rating: null
      }
    ];
    const result = groupByStoryYear(items, "story");
    expect(result![0].yearLabel).toBe("Unknown");
  });
});
