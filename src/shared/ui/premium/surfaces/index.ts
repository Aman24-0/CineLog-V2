// src/shared/ui/premium/surfaces/index.ts
/**
 * Premium Surface Components — Barrel Export
 *
 * Re-exports all premium surface components from this directory.
 * Each component is available as both a named export and a default export.
 *
 * Components:
 * - PremiumSurface         — Foundational surface with elevation, border, padding, radius
 * - PremiumGlassSurface    — Frosted glass surface with backdrop blur
 * - PremiumGradientSurface — Surface with gradient background presets
 * - PremiumOverlay         — Full-screen overlay/backdrop for modal contexts
 * - PremiumBackdrop        — Cinematic backdrop image with gradient overlay
 */

export { PremiumSurface, default as PremiumSurfaceDefault } from "./PremiumSurface";
export { PremiumGlassSurface, default as PremiumGlassSurfaceDefault } from "./PremiumGlassSurface";
export { PremiumGradientSurface, default as PremiumGradientSurfaceDefault } from "./PremiumGradientSurface";
export { PremiumOverlay, default as PremiumOverlayDefault } from "./PremiumOverlay";
export { PremiumBackdrop, default as PremiumBackdropDefault } from "./PremiumBackdrop";
