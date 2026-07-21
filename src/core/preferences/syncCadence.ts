// src/core/preferences/syncCadence.ts
// Sync Cadence — real-time / wifi-only / manual

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored } from "./_storage";

export type SyncCadence = "realtime" | "wifi-only" | "manual";

const SYNC_CADENCE_KEY = "cinelog_sync_cadence";

function isSyncCadence(v: string | null): v is SyncCadence {
  return v === "realtime" || v === "wifi-only" || v === "manual";
}

const storedSC = readStored<string>(SYNC_CADENCE_KEY, "realtime");

export const [syncCadence, setSyncCadence] = createSignal<SyncCadence>(
  isSyncCadence(storedSC) ? storedSC : "realtime"
);

createEffect(() => {
  writeStored(SYNC_CADENCE_KEY, syncCadence());
});

/** Should we sync now? Considers cadence + network state. */
export function shouldSyncNow(): boolean {
  const c = syncCadence();
  if (c === "realtime") return true;
  if (c === "manual") return false;
  // wifi-only
  if (isServer) return false;
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; type?: string } };
  const conn = nav.connection;
  if (!conn) return true; // can't tell — allow
  if (conn.type) return conn.type === "wifi";
  // Fallback to effectiveType — assume 4g+ is wifi-ish
  const et = conn.effectiveType;
  return et === "4g" || !et;
}
