// src/features/discover/components/OttDropdown.tsx
//
// OttDropdown — a sleek glass dropdown that lives next to the "NEW ON OTT"
// row header. It lists the OTT providers the user has selected in their
// "STREAMING PROVIDERS" settings, resolved against the DYNAMIC TMDB
// provider list for the user's region.
//
// Behaviour:
//   • If the user has selected ≥1 provider, the dropdown lists ONLY those
//     providers that can be resolved to a valid TMDB provider object for
//     the current region. Stale/unresolvable IDs (e.g. "1196" for a
//     provider that's no longer available) are FILTERED OUT so the user
//     never sees raw "Provider 1196" fallback strings.
//   • If the user has NO providers selected (or all selected providers
//     are stale), the dropdown lists the TOP 10 providers for their
//     country (sorted by display_priority) so the row is never empty.
//   • The trigger button displays the active provider's LOGO alongside
//     its name — no logo only when the TMDB fetch hasn't resolved yet.
//   • There are NO hardcoded provider name/logo tables — every name and
//     logo comes from TMDB's /watch/providers/{movie,tv} response.
//
// The provider id selected by the user is exposed via the `selected`
// accessor and the `onSelect` callback. The parent owns the actual
// fetch; this component is purely presentational + selection state.

import {
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  type Component
} from "solid-js";
import { streamingProviders, mergeAndSortProviders } from "~/core/preferences";
import {
  getWatchProviderList,
  getWatchProviderListTv
} from "~/core/tmdb/discover";
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
  /**
   * Called when the region provider list finishes loading (or refetches
   * after a region change). Receives the FULL merged+sorted list of
   * providers available for the current region.
   *
   * The parent uses this to AUTO-SELECT a default provider when the user
   * hasn't picked one (i.e. `selected()` is null) AND has no
   * `streamingProviders` preference. Without this callback, the OTT row
   * would stay in the "Nothing streaming on this provider" empty state
   * forever on first visit — because the dropdown defaults to "All
   * Providers" (null) and no fetch is triggered for a null selection.
   *
   * The parent's auto-select logic (in DiscoverPage):
   *   if (selected() === null && streamingProviders().length === 0) {
   *     // No user preference + no selection → pick the first region provider
   *     if (providers.length > 0) onSelect(providers[0].id);
   *   }
   */
  onProvidersLoaded?: (providers: Array<{ id: string; name: string; logoPath: string | null }>) => void;
}

interface ProviderOption {
  id: string;
  name: string;
  logoPath: string | null;
}

export function chooseInitialProviderId(
  providers: Array<{ id: string }>,
  preferredIds: string[]
): string | null {
  const available = new Set(providers.map((provider) => provider.id));
  return preferredIds.find((id) => available.has(id)) ?? providers[0]?.id ?? null;
}

