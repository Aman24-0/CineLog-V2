// src/features/details/DetailsModal/__tests__/useDetailsForm.test.ts
//
// Tests for the useDetailsForm hook — owns the inline edit-form state
// for the Details modal.
//
// Covers:
//   • Initial state (empty form when vaultItem is null)
//   • resetTo populates the form from a vaultItem
//   • resetTo rebuilds the rewatchDates array when its length is wrong
//   • setForm updates simple fields (status, rating, notes, watchDate)
//   • setForm('rewatchCount') resizes rewatchDates + keeps watchDate in sync
//   • setForm('rewatchDates') updates a specific index + watchDate at index 0
//   • setForm('seasonDates') updates per-season start/end
//   • setForm('seasonRewatchCount') resizes seasonRewatchDates
//   • setForm('seasonRewatchDates') updates a specific rewatch+season entry
//   • isDirty returns false on a fresh reset, true after any change
//   • isDirty returns false when vaultItem is null
//   • isEditing toggles between view + edit mode

import { describe, it, expect } from "vitest";
import { createRoot, createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import { useDetailsForm } from "../useDetailsForm";
import { makeMovie, makeTVSeries } from "~/__test-fixtures__/factories";

// Helper: run the hook inside a reactive root.
// IMPORTANT: Solid's createEffect (which useDetailsForm uses to sync the
// form to vaultItem) runs asynchronously. The cb is therefore async and
// we flush microtasks before invoking it.
async function withForm<T>(
  vaultItem: () => WatchlistItem | null,
  cb: (api: ReturnType<typeof useDetailsForm>) => T | Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = useDetailsForm(vaultItem);
        // Flush the createEffect that syncs the form to vaultItem.
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        const result = await cb(api);
        dispose();
        resolve(result);
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("useDetailsForm — initial state", () => {
  it("starts with default form values when vaultItem is null", async () => {
    const [vaultItem] = createSignal<WatchlistItem | null>(null);
    await withForm(vaultItem, async (api) => {
      expect(api.form().status).toBe("Planned");
      expect(api.form().rating).toBe("");
      expect(api.form().watchDate).toBe("");
      expect(api.form().notes).toBe("");
      expect(api.form().rewatchCount).toBe("0");
      expect(api.form().rewatchDates).toEqual([]);
      expect(api.form().seasonDates).toEqual({});
      expect(api.form().seasonRewatchCount).toBe("0");
      expect(api.form().seasonRewatchDates).toEqual([]);
      expect(api.isEditing()).toBe(false);
    });
  });

  it("isDirty=false when vaultItem is null", async () => {
    const [vaultItem] = createSignal<WatchlistItem | null>(null);
    await withForm(vaultItem, async (api) => {
      expect(api.isDirty()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// resetTo — populates form from a vaultItem
// ---------------------------------------------------------------------------

describe("useDetailsForm — resetTo", () => {
  it("populates the form from a movie vaultItem", async () => {
    const item = makeMovie({
      id: "1",
      status: "Watching",
      rating: 8,
      watchDate: "2026-01-15",
      notes: "Great film",
      rewatchCount: 2,
      rewatchDates: ["2026-01-15", "2026-02-15", "2026-03-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().status).toBe("Watching");
      expect(api.form().rating).toBe("8");
      expect(api.form().watchDate).toBe("2026-01-15");
      expect(api.form().notes).toBe("Great film");
      expect(api.form().rewatchCount).toBe("2");
      expect(api.form().rewatchDates).toHaveLength(3);
      expect(api.form().rewatchDates[0]).toBe("2026-01-15");
    });
  });

  it("rebuilds rewatchDates when length is wrong (pads with empty strings)", async () => {
    // rewatchCount=3 but rewatchDates has only 1 entry → pad to length 4.
    const item = makeMovie({
      id: "1",
      rewatchCount: 3,
      rewatchDates: ["2026-01-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().rewatchCount).toBe("3");
      expect(api.form().rewatchDates).toHaveLength(4); // count + 1
      expect(api.form().rewatchDates[0]).toBe("2026-01-15");
      expect(api.form().rewatchDates[1]).toBe("");
      expect(api.form().rewatchDates[2]).toBe("");
      expect(api.form().rewatchDates[3]).toBe("");
    });
  });

  it("truncates rewatchDates when length exceeds count+1", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 1,
      rewatchDates: ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().rewatchCount).toBe("1");
      expect(api.form().rewatchDates).toHaveLength(2); // count + 1
      expect(api.form().rewatchDates[0]).toBe("2026-01-15");
      expect(api.form().rewatchDates[1]).toBe("2026-02-15");
    });
  });

  it("builds rewatchDates from watchDate when rewatchDates is missing", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 1,
      watchDate: "2026-01-15",
      rewatchDates: undefined
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().rewatchDates).toHaveLength(2); // count + 1
      expect(api.form().rewatchDates[0]).toBe("2026-01-15");
      expect(api.form().rewatchDates[1]).toBe("");
    });
  });

  it("populates series per-season fields from a TV vaultItem", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonDates: { "1": { start: "2026-01-01", end: "2026-01-15" } },
      seasonRewatchCount: 1,
      seasonRewatchDates: [{ "1": { start: "2026-03-01", end: "2026-03-15" } }]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().seasonDates).toEqual({
        "1": { start: "2026-01-01", end: "2026-01-15" }
      });
      expect(api.form().seasonRewatchCount).toBe("1");
      expect(api.form().seasonRewatchDates).toHaveLength(1);
      expect(api.form().seasonRewatchDates[0]).toEqual({
        "1": { start: "2026-03-01", end: "2026-03-15" }
      });
    });
  });

  it("resizes seasonRewatchDates when length doesn't match seasonRewatchCount", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 3,
      seasonRewatchDates: [] // wrong length
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().seasonRewatchCount).toBe("3");
      expect(api.form().seasonRewatchDates).toHaveLength(3);
      // Each entry is an empty map.
      for (const entry of api.form().seasonRewatchDates) {
        expect(Object.keys(entry)).toHaveLength(0);
      }
    });
  });

  it("resets isEditing to false on resetTo", async () => {
    const item = makeMovie({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setIsEditing(true);
      expect(api.isEditing()).toBe(true);
      api.resetTo(item);
      expect(api.isEditing()).toBe(false);
    });
  });

  it("resets to defaults when resetTo(null) is called", async () => {
    const item = makeMovie({ id: "1", status: "Watching", rating: 8 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      // Verify initial populated state.
      expect(api.form().status).toBe("Watching");
      expect(api.form().rating).toBe("8");
      // Reset to null.
      api.resetTo(null);
      expect(api.form().status).toBe("Planned");
      expect(api.form().rating).toBe("");
      expect(api.form().rewatchCount).toBe("0");
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — simple string fields
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm (simple fields)", () => {
  it("updates status", async () => {
    const item = makeMovie({ id: "1", status: "Planned" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("status", "Watching");
      expect(api.form().status).toBe("Watching");
    });
  });

  it("updates rating (number stored as string)", async () => {
    const item = makeMovie({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rating", "8");
      expect(api.form().rating).toBe("8");
    });
  });

  it("updates notes", async () => {
    const item = makeMovie({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("notes", "Updated notes");
      expect(api.form().notes).toBe("Updated notes");
    });
  });

  it("updates watchDate", async () => {
    const item = makeMovie({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("watchDate", "2026-05-01");
      expect(api.form().watchDate).toBe("2026-05-01");
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — rewatchCount (resizes rewatchDates + keeps watchDate in sync)
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm('rewatchCount')", () => {
  it("increments rewatchCount and pushes an empty date string", async () => {
    const item = makeMovie({ id: "1", rewatchCount: 0, watchDate: "2026-01-15" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "1");
      expect(api.form().rewatchCount).toBe("1");
      expect(api.form().rewatchDates).toHaveLength(2); // count + 1
      expect(api.form().rewatchDates[1]).toBe("");
    });
  });

  it("decrements rewatchCount and pops the last date", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 2,
      rewatchDates: ["2026-01-15", "2026-02-15", "2026-03-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "1");
      expect(api.form().rewatchCount).toBe("1");
      expect(api.form().rewatchDates).toHaveLength(2);
      expect(api.form().rewatchDates[1]).toBe("2026-02-15");
    });
  });

  it("keeps watchDate in sync with rewatchDates[0]", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 0,
      watchDate: "2026-01-15",
      rewatchDates: ["2026-01-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "2");
      expect(api.form().rewatchDates[0]).toBe("2026-01-15");
      expect(api.form().watchDate).toBe("2026-01-15");
    });
  });

  it("clamps negative values to 0", async () => {
    const item = makeMovie({ id: "1", rewatchCount: 1 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "-5");
      expect(api.form().rewatchCount).toBe("0");
      expect(api.form().rewatchDates).toHaveLength(1);
    });
  });

  it("treats NaN input as 0", async () => {
    const item = makeMovie({ id: "1", rewatchCount: 1 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "not-a-number");
      expect(api.form().rewatchCount).toBe("0");
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — rewatchDates (update a specific index)
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm('rewatchDates')", () => {
  it("updates the date at the given index", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 1,
      rewatchDates: ["2026-01-15", ""]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchDates", JSON.stringify({ index: 1, date: "2026-02-20" }));
      expect(api.form().rewatchDates[1]).toBe("2026-02-20");
    });
  });

  it("updates watchDate when index 0 is updated", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 0,
      watchDate: "2026-01-15",
      rewatchDates: ["2026-01-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchDates", JSON.stringify({ index: 0, date: "2026-05-01" }));
      expect(api.form().rewatchDates[0]).toBe("2026-05-01");
      expect(api.form().watchDate).toBe("2026-05-01");
    });
  });

  it("does NOT change watchDate when a non-zero index is updated", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 1,
      watchDate: "2026-01-15",
      rewatchDates: ["2026-01-15", ""]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchDates", JSON.stringify({ index: 1, date: "2026-02-20" }));
      expect(api.form().watchDate).toBe("2026-01-15"); // unchanged
    });
  });

  it("pads the array if the index is beyond the current length", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 0,
      rewatchDates: [""]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchDates", JSON.stringify({ index: 3, date: "2026-04-01" }));
      expect(api.form().rewatchDates).toHaveLength(4);
      expect(api.form().rewatchDates[3]).toBe("2026-04-01");
    });
  });

  it("silently ignores invalid JSON payloads", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 0,
      rewatchDates: ["2026-01-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      const before = api.form().rewatchDates;
      api.setForm("rewatchDates", "not valid json");
      expect(api.form().rewatchDates).toBe(before); // unchanged
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — seasonDates (per-season start/end for the original watch)
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm('seasonDates')", () => {
  it("sets the start date for a season", async () => {
    const item = makeTVSeries({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonDates",
        JSON.stringify({ season: "1", field: "start", date: "2026-01-01" })
      );
      expect(api.form().seasonDates["1"].start).toBe("2026-01-01");
    });
  });

  it("sets the end date for a season without losing the start date", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonDates: { "1": { start: "2026-01-01", end: "" } }
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonDates",
        JSON.stringify({ season: "1", field: "end", date: "2026-01-15" })
      );
      expect(api.form().seasonDates["1"].start).toBe("2026-01-01");
      expect(api.form().seasonDates["1"].end).toBe("2026-01-15");
    });
  });

  it("creates the season entry if it doesn't exist", async () => {
    const item = makeTVSeries({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonDates",
        JSON.stringify({ season: "5", field: "start", date: "2026-06-01" })
      );
      expect(api.form().seasonDates["5"]).toEqual({
        start: "2026-06-01",
        end: ""
      });
    });
  });

  it("silently ignores invalid JSON payloads", async () => {
    const item = makeTVSeries({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonDates", "not valid json");
      expect(Object.keys(api.form().seasonDates)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — seasonRewatchCount
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm('seasonRewatchCount')", () => {
  it("increments seasonRewatchCount and pushes an empty map", async () => {
    const item = makeTVSeries({ id: "1", seasonRewatchCount: 0 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonRewatchCount", "2");
      expect(api.form().seasonRewatchCount).toBe("2");
      expect(api.form().seasonRewatchDates).toHaveLength(2);
      expect(Object.keys(api.form().seasonRewatchDates[0])).toHaveLength(0);
    });
  });

  it("decrements seasonRewatchCount and pops the last map", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 2,
      seasonRewatchDates: [
        { "1": { start: "2026-01-01", end: "2026-01-15" } },
        { "1": { start: "2026-02-01", end: "2026-02-15" } }
      ]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonRewatchCount", "1");
      expect(api.form().seasonRewatchCount).toBe("1");
      expect(api.form().seasonRewatchDates).toHaveLength(1);
      expect(api.form().seasonRewatchDates[0]["1"].start).toBe("2026-01-01");
    });
  });

  it("clamps negative values to 0", async () => {
    const item = makeTVSeries({ id: "1", seasonRewatchCount: 1 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonRewatchCount", "-3");
      expect(api.form().seasonRewatchCount).toBe("0");
      expect(api.form().seasonRewatchDates).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// setForm — seasonRewatchDates (per-rewatch per-season start/end)
// ---------------------------------------------------------------------------

describe("useDetailsForm — setForm('seasonRewatchDates')", () => {
  it("updates the start date for a season in a specific rewatch pass", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 1,
      seasonRewatchDates: [{}]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonRewatchDates",
        JSON.stringify({
          rewatchIndex: 0,
          season: "2",
          field: "start",
          date: "2026-04-01"
        })
      );
      expect(api.form().seasonRewatchDates[0]["2"].start).toBe("2026-04-01");
    });
  });

  it("updates the end date without losing the start date", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 1,
      seasonRewatchDates: [{ "2": { start: "2026-04-01", end: "" } }]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonRewatchDates",
        JSON.stringify({
          rewatchIndex: 0,
          season: "2",
          field: "end",
          date: "2026-04-15"
        })
      );
      expect(api.form().seasonRewatchDates[0]["2"].start).toBe("2026-04-01");
      expect(api.form().seasonRewatchDates[0]["2"].end).toBe("2026-04-15");
    });
  });

  it("pads the array if rewatchIndex is beyond the current length", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 0,
      seasonRewatchDates: []
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonRewatchDates",
        JSON.stringify({
          rewatchIndex: 2,
          season: "1",
          field: "start",
          date: "2026-05-01"
        })
      );
      expect(api.form().seasonRewatchDates).toHaveLength(3);
      expect(api.form().seasonRewatchDates[2]["1"].start).toBe("2026-05-01");
    });
  });

  it("silently ignores invalid JSON payloads", async () => {
    const item = makeTVSeries({
      id: "1",
      seasonRewatchCount: 1,
      seasonRewatchDates: [{}]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonRewatchDates", "not valid json");
      // Unchanged.
      expect(api.form().seasonRewatchDates).toEqual([{}]);
    });
  });
});

