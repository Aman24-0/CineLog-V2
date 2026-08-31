// src/features/settings/hooks/useSettingsState.ts
//
// `useSettingsState` — the state + handlers + memos behind the
// SettingsPage. Originally lived inline in `SettingsPage.tsx`; extracted
// during the section-refactor so SettingsPage.tsx could become a thin
// composer (< 1000 lines).
//
// What lives here:
//   • All `createSignal` declarations (account, appearance, banner,
//     content, notifications state).
//   • `onMount` data-loaders (refreshHasPassword, loadProfile,
//     loadProviders) + the auth-state listener.
//   • `createEffect` for region-change re-fetching.
//   • All handler functions (save profile, sign out, OAuth link/unlink,
//     push permission request, category toggle, provider toggle).
//   • All memos (countryOptions, languageOptions, fallbackOptions,
//     activeProviderCount, filteredSections, joinDate, emailDisplay,
//     nameDisplay).
//   • UI helpers (toggleSection, isExpanded, scrollToSection,
//     handleSidebarClick, highlightText, renderSegmented).
//   • The `state` bag construction — returned to the caller and passed
//     to each section component as `props.state`.
//
// What does NOT live here:
//   • The render function (stays in SettingsPage.tsx).
//   • The JSX for each section (in `./sections/*Section.tsx`).
//   • The page-shell JSX (header, search bar, sidebar nav, sheets).

import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  type JSX
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { signOut } from "~/shared/hooks/useAuthActions";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { getClient as getSupabaseClient } from "~/lib/supabase/client";

// Shared controls — `Segmented` is used by the `renderSegmented` helper.
import { Segmented } from "~/features/settings/sharedControls";

// Section metadata + the SettingsState type.
import {
  SECTIONS,
  DANGER_ZONE_META,
  type SettingsState,
  type SectionMeta
} from "~/features/settings/sections";

// Preferences (global signals + setters + types).
import {
  language,
  streamingProviders,
  toggleStreamingProvider,
  updateNotifPref,
  type JustWatchProviderItem,
  type NotificationPrefs
} from "~/core/preferences";

import {
  setDiscoverRegion,
  useDiscoverRegion
} from "~/core/config/discoverRegion";
import { COUNTRIES, countryLabel } from "~/shared/data/countryLanguages";
import {
  getStatesForCountry,
  getCitiesForState
} from "~/shared/data/locationData";

// Static option lists — used by the memos (languageOptions,
// fallbackOptions) and the providers loop.
import { UI_LANGUAGES } from "~/shared/constants/settings";

// Phase 6 Part 3 — Task 3: type-only import for the section reset
// handler. The actual functions are imported dynamically so they
// don't bloat the initial bundle.
import type { SettingsSectionId } from "../settingsDefaults";