/**
 * OttDropdown — glass-styled dropdown.
 *
 * The trigger shows the active provider's logo + name (or "All
 * Providers" when nothing is selected). The panel lists every available
 * option with its logo + name.
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
  const [regionProviders, setRegionProviders] = createSignal<ProviderOption[]>(
    []
  );

  /**
   * Fetch ALL providers for the region from TMDB (movie + TV merged,
   * deduplicated by provider_id, sorted by display_priority). This is
   * the single source of truth for provider names + logos — no
   * hardcoded fallback table.
   *
   * After loading, fires `props.onProvidersLoaded` so the parent can
   * auto-select a default provider when the user has no preference.
   */
  const loadRegionProviders = async (region: string) => {
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(region),
        getWatchProviderListTv(region)
      ]);
      const movieRows = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tvRows = tvRes.status === "fulfilled" ? tvRes.value : [];
      // mergeAndSortProviders returns TmdbProvider[] (id, name, logoPath,
      // displayPriority) — we strip displayPriority here since the
      // dropdown only needs id/name/logoPath.
      const merged = mergeAndSortProviders(movieRows, tvRows).map((p) => ({
        id: p.id,
        name: p.name,
        logoPath: p.logoPath
      }));
      setRegionProviders(merged);
      // Notify the parent so it can auto-select a default provider
      // when the user has no preference and no selection.
      props.onProvidersLoaded?.(merged);
    } catch (err) {
      console.warn("[OttDropdown] Failed to load region providers:", err);
      setRegionProviders([]);
      // Still fire the callback with an empty array so the parent knows
      // the load completed (and doesn't hang waiting for providers).
      props.onProvidersLoaded?.([]);
    }
  };

  // Load once on the first reactive run and refetch only when the region
  // changes (user switched country in settings). Using one reactive entry
  // point avoids the previous onMount + createEffect duplicate request.
  createEffect(() => {
    const r = props.region;
    void loadRegionProviders(r);
  });

  /**
   * Resolve a provider id → ProviderOption using the DYNAMIC TMDB
   * region provider list. Returns `null` if the id isn't in the TMDB
   * list — the caller uses this to FILTER OUT stale/unresolvable IDs
   * so the dropdown never shows raw "Provider {id}" fallback strings.
   */
  const tryResolveProvider = (id: string): ProviderOption | null => {
    const fromRegion = regionProviders().find((p) => p.id === id);
    return fromRegion ?? null;
  };

  /**
   * The dropdown's option list:
   *   • If the user has selected providers → show ONLY those that
   *     resolve to a valid TMDB provider for the current region.
   *     Stale/unresolvable IDs are FILTERED OUT.
   *   • Otherwise → show the TOP 10 providers for the region (already
   *     sorted by display_priority from mergeAndSortProviders).
   */
  const options = createMemo<ProviderOption[]>(() => {
    const userPicks = streamingProviders();
    if (userPicks.length > 0) {
      // Filter out any selected ID that doesn't resolve to a valid TMDB
      // provider for the current region. This prevents raw "Provider 1196"
      // fallback strings from appearing in the dropdown.
      const resolved = userPicks
        .map((id) => tryResolveProvider(id))
        .filter((p): p is ProviderOption => p !== null);
      // If ALL selected providers are stale (none resolve), fall back to
      // the top 10 region providers so the dropdown is never empty.
      if (resolved.length > 0) return resolved;
    }
    // Fallback: top 10 providers for the region (sorted by display_priority).
    return regionProviders().slice(0, 10);
  });

  /**
   * The active provider's resolved option — used to render the logo +
   * name in the trigger button. Returns null when nothing is selected
   * OR when the selected id can't be resolved (stale).
   */
  const activeProvider = createMemo<ProviderOption | null>(() => {
    const sel = props.selected();
    if (!sel) return null;
    return tryResolveProvider(sel);
  });

  // The summary label always reflects a real provider. The parent auto-selects
  // the first loaded provider when there is no user preference; this fallback
  // is only a transient/loading or stale-selection label, never a synthetic
  // provider option.
  const summaryLabel = createMemo(() => {
    const active = activeProvider();
    if (!active) return "Select provider";
    return active.name;
  });

  // The active provider's logo URL (for the trigger button icon).
  const activeLogoUrl = createMemo(() => {
    const active = activeProvider();
    if (!active || !active.logoPath) return "";
    return tmdbImage(active.logoPath, "w92");
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
        // aria-controls points at the listbox id so AT users can jump
        // directly from the trigger to the open panel.
        aria-controls="ott-dropdown-listbox"
        aria-label="Select streaming provider"
      >
        {/* Active provider logo — small rounded icon inside the trigger.
            Hidden when there's no active provider or no logo (the name
            alone still communicates the selection). */}
        <Show when={activeLogoUrl()}>
          <img
            src={activeLogoUrl()}
            class="ott-dropdown-trigger-logo"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
        </Show>
        <span class="ott-dropdown-label">{summaryLabel()}</span>
        <span
          class="material-symbols-outlined ott-dropdown-chevron"
          aria-hidden="true"
          style={{
            transform: open() ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease-out"
          }}
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
        <div
          class="ott-dropdown-panel"
          id="ott-dropdown-listbox"
          role="listbox"
          aria-label="Streaming providers"
        >
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
