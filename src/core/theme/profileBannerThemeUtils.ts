export type Rgb = [number, number, number];

export interface ProfileTheme {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  highlight: string;
  shell: string;
  image: string;
  imageOpacity: string;
  imageBrightness: string;
  imageSaturation: string;
  profileReady: string;
  active?: string;
  activeText?: string;
}

export interface BannerVisualProfile {
  palette: string[];
  averageRgb: Rgb;
  luminance: number;
  saturation: number;
  imageUrl: string;
}

export const DEFAULT_PROFILE_THEME: ProfileTheme = {
  primary: "24 32 44",
  secondary: "18 25 36",
  tertiary: "12 17 24",
  neutral: "24 30 40",
  highlight: "42 50 62",
  shell: "7 10 16",
  image: "none",
  imageOpacity: "0",
  imageBrightness: "0.78",
  imageSaturation: "1",
  profileReady: "0"
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function hexToRgb(hex: string): Rgb | null {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function toRgbVariable(rgb: Rgb): string {
  return rgb.map((channel) => Math.round(clamp(channel, 0, 255))).join(" ");
}

function scaleRgb(rgb: Rgb, scale: number): Rgb {
  return rgb.map((channel) => channel * scale) as Rgb;
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return a.map((channel, index) => channel + (b[index] - channel) * t) as Rgb;
}

function contrastOn(rgb: Rgb): string {
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.45 ? "#08080d" : "#ffffff";
}

function toCssUrl(url: string | null): string {
  if (!url) return "none";
  return `url(${JSON.stringify(url)})`;
}

/**
 * Map the sampled Profile banner into the complete consumer environment.
 *
 * The output is deliberately expressed as space-separated RGB channels for
 * CSS custom properties. This lets the stylesheet apply alpha consistently
 * to ambient blobs, borders, glass surfaces, and active controls while the
 * original banner remains available as a blurred environmental image.
 */
export function profileToTheme(profile: BannerVisualProfile): ProfileTheme {
  const colors = profile.palette
    .map(hexToRgb)
    .filter((color): color is Rgb => color !== null);
  const average = profile.averageRgb;
  const primary = colors[0] ?? average;
  const secondary = colors[1] ?? mixRgb(primary, average, 0.42);
  const tertiary = colors[2] ?? scaleRgb(average, 0.62);
  const luminance = clamp(profile.luminance, 0, 1);
  const saturation = clamp(profile.saturation, 0, 1);
  const toneScale = 0.58 + luminance * 0.18;
  const shell = mixRgb([5, 8, 13], average, 0.24 + luminance * 0.16);
  const neutral = mixRgb(
    scaleRgb(average, 0.72 + luminance * 0.12),
    [18, 24, 32],
    0.22
  );
  const active = mixRgb(primary, [255, 255, 255], luminance > 0.72 ? 0.08 : 0);

  return {
    primary: toRgbVariable(scaleRgb(primary, toneScale)),
    secondary: toRgbVariable(scaleRgb(secondary, toneScale * 0.92)),
    tertiary: toRgbVariable(scaleRgb(tertiary, 0.82 + luminance * 0.12)),
    neutral: toRgbVariable(neutral),
    highlight: toRgbVariable(
      mixRgb(average, [255, 255, 255], 0.12 + luminance * 0.12)
    ),
    shell: toRgbVariable(shell),
    image: toCssUrl(profile.imageUrl),
    imageOpacity: clamp(
      0.09 + luminance * 0.11 + saturation * 0.04,
      0.09,
      0.24
    ).toFixed(3),
    imageBrightness: clamp(0.72 + luminance * 0.34, 0.72, 1.02).toFixed(3),
    imageSaturation: clamp(0.9 + saturation * 0.34, 0.9, 1.2).toFixed(3),
    profileReady: "1",
    active: toRgbVariable(active),
    activeText: contrastOn(active)
  };
}
