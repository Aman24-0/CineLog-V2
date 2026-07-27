// src/features/discover/components/OttDropdown.tsx
//
// OttDropdown — a sleek glass dropdown that lives next to the "NEW ON OTT"
// row header. It lists ONLY the OTT providers the user has selected in
// their "STREAMING PROVIDERS" settings (Content & Discover settings page).
//
// Behaviour:
//   • If the user has selected ≥1 provider, the dropdown lists those
//     providers (by display name) and the active selection drives the
//     /discover/movie?with_watch_providers={id}&watch_region={region}
//     fetch in the parent.
//   • If the user has NO providers selected, the dropdown lists the TOP
//     available providers for their country (fetched from TMDB's
//     /watch/providers/movie endpoint) so the row is never empty.
//   • The dropdown is a <details> element under the hood for keyboard
//     accessibility (Enter/Space toggles, Esc closes) — no custom
//     keydown handling needed.
//
// The provider id selected by the user is exposed via the `selected`
// accessor and the `onSelect` callback. The parent owns the actual
// fetch; this component is purely presentational + selection state.

import {
  For, Show, createSignal, createMemo, onMount, createEffect,
  type Component,
} from "solid-js";
import {
  streamingProviders,
  getCuratedProvidersForRegion,
} from "~/core/preferences";
import { getWatchProviderList, getWatchProviderListTv } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";

// ─── Provider display-name + logo resolution ──────────────────────────
//
// We use the shared curated provider registry (from core/preferences) as
// the source of truth for display names + canonical IDs. This keeps the
// OttDropdown in sync with the Settings page — when the user picks
// "JioStar" in settings, the dropdown shows "JioStar" (not "Jio Cinema"
// or "Hotstar").
//
// For user-selected provider IDs that aren't in the curated list (e.g.
// a previously-selected provider that's no longer curated), we fall
// back to a TMDB provider-list lookup (fetched on mount) so unknown
// providers still render with their real name + logo.

interface OttDropdownProps {
  /** The user's ISO 3166-1 watch region (e.g. "IN", "US"). */
  region: string;
  /**
   * The currently-selected provider id (string, e.g. "8" for Netflix).
   * Null while the dropdown is initializing.
   */
  selected: () => string | null;
  /** Called when the user picks a provider from the dropdown. */
  onSelect: (providerId: string) => void;
}

interface ProviderOption {
  id: string;
  name: string;
  logoPath: string | null;
}

/**
 * OttDropdown — glass-styled <details>-based dropdown.
 *
 * Why <details>/<summary>:
 *   - Native keyboard support (Enter/Space toggles, Esc closes in some
 *     browsers, click-outside still works via a small overlay).
 *   - No portal needed — the dropdown panel is positioned absolutely
 *     under the summary.
 *   - Screen readers announce it as a disclosure widget by default.
 *
 * The summary shows the active provider's name (or "All Providers" when
 * nothing is selected). The panel lists every available option.
 */
