// src/core/preferences/streamingProviders.ts
// Streaming Provider Subscriptions
// A set of TMDB watch_provider IDs the user is subscribed to.
// Used by Discover OTT section + Where-to-watch on detail pages.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

const STREAMING_PROVIDERS_KEY = "cinelog_streaming_providers";

function readProviderSet(): string[] {
  if (isServer) return [];
  try {
    const raw = localStorage.getItem(STREAMING_PROVIDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const [streamingProviders, setStreamingProviders] = createSignal<string[]>(readProviderSet());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(STREAMING_PROVIDERS_KEY, JSON.stringify(streamingProviders()));
  } catch {
    // ignore quota errors
  }
});

export function toggleStreamingProvider(id: string): void {
  setStreamingProviders((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
}

export function hasStreamingProvider(id: string): boolean {
  return streamingProviders().includes(id);
}
