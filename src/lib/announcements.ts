// src/lib/announcements.ts
//
// CineLog V2 — Announcements Hook (Client)
// ---------------------------------------------------------------------
// Fetches active announcements from /api/announcements (public endpoint).
// Cache in-memory for 2 minutes — admins expect changes to propagate
// quickly, but we don't want to hammer the endpoint on every navigation.
//
// Dismissal is stored in localStorage per-announcement-ID for 24 hours.
// Re-fetches on storage event (multi-tab) and on visibilitychange (tab refocus).

import { createSignal, onMount, onCleanup, createMemo } from "solid-js";

export interface Announcement {
  id: string;
  type: "banner" | "toast" | "modal";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_audience: "all" | "guests" | "authenticated";
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISMISS_KEY = "cinelog:dismissed-announcements";

let cachedAnnouncements: Announcement[] | null = null;
let cachedAt = 0;
let inflightPromise: Promise<Announcement[]> | null = null;

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const valid = new Set<string>();
    for (const [id, ts] of Object.entries(parsed)) {
      if (now - ts < DISMISS_TTL_MS) valid.add(id);
    }
    return valid;
  } catch {
    return new Set();
  }
}

function persistDismissal(id: string) {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[id] = Date.now();
    localStorage.setItem(DISMISS_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable (private mode) — silently ignore
  }
}

async function fetchAnnouncements(
  audience: "all" | "guests" | "authenticated"
): Promise<Announcement[]> {
  if (cachedAnnouncements && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedAnnouncements;
  }
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const resp = await fetch(`/api/announcements?audience=${audience}`);
      if (!resp.ok) return cachedAnnouncements ?? [];
      const data = (await resp.json()) as { announcements: Announcement[] };
      cachedAnnouncements = data.announcements;
      cachedAt = Date.now();
      return cachedAnnouncements;
    } catch {
      return cachedAnnouncements ?? [];
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

export function useAnnouncements(options?: {
  audience?: "all" | "guests" | "authenticated";
}) {
  const audience = options?.audience ?? "all";
  const [announcements, setAnnouncements] = createSignal<Announcement[]>([]);
  // We don't actually need a dismissed signal — `load()` re-reads localStorage
  // every time it runs (via getDismissedIds). Keep a no-op setter for API
  // compatibility, but the source of truth is localStorage itself.
  // The first tuple element is intentionally unused; prefix with `_` so the
  // lint rule knows it's deliberate.
  const [_dismissedSignal, setDismissedSignal] = createSignal<Set<string>>(
    getDismissedIds()
  );

  const load = async () => {
    const all = await fetchAnnouncements(audience);
    const d = getDismissedIds();
    setDismissedSignal(d);
    // Don't show dismissed announcements (even non-dismissible ones get hidden if user already dismissed)
    setAnnouncements(all.filter((a) => !d.has(a.id)));
  };

  onMount(() => {
    load();
    const onFocus = () => {
      // Only refetch if the document just became visible
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onFocus);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_KEY) load();
    };
    window.addEventListener("storage", onStorage);

    onCleanup(() => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
    });
  });

  const dismiss = (id: string) => {
    persistDismissal(id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const visibleBanners = createMemo(() =>
    announcements().filter((a) => a.type === "banner")
  );
  const visibleToasts = createMemo(() =>
    announcements().filter((a) => a.type === "toast")
  );
  const visibleModals = createMemo(() =>
    announcements().filter((a) => a.type === "modal")
  );

  return {
    announcements,
    visibleBanners,
    visibleToasts,
    visibleModals,
    dismiss,
    refresh: load
  };
}
