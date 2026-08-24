import { describe, it, expect } from "vitest";
import { extractBackdropProfile } from "../colorExtractor";

describe("colorExtractor", () => {
  describe("extractBackdropProfile", () => {
    it("returns the neutral dark fallback for an empty URL", async () => {
      const result = await extractBackdropProfile("");
      expect(result).toEqual({
        palette: [],
        averageRgb: [24, 32, 44],
        luminance: 0.14,
        saturation: 0.12
      });
    });

    it("returns the same neutral fallback for whitespace-only URLs", async () => {
      const result = await extractBackdropProfile("   ");
      expect(result).toEqual({
        palette: [],
        averageRgb: [24, 32, 44],
        luminance: 0.14,
        saturation: 0.12
      });
    });
  });
});