// ---------------------------------------------------------------------------
// isDirty
// ---------------------------------------------------------------------------

describe("useDetailsForm — isDirty", () => {
  it("returns false immediately after resetTo", async () => {
    const item = makeMovie({
      id: "1",
      status: "Watching",
      rating: 8,
      notes: "x",
      rewatchCount: 1,
      rewatchDates: ["2026-01-15", "2026-02-15"]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.isDirty()).toBe(false);
    });
  });

  it("returns true after status is changed", async () => {
    const item = makeMovie({ id: "1", status: "Planned" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("status", "Watching");
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns true after rating is changed", async () => {
    const item = makeMovie({ id: "1", rating: 5 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rating", "8");
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns false when rating is changed to the same value", async () => {
    // Provide rewatchDates that match the form's default shape (count=0
    // → form.rewatchDates = [""]) so isDirty isn't tripped by the
    // rewatchDates length mismatch.
    const item = makeMovie({ id: "1", rating: 8, rewatchCount: 0, rewatchDates: [""] });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rating", "8");
      expect(api.isDirty()).toBe(false);
    });
  });

  it("returns true after notes are changed", async () => {
    const item = makeMovie({ id: "1", notes: "old" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("notes", "new");
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns true after rewatchCount is changed", async () => {
    const item = makeMovie({ id: "1", rewatchCount: 0 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchCount", "1");
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns true after a rewatchDate is changed", async () => {
    const item = makeMovie({
      id: "1",
      rewatchCount: 1,
      rewatchDates: ["2026-01-15", ""]
    });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("rewatchDates", JSON.stringify({ index: 1, date: "2026-02-15" }));
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns true after seasonDates are changed", async () => {
    const item = makeTVSeries({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm(
        "seasonDates",
        JSON.stringify({ season: "1", field: "start", date: "2026-01-01" })
      );
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns true after seasonRewatchCount is changed", async () => {
    const item = makeTVSeries({ id: "1", seasonRewatchCount: 0 });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      api.setForm("seasonRewatchCount", "1");
      expect(api.isDirty()).toBe(true);
    });
  });

  it("returns false when vaultItem is null", async () => {
    const [vaultItem] = createSignal<WatchlistItem | null>(null);

    await withForm(vaultItem, async (api) => {
      api.setForm("status", "Watching");
      expect(api.isDirty()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isEditing
// ---------------------------------------------------------------------------

describe("useDetailsForm — isEditing", () => {
  it("starts false", async () => {
    const [vaultItem] = createSignal<WatchlistItem | null>(null);
    await withForm(vaultItem, async (api) => {
      expect(api.isEditing()).toBe(false);
    });
  });

  it("toggles to true via setIsEditing", async () => {
    const [vaultItem] = createSignal<WatchlistItem | null>(null);
    await withForm(vaultItem, async (api) => {
      api.setIsEditing(true);
      expect(api.isEditing()).toBe(true);
    });
  });

  it("is reset to false on resetTo", async () => {
    const item = makeMovie({ id: "1" });
    const [vaultItem] = createSignal<WatchlistItem | null>(item);
    await withForm(vaultItem, async (api) => {
      api.setIsEditing(true);
      api.resetTo(item);
      expect(api.isEditing()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Reactive sync — form follows vaultItem changes
// ---------------------------------------------------------------------------

describe("useDetailsForm — reactive sync", () => {
  it("re-syncs the form when vaultItem changes", async () => {
    const item1 = makeMovie({ id: "1", status: "Planned" });
    const item2 = makeMovie({ id: "2", status: "Watching", rating: 9 });
    const [vaultItem, setVaultItem] = createSignal<WatchlistItem | null>(item1);

    await withForm(vaultItem, async (api) => {
      expect(api.form().status).toBe("Planned");
      setVaultItem(item2);
      expect(api.form().status).toBe("Watching");
      expect(api.form().rating).toBe("9");
    });
  });

  it("re-syncs to defaults when vaultItem becomes null", async () => {
    const item = makeMovie({ id: "1", status: "Watching", rating: 8 });
    const [vaultItem, setVaultItem] = createSignal<WatchlistItem | null>(item);

    await withForm(vaultItem, async (api) => {
      expect(api.form().status).toBe("Watching");
      setVaultItem(null);
      expect(api.form().status).toBe("Planned");
      expect(api.form().rating).toBe("");
    });
  });
});
