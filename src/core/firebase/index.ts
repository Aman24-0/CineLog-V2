// src/core/firebase/index.ts
//
// Phase 11 — Firebase Cleanup
// -----------------------------
// The auth shim (auth.ts) has been removed — all auth now goes through
// Supabase directly (getClient().auth.signInWithOAuth / signOut).
//
// Only config.ts remains, exporting `db` (Firestore) for the presets
// feature (useVault.tsx onSnapshot + watchlistService.ts CRUD).
// These will be removed when a Supabase presets table is added.
export * from "./config";