export function useSettingsState(): SettingsState {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const profileRepo = useProfile();
  const { showToast } = useToast();
  const region = useDiscoverRegion();

  // ── Search + accordion state ────────────────────────────────────
  const [query, setQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal<Set<string>>(
    new Set(["account"])
  );

  // ── Page-level loading / error state ──────────────────────────────
  // Tracks the initial data load (loadProfile + refreshHasPassword).
  // Once loaded, subsequent mutations don't flip `loading` back to true
  // — they use per-action signals (savingProfile, linkingProvider, etc.)
  // so the existing content stays visible.
  const [settingsLoading, setSettingsLoading] = createSignal(true);
  const [settingsError, setSettingsError] = createSignal<Error | null>(null);

  // ── Account state ────────────────────────────────────────────────
  const [hasPassword, setHasPassword] = createSignal<boolean>(false);
  // Country: initialise from localStorage so the picker doesn't flash
  // the default "US" while we wait for `loadProfile()` to fetch the
  // canonical value from the profiles table. The DB is the source of
  // truth — localStorage just provides an instant first-paint value
  // and survives reloads even if the network is slow.
  //
  // NOTE: SolidJS's `createSignal` does NOT support a lazy initializer
  // function (unlike React's `useState`). We compute the initial value
  // synchronously here. localStorage access is safe at module-eval time
  // on the client; on the server, the `typeof localStorage` guard
  // returns "US".
  const initialCountry = (() => {
    try {
      const stored =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("cinelog_country")
          : null;
      if (stored && /^[A-Za-z]{2}$/.test(stored)) {
        return stored.toUpperCase();
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — fall through.
    }
    return "US";
  })();
  const [country, setCountry] = createSignal<string>(initialCountry);

  // State / Province — nullable. Loaded from profiles.state on
  // loadProfile. When country changes, state + city reset to "".
  const [stateCode, setStateCode] = createSignal<string>("");
  // City — nullable. Loaded from profiles.city on loadProfile.
  // When state changes, city resets to "".
  const [city, setCity] = createSignal<string>("");
  const [displayName, setDisplayName] = createSignal<string>("");
  const [bio, setBio] = createSignal<string>("");
  // Profile banner appearance is owned globally by ProfileAmbientTheme;
  // Settings intentionally has no competing theme or accent state.
  const [editingProfile, setEditingProfile] = createSignal(false);
  const [savingProfile, setSavingProfile] = createSignal(false);
  // Mutation status for the inline profile save — tracks idle/submitting/success/error
  // so MutationButton can show appropriate feedback.
  const [saveProfileStatus, setSaveProfileStatus] = createSignal<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [nameInput, setNameInput] = createSignal("");
  const [bioInput, setBioInput] = createSignal("");
  const [showEmailSheet, setShowEmailSheet] = createSignal(false);
  const [showPasswordSheet, setShowPasswordSheet] = createSignal(false);
  const [showLinkEmailPasswordSheet, setShowLinkEmailPasswordSheet] =
    createSignal(false);
  const [showDeactivateSheet, setShowDeactivateSheet] = createSignal(false);
  const [deactivateMode, setDeactivateMode] = createSignal<
    "deactivate" | "delete"
  >("deactivate");
  const [showSignOutSheet, setShowSignOutSheet] = createSignal(false);
  const [show2FAPanel, setShow2FAPanel] = createSignal(false);
  const [showSessionsPanel, setShowSessionsPanel] = createSignal(false);
  const [showLoginHistoryPanel, setShowLoginHistoryPanel] = createSignal(false);
  const [showLoginMethodsPanel, setShowLoginMethodsPanel] =
    createSignal<boolean>(false);

  /** OAuth providers linked to the current account. */
  const [linkedProviders, setLinkedProviders] = createSignal<Set<string>>(
    new Set()
  );
  const [linkingProvider, setLinkingProvider] = createSignal<string | null>(
    null
  );
  const [unlinkingProvider, setUnlinkingProvider] = createSignal<string | null>(
    null
  );

  // ── Content state ────────────────────────────────────────────────
  const [providers, setProviders] = createSignal<JustWatchProviderItem[]>([]);
  const [providersLoading, setProvidersLoading] = createSignal(true);

  // ── Notifications state ──────────────────────────────────────────
  const [pushPermission, setPushPermission] = createSignal<
    NotificationPermission | "unsupported"
  >("default");
  async function loadProviders(_reg: string) {
    setProvidersLoading(true);
    try {
      // Stage 5 Chunk 4: providers now come from the JustWatch-backed
      // /api/ott/providers route instead of TMDB's
      // /watch/providers/{movie,tv} endpoints.
      //
      // Stage 5 Chunk 6D: pass the client-known region as a `region`
      // query param so the server uses the user's profile country
      // directly instead of trying to re-resolve it from the Supabase
      // session (which fails open to "US" on the Vercel preview when
      // the session cookie isn't forwarded to the serverless function).
      // The `region()` signal here is the SAME source of truth as the
      // server-side `profiles.country` column — it's kept in sync via
      // `setDiscoverRegion()` whenever `handleSaveCountry` runs.
      //
      // The route returns { country, providers: JustWatchPackage[] }.
      // JustWatchPackage and JustWatchProviderItem have identical
      // shapes, so the cast is a no-op at runtime.
      const reg = region();
      const url =
        reg && /^[A-Za-z]{2}$/.test(reg)
          ? `/api/ott/providers?region=${encodeURIComponent(reg.toUpperCase())}`
          : "/api/ott/providers";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        console.warn("[settings] /api/ott/providers returned HTTP", res.status);
        setProviders([]);
        return;
      }
      const body = (await res.json()) as {
        country?: string;
        providers?: JustWatchProviderItem[];
      };
      setProviders(Array.isArray(body.providers) ? body.providers : []);
    } catch (err) {
      console.warn("[settings] Failed to load providers:", err);
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }

  // ── Initial data loading ────────────────────────────────────────
  onMount(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      await Promise.all([refreshHasPassword(), loadProfile()]);
    } catch (err) {
      console.error("[settings] Initial load failed:", err);
      setSettingsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSettingsLoading(false);
    }

    // Providers load independently so a provider API failure never blocks
    // the rest of the Settings page.
    void loadProviders(region());

    if (typeof Notification === "undefined") {
      setPushPermission("unsupported");
    } else {
      setPushPermission(Notification.permission);
    }
  });

  // Re-fetch providers when the selected region changes.
  createEffect(() => {
    const selectedRegion = region();
    void loadProviders(selectedRegion);
  });

  const handleSaveCountry = async (newCountry: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your country.", "error");
      return;
    }
    setCountry(newCountry);
    // Country change resets state + city (cascading selector). The
    // user must re-pick a state + city for the new country. We
    // persist the reset to Supabase too so the profile doesn't
    // keep an invalid state/city from the old country.
    setStateCode("");
    setCity("");
    // Persist to localStorage immediately so the next reload starts
    // with the right value, even if the network round-trip is slow.
    try {
      localStorage.setItem("cinelog_country", newCountry);
    } catch {
      // localStorage may be unavailable (private mode) — non-fatal.
    }
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        country: newCountry,
        state: null,
        city: null
      });
      if (error) throw error;
      setDiscoverRegion(newCountry);
      showToast(`Country set to ${countryLabel(newCountry)}`, "success", 1800);
    } catch (err) {
      console.error("[settings] Failed to save country:", err);
      showToast("Failed to save country.", "error");
    }
  };

  /** Save the state/province. Resets city to "" (cascading). */
  const handleSaveState = async (newStateCode: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your state.", "error");
      return;
    }
    setStateCode(newStateCode);
    setCity("");
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        state: newStateCode || null,
        city: null
      });
      if (error) throw error;
      const stateName =
        stateOptions().find((s) => s.value === newStateCode)?.label ??
        newStateCode;
      showToast(`State set to ${stateName}`, "success", 1800);
    } catch (err) {
      console.error("[settings] Failed to save state:", err);
      showToast("Failed to save state.", "error");
    }
  };

  /** Save the city. */
  const handleSaveCity = async (newCity: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your city.", "error");
      return;
    }
    setCity(newCity);
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        city: newCity || null
      });
      if (error) throw error;
      showToast(`City set to ${newCity}`, "success", 1800);
    } catch (err) {
      console.error("[settings] Failed to save city:", err);
      showToast("Failed to save city.", "error");
    }
  };

  /** Refresh password and linked OAuth-provider state from Supabase Auth. */
  async function refreshHasPassword() {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error) return;
      const currentUser = data?.user;
      if (!currentUser) return;

      const identities = currentUser.identities ?? [];
      const hasEmailIdentity = identities.some((id) => id.provider === "email");
      const authProviders: string[] = currentUser.app_metadata?.providers ?? [];
      const passwordViaProviders =
        authProviders.includes("email") && Boolean(currentUser.email);
      let hasPassword = hasEmailIdentity || passwordViaProviders;

      if (!hasPassword && currentUser.email) {
        try {
          const { data: identityData, error: identityError } =
            await client.auth.getUserIdentities();
          if (
            !identityError &&
            identityData?.identities?.some((id) => id.provider === "email")
          ) {
            hasPassword = true;
          }
        } catch {
          // Keep the result from the first two signals when the fallback fails.
        }
      }

      setHasPassword(hasPassword);
      setLinkedProviders(
        new Set(
          identities
            .map((identity) => identity.provider)
            .filter((provider) => provider === "google" || provider === "apple")
        )
      );
    } catch (error) {
      console.warn("[settings] refreshHasPassword failed:", error);
    }
  }

  // Keep account indicators current after a link, unlink, sign-in, or reset.
  onMount(() => {
    const client = getSupabaseClient();
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY"
      ) {
        void refreshHasPassword();
      }
    });
    onCleanup(() => listener?.subscription.unsubscribe());
  });

  async function loadProfile() {
    const uid = user()?.uid;
    if (!uid) return;
    try {
      const result = await profileRepo.getProfile(uid);
      if (!result.data) return;

      if (result.data.country) {
        setCountry(result.data.country);
        setDiscoverRegion(result.data.country);
        try {
          localStorage.setItem("cinelog_country", result.data.country);
        } catch {
          // localStorage may be unavailable; the signal remains authoritative.
        }
      }
      // Load state/city (nullable — existing profiles may have null)
      if ((result.data as { state?: string | null }).state) {
        setStateCode((result.data as { state?: string | null }).state ?? "");
      }
      if ((result.data as { city?: string | null }).city) {
        setCity((result.data as { city?: string | null }).city ?? "");
      }
      if (result.data.display_name) setDisplayName(result.data.display_name);
      if (result.data.bio) setBio(result.data.bio);
    } catch (error) {
      console.warn("[settings] loadProfile failed:", error);
    }
  }

  const handleStartEditProfile = () => {
    setNameInput(displayName() || user()?.displayName || "");
    setBioInput(bio());
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your profile.", "error");
      return;
    }
    const trimmedName = nameInput().trim();
    if (!trimmedName) {
      showToast("Name can't be empty.", "error");
      return;
    }
    setSavingProfile(true);
    setSaveProfileStatus("submitting");
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        displayName: trimmedName,
        bio: bioInput().trim()
      });
      if (error) throw error;
      setDisplayName(trimmedName);
      setBio(bioInput().trim());
      setEditingProfile(false);
      setSaveProfileStatus("success");
      showToast("Profile saved.", "success", 1500);
      // Auto-reset to idle after 2s so the button re-enables
      setTimeout(() => setSaveProfileStatus("idle"), 2000);
    } catch (err) {
      console.error("[settings] Failed to save profile:", err);
      setSaveProfileStatus("error");
      showToast("Failed to save profile.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEditProfile = () => {
    setEditingProfile(false);
    setNameInput(displayName());
    setBioInput(bio());
  };

  const handleSignOut = () => setShowSignOutSheet(true);

  const handleConfirmSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  const handleDeactivate = () => {
    setDeactivateMode("deactivate");
    setShowDeactivateSheet(true);
  };

  const handleDelete = () => {
    setDeactivateMode("delete");
    setShowDeactivateSheet(true);
  };

  // ── OAuth linking (Google / Apple) ──────────────────────────────

  /**
   * Link a new OAuth provider to the signed-in user's account.
   *
   * `supabase.auth.linkIdentity()` redirects the browser to the
   * provider's consent screen. After the user authenticates, the
   * provider redirects back to the redirectTo URL (this same page),
   * Supabase's `detectSessionInUrl` parses the result, and on next
   * mount `refreshHasPassword()` picks up the newly-linked provider
   * from `user.identities`.
   *
   * Note: this only works if the user has at least one existing
   * identity (i.e. they're signed in). Supabase refuses to link a
   * provider to a logged-out user.
   */
  const handleLinkProvider = async (provider: "google" | "apple") => {
    setLinkingProvider(provider);
    try {
      const client = getSupabaseClient();
      const redirectTo = `${window.location.origin}/settings`;
      const { error } = await client.auth.linkIdentity({
        provider,
        options: { redirectTo }
      });
      if (error) throw error;
      // The browser will redirect to the provider's consent screen.
      // No toast — the redirect itself is the success indicator.
    } catch (err) {
      console.error(`[settings] linkIdentity(${provider}) failed:`, err);
      const msg =
        err instanceof Error ? err.message : "Failed to link provider.";
      showToast(msg, "error");
      setLinkingProvider(null);
    }
  };

  /**
   * Unlink an OAuth provider from the signed-in user's account.
   *
   * Supabase's `unlinkIdentity()` requires the full `UserIdentity`
   * object (not just the provider name). We fetch the identities list,
   * find the matching one, and pass it through.
   *
   * Supabase refuses to unlink the LAST identity on an account (the
   * user would be locked out). We surface that error as a friendly
   * toast. We also refuse to unlink if the user has no password set
   * and only one OAuth provider linked — same reason.
   */
  const handleUnlinkProvider = async (provider: "google" | "apple") => {
    setUnlinkingProvider(provider);
    try {
      const client = getSupabaseClient();
      const { data: identitiesData, error: identitiesErr } =
        await client.auth.getUserIdentities();
      if (identitiesErr) throw identitiesErr;
      const identities = identitiesData?.identities ?? [];
      const identity = identities.find((id) => id.provider === provider);
      if (!identity) {
        showToast(`${provider} is not linked to your account.`, "info");
        return;
      }
      // Safety: refuse to unlink if this would leave the user with no
      // remaining sign-in method (no password AND no other OAuth).
      const otherIdentities = identities.filter(
        (id) => id.provider !== provider
      );
      const hasPassword = hasPasswordSignal();
      if (otherIdentities.length === 0 && !hasPassword) {
        showToast(
          "You can't unlink your last sign-in method. Add a password or another provider first.",
          "error",
          4000
        );
        return;
      }
      const { error } = await client.auth.unlinkIdentity(identity);
      if (error) throw error;
      showToast(`${provider} unlinked.`, "success");
      // Refresh both the linked providers set and the password state
      // (linking/unlinking can change which identities are present).
      await refreshHasPassword();
    } catch (err) {
      console.error(`[settings] unlinkIdentity(${provider}) failed:`, err);
      const msg =
        err instanceof Error ? err.message : "Failed to unlink provider.";
      showToast(msg, "error");
    } finally {
      setUnlinkingProvider(null);
    }
  };

  /** Local alias so the unlink guard doesn't shadow the signal. */
  const hasPasswordSignal = () => hasPassword();

  // ── Notifications handlers ──────────────────────────────────────

  const requestPushPermission = async () => {
    if (typeof Notification === "undefined") {
      showToast("Push notifications not supported in this browser.", "error");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === "granted") {
        showToast("Push notifications enabled.", "success");
        new Notification("CineLog notifications enabled", {
          body: "You'll now get reminders for new seasons and weekly recaps."
        });
      } else if (perm === "denied") {
        showToast("Push notifications blocked by browser.", "error");
      }
    } catch (e) {
      console.error("[settings] Push permission failed:", e);
      showToast("Could not request push permission.", "error");
    }
  };

  const handleCategoryToggle = (
    key: keyof NotificationPrefs,
    value: boolean
  ) => {
    updateNotifPref(key, value);
    if (value && pushPermission() === "default") {
      void requestPushPermission();
    }
  };

  // ── Content: streaming providers ────────────────────────────────

  const handleToggleProvider = (provider: JustWatchProviderItem) => {
    // The Settings UI passes the full JustWatchProviderItem, but the
    // preference signal stores only the technicalName (the stable
    // JustWatch provider identifier). toggleStreamingProvider adds
    // the technicalName if absent, removes it if present.
    toggleStreamingProvider(provider.technicalName);
  };

  // ── Derived display values ──────────────────────────────────────

  const joinDate = (): string => {
    const created = user()?.createdAt;
    if (!created) return "Unknown";
    try {
      return new Date(created).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return "Unknown";
    }
  };

  const emailDisplay = (): string => user()?.email ?? "Not set";
  const nameDisplay = (): string =>
    displayName() || user()?.displayName || "Not set";

  const countryOptions = createMemo(() =>
    COUNTRIES.map((c) => ({ value: c.code, label: c.label }))
  );

  // State options — derived from the real geographic dataset
  // (src/shared/data/locationData.ts) based on the selected country.
  // Returns [] if the country has no state data (the State SelectRow
  // renders in a disabled state in that case).
  const stateOptions = createMemo(() =>
    getStatesForCountry(country()).map((s) => ({
      value: s.code,
      label: s.name
    }))
  );

  // City options — derived from the selected country + state.
  // Returns [] if no state is selected or the state has no city data.
  const cityOptions = createMemo(() =>
    getCitiesForState(country(), stateCode()).map((c) => ({
      value: c,
      label: c
    }))
  );

  const languageOptions = createMemo(() =>
    UI_LANGUAGES.map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  const fallbackOptions = createMemo(() =>
    UI_LANGUAGES.filter((l) => l.code !== language()).map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  const activeProviderCount = createMemo(() => streamingProviders().length);

  // ── Search filter ────────────────────────────────────────────────

  const filteredSections = createMemo<SectionMeta[]>(() => {
    const q = query().trim().toLowerCase();
    const all = [...SECTIONS, DANGER_ZONE_META];
    if (!q) return all;

    const matchSection = (s: SectionMeta) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.desc.toLowerCase().includes(q)) return true;
      return s.keywords.some((k) => k.toLowerCase().includes(q));
    };

    return all.filter(matchSection);
  });

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isExpanded(id: string): boolean {
    if (query().trim().length > 0) {
      // When searching, expand all matching sections.
      return filteredSections().some((s) => s.id === id);
    }
    return expanded().has(id);
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("settings-section-highlight");
      setTimeout(() => el.classList.remove("settings-section-highlight"), 1500);
    }
  }

  function handleSidebarClick(id: string) {
    if (!isExpanded(id)) toggleSection(id);
    setTimeout(() => scrollToSection(id), 50);
  }

  // ─── Reset section to defaults (Phase 6 Part 3 — Task 3) ──────────
  //
  // Reset the given section's preferences to their default values.
  // The reset is applied immediately to the preference signals (which
  // also persist to localStorage via their createEffect, and sync to
  // Supabase via the preferencesSync debouncer).
  //
  // A toast confirms the reset. The user can't undo via a toast
  // action (the previous values are lost once the signals are
  // overwritten) — but they can re-toggle individual prefs if they
  // remember what they had.
  const handleResetSection = (sectionId: string) => {
    // Lazy-import to avoid pulling the entire settingsDefaults module
    // (and its preference-module dependencies) into the initial bundle.
    // The reset path is rarely used, so the import-on-click cost is
    // acceptable.
    import("../settingsDefaults").then(({ resetSectionToDefaults }) => {
      const ok = resetSectionToDefaults(sectionId as SettingsSectionId);
      if (ok) {
        showToast(`Reset ${sectionId} to defaults`, "success");
      } else {
        showToast(`Couldn't reset "${sectionId}" — unknown section.`, "error");
      }
    });
  };

  // ─── Export preferences to JSON file ──────────────────────────────
  const handleExportSettings = () => {
    import("../settingsDefaults").then(({ exportSettingsToFile }) => {
      const ok = exportSettingsToFile();
      if (ok) {
        showToast("Preferences exported", "success");
      } else {
        showToast("Couldn't export preferences.", "error");
      }
    });
  };

  // ─── Import preferences from JSON file ────────────────────────────
  //
  // Accepts a File from an <input type="file">. Reads the file,
  // validates it (magic header + shape), and applies the snapshot
  // to the preference signals.
  const handleImportSettings = async (file: File) => {
    const { importSettingsFromFile } = await import("../settingsDefaults");
    const result = await importSettingsFromFile(file);
    if (result.ok) {
      showToast(
        `Imported ${result.applied} preference${result.applied === 1 ? "" : "s"}`,
        "success"
      );
    } else {
      showToast(result.error, "error");
    }
  };

  // Retry the initial load (used by ErrorState onRetry).
  const retryLoad = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      await Promise.all([refreshHasPassword(), loadProfile()]);
    } catch (err) {
      console.error("[settings] Retry load failed:", err);
      setSettingsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSettingsLoading(false);
    }
  };

  // Highlight matched text in section titles/descriptions.
  const highlightText = (text: string): JSX.Element => {
    const q = query().trim();
    if (!q) return <>{text}</>;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const idx = lower.indexOf(ql);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark class="settings-search-mark">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  // ── Render helpers ───────────────────────────────────────────────

  const renderSegmented = <T extends string | number>(
    options: { id: T; label: string; short?: string }[],
    current: () => T,
    onChange: (id: T) => void,
    name: string
  ) => (
    <Segmented
      options={options}
      current={current}
      onChange={onChange}
      name={name}
    />
  );

  // ── State bag ───────────────────────────────────────────────────
  // Gather every signal, setter, handler, memo, and UI helper that
  // any section component needs. This is passed to each `<XSection
  // state={state} />` call as a single prop — SolidJS props are
  // accessors, so reads are cheap even though the bag is large.
  //
  // Adding a new piece of state? Add it here AND to the
  // `SettingsState` interface in `./sections/types.ts`.
  const state: SettingsState = {
    // Auth + profile (from useAuth)
    user,
    isSignedIn,

    // Page-level loading / error
    settingsLoading,
    settingsError,
    retryLoad,

    // Account state
    hasPassword,
    country,
    displayName,
    bio,
    editingProfile,
    savingProfile,
    saveProfileStatus,
    nameInput,
    bioInput,
    setNameInput,
    setBioInput,

    // Account sheet visibility
    showEmailSheet,
    setShowEmailSheet,
    showPasswordSheet,
    setShowPasswordSheet,
    showLinkEmailPasswordSheet,
    setShowLinkEmailPasswordSheet,
    showDeactivateSheet,
    setShowDeactivateSheet,
    deactivateMode,
    showSignOutSheet,
    setShowSignOutSheet,

    // Account panel visibility (inline collapsibles)
    show2FAPanel,
    setShow2FAPanel,
    showSessionsPanel,
    setShowSessionsPanel,
    showLoginHistoryPanel,
    setShowLoginHistoryPanel,
    showLoginMethodsPanel,
    setShowLoginMethodsPanel,

    // OAuth linking state
    linkedProviders,
    linkingProvider,
    unlinkingProvider,

    // Account handlers
    handleStartEditProfile,
    handleSaveProfile,
    handleCancelEditProfile,
    handleSaveCountry,
    handleSaveState,
    handleSaveCity,
    handleLinkProvider,
    handleUnlinkProvider,
    handleSignOut,
    handleConfirmSignOut,
    handleDeactivate,
    handleDelete,
    refreshHasPassword,

    // Content state
    providers,
    providersLoading,
    handleToggleProvider,

    // Notifications state
    pushPermission,
    requestPushPermission,
    handleCategoryToggle,

    // Derived display values (memos + plain functions)
    countryOptions,
    stateOptions,
    cityOptions,
    stateCode,
    city,
    languageOptions,
    fallbackOptions,
    activeProviderCount,
    joinDate,
    emailDisplay,
    nameDisplay,

    // Toast (used directly inside JSX onChange handlers)
    showToast,

    // Accordion / search UI helpers
    filteredSections,
    isExpanded,
    toggleSection,
    highlightText,

    // Search input state (used by the page-shell search bar)
    query,
    setQuery,

    // Sidebar nav click handler (page-shell sidebar)
    handleSidebarClick,

    // Phase 6 Part 3 — Task 3: Reset + import/export
    handleResetSection,
    handleExportSettings,
    handleImportSettings,

    // Render helpers
    renderSegmented
  };

  return state;
}
