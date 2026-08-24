import { describe, expect, it } from "vitest";
import { withImageCacheBust } from "../imageUrl";

describe("withImageCacheBust", () => {
  it("versions Supabase Storage object URLs without changing their path", () => {
    const input =
      "https://example.supabase.co/storage/v1/object/public/banners/user/banner.jpg";

    expect(withImageCacheBust(input, "2026-08-25T12:00:00.000Z")).toBe(
      `${input}?v=2026-08-25T12%3A00%3A00.000Z`
    );
  });

  it("replaces an old version while preserving other query parameters", () => {
    const input =
      "https://example.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg?download=1&v=old";
    const result = withImageCacheBust(input, 42);

    expect(result).toBe(
      "https://example.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg?download=1&v=42"
    );
  });

  it("does not mutate external URLs or inline preview data", () => {
    expect(
      withImageCacheBust("https://images.example.com/banner.jpg", 42)
    ).toBe("https://images.example.com/banner.jpg");
    expect(withImageCacheBust("data:image/jpeg;base64,abc", 42)).toBe(
      "data:image/jpeg;base64,abc"
    );
    expect(withImageCacheBust(null, 42)).toBeNull();
  });

  it("leaves malformed and non-http values unchanged", () => {
    expect(withImageCacheBust("/local/banner.jpg", 42)).toBe(
      "/local/banner.jpg"
    );
    expect(withImageCacheBust("ftp://example.com/banner.jpg", 42)).toBe(
      "ftp://example.com/banner.jpg"
    );
  });
});
