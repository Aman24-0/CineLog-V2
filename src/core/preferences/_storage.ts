// src/core/preferences/_storage.ts
// Shared storage helpers for preference signals.
// All helpers are SSR-safe (no-op on the server).

import { isServer } from "solid-js/web";

export function readStored<T extends string>(key: string, fallback: T): T {
  if (isServer) return fallback;
  const v = localStorage.getItem(key);
  return (v as T) ?? fallback;
}

export function writeStored(key: string, value: string): void {
  if (isServer) return;
  localStorage.setItem(key, value);
}

/** Apply a data-attribute to <html> and <body> in sync. */
export function applyDataAttr(attr: string, value: string): void {
  if (isServer) return;
  const kebab = attr.startsWith("data-") ? attr : `data-${attr}`;
  document.documentElement.setAttribute(kebab, value);
  if (document.body) document.body.setAttribute(kebab, value);
}