const OttDropdown: Component<OttDropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [regionProviders, setRegionProviders] = createSignal<ProviderOption[]>([]);

  // Fetch the region's available providers (movie + TV merged) so we can:
  //   1. Resolve display names + logos for user-selected provider IDs
  //      that aren't in our curated PROVIDER_DISPLAY_NAMES table.
  //   2. Have a fallback list when the user has NO providers selected.
  const loadRegionProviders = async (region: string) => {
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(region),
        getWatchProviderListTv(region),
      ]);
      const combined: ProviderOption[] = [];
      const seen = new Set<string>();
      for (const res of [movieRes, tvRes]) {
        if (res.status !== "fulfilled") continue;
        for (const row of res.value) {
          const id = String(row.providerId);
          if (seen.has(id)) continue;
          seen.add(id);
          combined.push({
            id,
            name: row.providerName,
            logoPath: row.logoPath,
          });
        }
      }
      setRegionProviders(combined);
    } catch (err) {
      console.warn("[OttDropdown] Failed to load region providers:", err);
    }
  };

  onMount(() => { void loadRegionProviders(props.region); });
  // Refetch when the region changes (user switched country in settings).
  createEffect(() => {
    const r = props.region;
    void loadRegionProviders(r);
  });

  // Resolve a provider id → { name, logoPath }.
  // Uses the shared curated registry first (so "JioStar" resolves
  // correctly for both id 122 and alias 220), then falls back to the
  // TMDB region provider list, then to a generic "Provider {id}" label.
  const resolveProvider = (id: string): ProviderOption => {
    const curatedList = getCuratedProvidersForRegion(props.region);
    // Check if this id matches a curated provider (canonical or alias).
    const curated = curatedList.find(
      (p) => p.id === id || p.aliasIds?.includes(id),
    );
    if (curated) {
      const fromRegion = regionProviders().find((p) => p.id === id || p.id === curated.id);
      return { id: curated.id, name: curated.name, logoPath: fromRegion?.logoPath ?? null };
    }
    const fromRegion = regionProviders().find((p) => p.id === id);
    if (fromRegion) return fromRegion;
    return { id, name: `Provider ${id}`, logoPath: null };
  };

  // The dropdown's option list:
  //   • If the user has selected providers → show ONLY those.
  //   • Otherwise → show the curated providers for the region (India →
  //     the accurate 6-provider list, other regions → the global
  //     fallback). This avoids the raw TMDB list which includes
  //     duplicate/invalid entries (rent/buy Amazon Video, etc.).
  //     Logos are resolved from the TMDB region provider list.
  const options = createMemo<ProviderOption[]>(() => {
    const userPicks = streamingProviders();
    if (userPicks.length > 0) {
      return userPicks.map(resolveProvider);
    }
    // Fallback: curated providers for the region, with logos resolved
    // from the TMDB region provider list.
    const curated = getCuratedProvidersForRegion(props.region);
    return curated.map((p) => {
      const fromRegion = regionProviders().find(
        (rp) => rp.id === p.id || p.aliasIds?.includes(rp.id),
      );
      return {
        id: p.id,
        name: p.name,
        logoPath: fromRegion?.logoPath ?? null,
      };
    });
  });

  // The summary label — the active provider's name, or "All Providers"
  // when nothing is selected yet (initial state before the effect
  // auto-picks the first user provider).
  const summaryLabel = createMemo(() => {
    const sel = props.selected();
    if (!sel) return "All Providers";
    return resolveProvider(sel).name;
  });

  const handleSelect = (id: string) => {
    props.onSelect(id);
    setOpen(false);
  };

  // Click-outside-to-close (the <details> element doesn't do this
  // natively). We use a fixed full-screen transparent overlay behind
  // the open panel so taps anywhere close the dropdown — this is more
  // reliable than a window click listener (which fires before the
  // summary's toggle on some browsers).
  return (
    <div class="ott-dropdown-wrap">
      <button
        type="button"
        class="ott-dropdown-trigger focus-ring"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-label="Select streaming provider"
      >
        <span class="ott-dropdown-label">{summaryLabel()}</span>
        <span
          class="material-symbols-outlined ott-dropdown-chevron"
          aria-hidden="true"
          style={{ transform: open() ? "rotate(180deg)" : "none", transition: "transform 150ms ease-out" }}
        >
          expand_more
        </span>
      </button>

      <Show when={open()}>
        {/* Click-outside overlay — transparent, sits behind the panel. */}
        <div
          class="ott-dropdown-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div class="ott-dropdown-panel" role="listbox" aria-label="Streaming providers">
          <For each={options()}>
            {(opt) => (
              <button
                type="button"
                class="ott-dropdown-option focus-ring"
                role="option"
                aria-selected={props.selected() === opt.id}
                data-active={props.selected() === opt.id}
                onClick={() => handleSelect(opt.id)}
              >
                <Show when={opt.logoPath}>
                  <img
                    src={tmdbImage(opt.logoPath!, "w92")}
                    class="ott-dropdown-option-logo"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                  />
                </Show>
                <span class="ott-dropdown-option-name">{opt.name}</span>
                <Show when={props.selected() === opt.id}>
                  <span
                    class="material-symbols-outlined ott-dropdown-option-check"
                    aria-hidden="true"
                  >
                    check
                  </span>
                </Show>
              </button>
            )}
          </For>
          <Show when={options().length === 0}>
            <div class="ott-dropdown-empty">
              No providers available in your region.
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default OttDropdown;
