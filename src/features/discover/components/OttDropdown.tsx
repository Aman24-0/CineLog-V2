// src/features/discover/components/OttDropdown.tsx
//
// OttDropdown — a sleek glass dropdown that lives next to the "NEW ON OTT"
// row header. It lists the OTT providers the user has selected in their
// "STREAMING PROVIDERS" settings, resolved against the DYNAMIC TMDB
// provider list for the user's region.
//
// Behaviour:
//   • If the user has selected ≥1 provider, the dropdown lists those
//     providers (resolved to their real TMDB provider_name + logo_path
//     via the dynamic region fetch) and the active selection drives the
//     /discover/movie?with_watch_providers={id}&watch_region={region}
//     fetch in the parent.
//   • If the user has NO providers selected, the dropdown lists the TOP
//     10 providers for their country (sorted by display_priority) so
//     the row is never empty.
//   • There are NO hardcoded provider name/logo tables — every name and
//     logo comes from TMDB's /watch/providers/{movie,tv} response.
//
// The provider id selected by the user is exposed via the `selected`
// accessor and the `onSelect` callback. The parent owns the actual
// fetch; this component is purely presentational + selection state.

import {
  For, Show, createSignal, createMemo, onMount, createEffect,
  type Component,
} from "solid-js";
import { streamingProviders, mergeAndSortProviders } from "~/core/preferences";
import { getWatchProviderList, getWatchProviderListTv } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";

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
 * OttDropdown — glass-styled dropdown.
 *
 * The summary shows the active provider's name (or "All Providers" when
 * nothing is selected). The panel lists every available option.
 *
 * Provider names + logos are resolved from the DYNAMIC TMDB region
 * provider list (fetched on mount + when the region changes). There is
 * NO hardcoded lookup table — if TMDB doesn't return a provider, it
 * doesn't appear in the dropdown.
 */
const OttDropdown: Component<OttDropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  // The full merged + sorted provider list for the user's region.
  // Used to resolve display names + logos for the user's selected
  // provider IDs, and as the fallback when no providers are selected.
  const [regionProviders, setRegionProviders] = createSignal<ProviderOption[]>([]);

  /**
   * Fetch ALL providers for the region from TMDB (movie + TV merged,
   * deduplicated by provider_id, sorted by display_priority). This is
   * the single source of truth for provider names + logos — no
   * hardcoded fallback table.
   */
  const loadRegionProviders = async (region: string) => {
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(region),
        getWatchProviderListTv(region),
      ]);
      const movieRows = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tvRows = tvRes.status === "fulfilled" ? tvRes.value : [];
      // mergeAndSortProviders returns TmdbProvider[] (id, name, logoPath,
      // displayPriority) — we strip displayPriority here since the
      // dropdown only needs id/name/logoPath.
      const merged = mergeAndSortProviders(movieRows, tvRows).map((p) => ({
        id: p.id,
        name: p.name,
        logoPath: p.logoPath,
      }));
      setRegionProviders(merged);
    } catch (err) {
      console.warn("[OttDropdown] Failed to load region providers:", err);
      setRegionProviders([]);
    }
  };

  onMount(() => { void loadRegionProviders(props.region); });
  // Refetch when the region changes (user switched country in settings).
  createEffect(() => {
    const r = props.region;
    void loadRegionProviders(r);
  });

  /**
   * Resolve a provider id → { name, logoPath } using the DYNAMIC TMDB
   * region provider list. If the id isn't in the TMDB list (e.g. the
   * user previously selected a provider that's no longer available in
   * their region), returns a "Provider {id}" fallback so the dropdown
   * never shows a blank label.
   */
  const resolveProvider = (id: string): ProviderOption => {
    const fromRegion = regionProviders().find((p) => p.id === id);
    if (fromRegion) return fromRegion;
    return { id, name: `Provider ${id}`, logoPath: null };
  };

  /**
   * The dropdown's option list:
   *   • If the user has selected providers → show ONLY those, resolved
   *     against the dynamic TMDB list.
   *   • Otherwise → show the TOP 10 providers for the region (already
   *     sorted by display_priority from mergeAndSortProviders).
   */
  const options = createMemo<ProviderOption[]>(() => {
    const userPicks = streamingProviders();
    if (userPicks.length > 0) {
      return userPicks.map(resolveProvider);
    }
    // Fallback: top 10 providers for the region (sorted by display_priority).
    return regionProviders().slice(0, 10);
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

  // Click-outside-to-close. We use a fixed full-screen transparent
  // overlay behind the open panel so taps anywhere close the dropdown.
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
