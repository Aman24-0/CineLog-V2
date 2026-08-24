import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_THEME,
  profileToTheme
} from "../profileBannerThemeUtils";

describe("profileToTheme", () => {
  it("provides a neutral, image-free default theme", () => {
    expect(DEFAULT_PROFILE_THEME).toMatchObject({
      primary: "24 32 44",
      secondary: "18 25 36",
      image: "none",
      imageOpacity: "0",
      profileReady: "0"
    });
  });

  it("keeps the banner image in the environmental theme output", () => {
    const theme = profileToTheme({
      palette: ["#d13a45", "#53232b", "#f08b71"],
      averageRgb: [117, 42, 48],
      luminance: 0.25,
      saturation: 0.72,
      imageUrl: "https://cdn.example.test/banner-red.jpg"
    });

    expect(theme.image).toBe('url("https://cdn.example.test/banner-red.jpg")');
    expect(theme.imageOpacity).not.toBe("0");
    expect(theme.profileReady).toBe("1");
    expect(theme.primary).not.toBe(DEFAULT_PROFILE_THEME.primary);
  });

  it("produces distinct app accents for distinct banner families", () => {
    const red = profileToTheme({
      palette: ["#d13a45", "#53232b", "#f08b71"],
      averageRgb: [117, 42, 48],
      luminance: 0.25,
      saturation: 0.72,
      imageUrl: "https://cdn.example.test/banner-red.jpg"
    });
    const cyan = profileToTheme({
      palette: ["#19b8c5", "#126875", "#78e3e8"],
      averageRgb: [28, 126, 138],
      luminance: 0.43,
      saturation: 0.76,
      imageUrl: "https://cdn.example.test/banner-cyan.jpg"
    });

    expect(red.primary).not.toBe(cyan.primary);
    expect(red.secondary).not.toBe(cyan.secondary);
    expect(red.shell).not.toBe(cyan.shell);
  });

  it("chooses dark text for bright active accents and white text for dark accents", () => {
    const bright = profileToTheme({
      palette: ["#f5e86a"],
      averageRgb: [235, 220, 90],
      luminance: 0.78,
      saturation: 0.62,
      imageUrl: "https://cdn.example.test/banner-bright.jpg"
    });
    const dark = profileToTheme({
      palette: ["#64233a"],
      averageRgb: [48, 18, 30],
      luminance: 0.12,
      saturation: 0.54,
      imageUrl: "https://cdn.example.test/banner-dark.jpg"
    });

    expect(bright.activeText).toBe("#08080d");
    expect(dark.activeText).toBe("#ffffff");
  });
});
