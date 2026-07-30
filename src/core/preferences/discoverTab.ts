// src/core/preferences/discoverTab.ts
// Default Discover Tab — Movies / Series / All

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored } from "./_storage";

export type DiscoverTab = "all" | "movie" | "tv";

const DEFAULT_DISCOVER_TAB_KEY = "cinelog_default_discover_tab";

function isDiscoverTab(v: string | null): v is DiscoverTab {
  return v === "all" || v === "movie" || v === "tv";
}

const storedDT = readStored<string>(DEFAULT_DISCOVER_TAB_KEY, "all");

export const [defaultDiscoverTab, setDefaultDiscoverTab] =
  createSignal<DiscoverTab>(isDiscoverTab(storedDT) ? storedDT : "all");

createEffect(() => {
  writeStored(DEFAULT_DISCOVER_TAB_KEY, defaultDiscoverTab());
});
