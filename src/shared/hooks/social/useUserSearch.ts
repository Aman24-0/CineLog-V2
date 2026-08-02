// src/shared/hooks/social/useUserSearch.ts
//
// useUserSearch — debounced user search hook for the "Find People" page.
//
// Fetches from GET /api/users/search?q=<query> and exposes:
//   • results   — Accessor<APIUser[]>   — search results
//   • loading   — Accessor<boolean>     — true while a search is in flight
//   • error     — Accessor<string | null>
//   • search    — (query: string) => void  — update the query (debounced)

import { createSignal, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

import { getClient } from "~/lib/supabase/client";

export interface APIUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isFollowing: boolean;
}

interface SearchResponse {
  data: APIUser[];
}

interface UseUserSearchReturn {
  results: Accessor<APIUser[]>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  search: (query: string) => void;
}

const DEBOUNCE_MS = 300;

export function useUserSearch(): UseUserSearchReturn {
  const [results, setResults] = createSignal<APIUser[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentQuery = "";

  const doSearch = async (query: string) => {
    if (isServer) return;
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = getClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;

      const url = `/api/users/search?q=${encodeURIComponent(query.trim())}`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body?.error ?? "Search failed. Please try again.");
        setResults([]);
        return;
      }

      const body = (await res.json()) as SearchResponse;
      setResults(body.data ?? []);
    } catch (err) {
      console.error("[useUserSearch] fetch threw:", err);
      setError("Network error — please check your connection.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const search = (query: string) => {
    currentQuery = query;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    debounceTimer = setTimeout(() => {
      void doSearch(currentQuery);
    }, DEBOUNCE_MS);
  };

  return { results, loading, error, search };
}
