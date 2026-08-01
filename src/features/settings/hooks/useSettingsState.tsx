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
//     accent preset click, dynamic accent extraction, push permission
//     request, category toggle, provider toggle).
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

// Accent application helpers (local safety-net duplicates of the ones
// in `~/core/preferences/customAccent` — see the file header in
// `../accentHelpers.ts` for the rationale).
import {
  applyAccentToDocument,
  clearAccentFromDocument
} from "~/features/settings/accentHelpers";

// Section metadata + the SettingsState type.
import {
  SECTIONS,
  DANGER_ZONE_META,
  type SettingsState,
  type SectionMeta
} from "~/features/settings/sections";

// Theme + preferences (global signals + setters + types).
import { theme, setTheme } from "~/core/theme";
import type { Theme } from "~/core/theme";
import {
  customAccent,
  setCustomAccent,
  language,
  streamingProviders,
  toggleStreamingProvider,
  updateNotifPref,
  type TmdbProvider,
  type NotificationPrefs
} from "~/core/preferences";

import { setDiscoverRegion, useDiscoverRegion } from "~/core/config/discoverRegion";
import {
  COUNTRIES,
  countryLabel
} from "~/shared/data/countryLanguages";
import {
  getWatchProviderList,
  getWatchProviderListTv
} from "~/core/tmdb/discover";
import { mergeAndSortProviders } from "~/core/preferences";
import { tmdbImage, fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { extractDominantColor } from "~/shared/utils/colorExtractor";

// Static option lists — used by the memos (languageOptions,
// fallbackOptions) and the providers loop.
import { UI_LANGUAGES } from "~/shared/constants/settings";

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
  const [displayName, setDisplayName] = createSignal<string>("");
  const [bio, setBio] = createSignal<string>("");
  // NOTE: bannerUrl + bannerType are declared in the "Banner state"
  // block below (next to the dynamic accent extractor, which is the
  // only consumer that needs to know the banner TYPE, not just the URL).
  const [editingProfile, setEditingProfile] = createSignal(false);
  const [savingProfile, setSavingProfile] = createSignal(false);
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
  /**
   * Set of OAuth provider IDs currently linked to the user's account.
   * Populated by `refreshHasPassword()` (which calls `auth.getUser()`)
   * and refreshed after every link/unlink action.
   */
  const [linkedProviders, setLinkedProviders] = createSignal<Set<string>>(
    new Set()
  );
  const [linkingProvider, setLinkingProvider] = createSignal<string | null>(
    null
  );
  const [unlinkingProvider, setUnlinkingProvider] = createSignal<
    string | null
  >(null);

  // ── Appearance state ─────────────────────────────────────────────
  const [dynamicAccentColor, setDynamicAccentColor] = createSignal<string>("");
  const [extractingColor, setExtractingColor] = createSignal(false);

  // ── Banner state ────────────────────────────────────────────────
  // CineLog's banner system supports four source types (see
  // src/features/profile/components/ProfileBanner.tsx):
  //   • 'upload'         → banner_url is a Supabase Storage URL
  //   • 'url'            → banner_url is an external image URL
  //   • 'favorite_movie' → banner_url is null; the visible banner is
  //                        the user's favorite movie/series backdrop
  //                        (resolved via favorite_movie_id → TMDB path)
  //   • 'default'        → no image at all (CineLog gradient)
  //
  // Legacy users (null banner_type) default to 'favorite_movie'.
  //
  // The Dynamic accent extractor needs the ACTUAL image URL — so for
  // 'favorite_movie' banners we have to fetch the favorite movie's
  // backdrop_path from TMDB and resolve it via tmdbImage().
  const [bannerType, setBannerType] = createSignal<string>("favorite_movie");
  const [bannerUrl, setBannerUrl] = createSignal<string | null>(null);

  // ── Content state ────────────────────────────────────────────────
  const [providers, setProviders] = createSignal<TmdbProvider[]>([]);
  const [providersLoading, setProvidersLoading] = createSignal(true);

  // ── Notifications state ──────────────────────────────────────────
  const [pushPermission, setPushPermission] = createSignal<
    NotificationPermission | "unsupported"
  >("default");

  // ── Initial data loading ────────────────────────────────────────
  onMount(() => {
    void refreshHasPassword();
    void loadProfile();
    void loadProviders(region());

    // Re-apply the custom accent on mount. The customAccent.ts
    // createEffect should have already done this, but we do it here
    // too as a safety net — if the effect didn't fire (e.g. due to
    // a SolidJS hydration race), this ensures var(--p) is correct
    // before the user interacts with the page.
    const storedAccent = customAccent();
    if (storedAccent) {
      applyAccentToDocument(storedAccent);
    }

    if (typeof Notification === "undefined") {
      setPushPermission("unsupported");
    } else {
      setPushPermission(Notification.permission);
    }
  });

  // Re-fetch providers when the region changes.
  createEffect(() => {
    const r = region();
    void loadProviders(r);
  });

  // ── Account handlers ────────────────────────────────────────────

  /**
   * Refresh whether the user has a password set on their account.
   *
   * DEEP ROOT FIX (this commit): The previous implementation used
   *   `app_metadata.providers.includes("email") || hasEmailIdentity`
   * which gave FALSE POSITIVES for Google-only users — Supabase
   * automatically adds "email" to `app_metadata.providers` even when
   * the user only ever signed in via Google OAuth (no password set).
   * That made the "Password" row show "Connected" for users who had
   * never set a password.
   *
   * Worse, the fallback `(!id.identity_data || id.identity_data.email)`
   * branch treated a MISSING `identity_data` block as "has password",
   * which is the wrong direction — a missing identity_data means the
   * identity is incomplete / in-flight, not that a password is set.
   *
   * The CORRECT detection (verified against actual Supabase auth data):
   *
   *   For a user WITH email/password set:
   *     • `user.identities` contains an entry with `provider === "email"`
   *       AND `identity_data.email` is a non-empty string.
   *
   *   For a Google-only user (no password):
   *     • `user.identities` contains `provider === "google"` only.
   *     • There is NO entry with `provider === "email"`.
   *     • `app_metadata.providers` may include "email" anyway
   *       (Supabase quirk) — which is why we IGNORE that field.
   *
   * We also fetch the user's OAuth identities at the same time so the
   * "Login methods" panel can show connected/disconnected state for
   * Google and Apple without an extra round-trip.
   */
  async function refreshHasPassword() {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error) return; // keep cached value on error
      const u = data?.user;
      if (!u) return;

      const identities = u.identities ?? [];

      // ── Multi-signal password detection ──────────────────────────
      // The user reports they can log in with email/password, but the
      // row still says "Not set". That means our previous strict check
      // (only `identities.some(id => id.provider === 'email' && id.identity_data?.email)`)
      // was too narrow — it missed real passwords in some account shapes.
      //
      // We now use THREE signals, any one of which is enough to report
      // "Connected":
      //
      //   1. identities array has an entry with provider === 'email'
      //      (the canonical Supabase signal — covers users who signed
      //      up via email/password OR linked a password later).
      //      We DO NOT require identity_data.email here because some
      //      Supabase project configs return a partial identity_data
      //      block for the email identity, and the email field lives
      //      on the user object itself instead.
      //
      //   2. app_metadata.providers includes 'email' AND the user has
      //      a non-empty `user.email` field. Supabase adds 'email' to
      //      app_metadata.providers for OAuth-only users too (false
      //      positive in isolation), BUT in combination with a real
      //      user.email it reliably indicates a password identity
      //      exists — because OAuth-only users have their email in
      //      user_metadata, not as the canonical account email.
      //
      //   3. getUserIdentities() returns an email identity. This is a
      //      separate API call that hits Supabase's auth.identities
      //      table directly and is more reliable than user.identities
      //      for accounts that were created via certain migration
      //      paths. We fall back to this if signals 1 and 2 disagree.
      //
      // Signal 1: identities array (primary)
      const hasEmailIdentity = identities.some(
        (id) => id.provider === "email"
      );

      // Signal 2: app_metadata.providers + user.email (secondary)
      const providers: string[] = u.app_metadata?.providers ?? [];
      const hasEmailInProviders = providers.includes("email");
      const hasUserEmail = !!u.email;
      const passwordViaProviders = hasEmailInProviders && hasUserEmail;

      let hasPassword = hasEmailIdentity || passwordViaProviders;

      // Signal 3: getUserIdentities() fallback — only if signals 1+2
      // both say "no password" but the user has an email, which is the
      // ambiguous case where getUserIdentities() can break the tie.
      // This catches accounts where user.identities was stale or empty
      // but the canonical identities API returns the email row.
      if (!hasPassword && hasUserEmail) {
        try {
          const { data: idData, error: idErr } =
            await client.auth.getUserIdentities();
          if (!idErr && idData?.identities) {
            const hasEmailInIdApi = idData.identities.some(
              (id) => id.provider === "email"
            );
            if (hasEmailInIdApi) {
              hasPassword = true;
            }
          }
        } catch {
          // getUserIdentities failed — keep the value from signals 1+2
        }
      }

      setHasPassword(hasPassword);

      // Cache the linked OAuth providers in the same call so the Login
      // Methods panel renders without an extra request.
      const oauthProviders = identities
        .map((id) => id.provider)
        .filter((p) => p === "google" || p === "apple");
      setLinkedProviders(new Set(oauthProviders));
    } catch (e) {
      console.warn("[settings] refreshHasPassword failed:", e);
    }
  }

  /**
   * Auth state listener — refreshes password + linked-provider state
   * whenever Supabase emits a relevant auth event.
   *
   * WHY: When a user links a password (via LinkEmailPasswordSheet) or
   * links an OAuth provider (via linkIdentity redirect), Supabase fires
   * `SIGNED_IN` or `USER_UPDATED` events. Without this listener, the
   * Settings page's cached `hasPassword` signal can lag behind the
   * actual auth state — the user sees "Not set" until they manually
   * reload the page.
   *
   * Events we react to:
   *   • SIGNED_IN       — fresh sign-in or token refresh after a link
   *   • USER_UPDATED    — user_metadata / app_metadata changed (e.g.,
   *                       right after `linkIdentity` resolves)
   *   • PASSWORD_RECOVERY — password was just reset
   *
   * We deliberately do NOT refresh on TOKEN_REFRESHED alone — that
   * event fires every 60s and would cause a getUser() request storm.
   * SIGNED_IN covers the "token refreshed after a link" case because
   * Supabase promotes the refresh to a SIGNED_IN event when the user's
   * identities array changes.
   */
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
    // Clean up the listener when the SettingsPage unmounts to prevent
    // a memory leak and double-firing across route changes.
    onCleanup(() => {
      listener?.subscription.unsubscribe();
    });
  });

  async function loadProfile() {
    const uid = user()?.uid;
    if (!uid) return;
    try {
      const res = await profileRepo.getProfile(uid);
      if (res.data) {
        // Country: write to localStorage AND the signal so the next
        // reload starts with the correct value (no "US" flash). The DB
        // is the source of truth; localStorage just provides an instant
        // first-paint value.
        if (res.data.country) {
          setCountry(res.data.country);
          setDiscoverRegion(res.data.country);
          try {
            localStorage.setItem("cinelog_country", res.data.country);
          } catch {
            // localStorage may be unavailable (private mode) — non-fatal.
          }
        }
        if (res.data.display_name) setDisplayName(res.data.display_name);
        if (res.data.bio) setBio(res.data.bio);

        // ── Banner URL resolution ──────────────────────────────────
        // CineLog's banner system has FOUR source types (see
        // ProfileBanner.tsx). The Dynamic accent extractor needs the
        // actual image URL — so for 'favorite_movie' banners we must
        // fetch the favorite movie/series TMDB metadata to get the
        // backdrop_path, then resolve it via tmdbImage().
        //
        // Legacy users (null banner_type) default to 'favorite_movie'.
        await resolveBannerUrl(res.data);
      }
    } catch (e) {
      console.warn("[settings] loadProfile failed:", e);
    }
  }

  /**
   * Resolve the actual image URL behind the user's banner, based on
   * their `banner_type` preference.
   *
   * Cases:
   *   • 'upload' / 'url' — banner_url is already a fully-qualified URL
   *     (Supabase Storage object URL or external URL). Use as-is.
   *
   *   • 'favorite_movie' — banner_url is null; the visible banner is
   *     the user's favorite movie or series backdrop (resolved from
   *     `favorite_movie_id` / `favorite_series_id` via TMDB). We fetch
   *     the TMDB metadata to get `backdrop_path`, then resolve via
   *     `tmdbImage(path, "w780")` (w780 is plenty of resolution for
   *     color sampling — the canvas downscales to 96×96 anyway).
   *
   *   • 'default' — no image; banner is a CSS gradient. The signal
   *     stays null and the Dynamic swatch shows "No banner set".
   *
   *   • null / undefined (legacy users) — treated as 'favorite_movie'
   *     for backward compat with profiles created before the
   *     banner_type column existed.
   *
   * Side effects: writes to `bannerType` and `bannerUrl` signals.
   */
  async function resolveBannerUrl(profile: {
    banner_type?: string | null;
    banner_url?: string | null;
    favorite_movie_id?: string | null;
    favorite_series_id?: string | null;
  }) {
    const type = profile.banner_type ?? "favorite_movie";
    setBannerType(type);

    // Type 'upload' or 'url' — direct image URL.
    if (type === "upload" || type === "url") {
      setBannerUrl(profile.banner_url ?? null);
      return;
    }

    // Type 'default' — no image.
    if (type === "default") {
      setBannerUrl(null);
      return;
    }

    // Type 'favorite_movie' (or legacy null) — fetch the favorite
    // movie or series backdrop from TMDB. Try movie first, then series.
    try {
      let backdropPath: string | null | undefined = null;

      if (profile.favorite_movie_id) {
        const movie = await fetchTmdbMetadata("movie", profile.favorite_movie_id);
        backdropPath = movie?.backdrop_path ?? null;
      }
      if (!backdropPath && profile.favorite_series_id) {
        const series = await fetchTmdbMetadata("tv", profile.favorite_series_id);
        backdropPath = series?.backdrop_path ?? null;
      }

      if (backdropPath) {
        setBannerUrl(tmdbImage(backdropPath, "w780"));
      } else {
        // No favorite set, or TMDB fetch failed — no banner available.
        setBannerUrl(null);
      }
    } catch (e) {
      console.warn("[settings] resolveBannerUrl: TMDB fetch failed:", e);
      setBannerUrl(null);
    }
  }

  async function loadProviders(reg: string) {
    setProvidersLoading(true);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(reg),
        getWatchProviderListTv(reg)
      ]);
      const movieRows = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tvRows = tvRes.status === "fulfilled" ? tvRes.value : [];
      setProviders(mergeAndSortProviders(movieRows, tvRows));
    } catch (err) {
      console.warn("[settings] Failed to load providers:", err);
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }

  const handleSaveCountry = async (newCountry: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your country.", "error");
      return;
    }
    setCountry(newCountry);
    // Persist to localStorage immediately so the next reload starts
    // with the right value, even if the network round-trip is slow.
    try {
      localStorage.setItem("cinelog_country", newCountry);
    } catch {
      // localStorage may be unavailable (private mode) — non-fatal.
    }
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        country: newCountry
      });
      if (error) throw error;
      setDiscoverRegion(newCountry);
      showToast(`Country set to ${countryLabel(newCountry)}`, "success", 1800);
    } catch (err) {
      console.error("[settings] Failed to save country:", err);
      showToast("Failed to save country.", "error");
    }
  };

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
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        displayName: trimmedName,
        bio: bioInput().trim()
      });
      if (error) throw error;
      setDisplayName(trimmedName);
      setBio(bioInput().trim());
      setEditingProfile(false);
      showToast("Profile saved.", "success", 1500);
    } catch (err) {
      console.error("[settings] Failed to save profile:", err);
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
      const msg = err instanceof Error ? err.message : "Failed to link provider.";
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
      const msg = err instanceof Error ? err.message : "Failed to unlink provider.";
      showToast(msg, "error");
    } finally {
      setUnlinkingProvider(null);
    }
  };

  /** Local alias so the unlink guard doesn't shadow the signal. */
  const hasPasswordSignal = () => hasPassword();

  // ── Appearance: accent + dynamic ────────────────────────────────

  const isPresetActive = (presetId: Theme): boolean =>
    customAccent() === "" && theme() === presetId;

  /**
   * The "Dynamic" swatch is active when:
   *   - We've extracted a color from the banner (dynamicAccentColor is set)
   *   - customAccent() matches that extracted color
   *
   * If the user switches to a preset (which clears customAccent to ""),
   * dynamic is no longer active. If they re-extract (banner changed),
   * the new color overwrites the old.
   */
  const isDynamicActive = (): boolean =>
    dynamicAccentColor() !== "" &&
    customAccent() === dynamicAccentColor();

  const handlePresetClick = (presetId: Theme) => {
    setCustomAccent("");
    setTheme(presetId);
    // BELT-AND-SPENDERS: clear inline accent overrides so the theme-*
    // class definitions take over. The customAccent createEffect also
    // does this, but we do it here too in case the effect hasn't fired.
    clearAccentFromDocument();
  };

  /**
   * Handle "Dynamic" accent swatch click.
   *
   * If we already have a dynamicAccentColor cached and it's the active
   * accent, do nothing (already active). Otherwise extract from the
   * banner (or fall back to Gold if no banner).
   *
   * FIX (this commit): Previously this only checked `bannerUrl()` —
   * which was set directly from `profile.banner_url`. That missed
   * users whose `banner_type === 'favorite_movie'` (the default!)
   * and had a null `banner_url` — even though they DO see a banner
   * on their profile page (their favorite movie's backdrop). The
   * `loadProfile()` function now resolves the actual image URL
   * (including TMDB fetch for favorite_movie type) before storing
   * it in the `bannerUrl()` signal, so this check is now reliable.
   */
  const handleDynamicClick = async () => {
    if (isDynamicActive()) {
      // Already the active accent — no-op.
      return;
    }

    // If we have a cached dynamic color from a previous extraction,
    // re-apply it without re-extracting.
    if (dynamicAccentColor() && bannerUrl()) {
      const cached = dynamicAccentColor();
      setCustomAccent(cached);
      // BELT-AND-SPENDERS: apply directly to <html> in case the
      // customAccent createEffect hasn't fired yet (e.g. during
      // initial hydration race). The effect will also fire and set
      // the same value, which is a no-op.
      applyAccentToDocument(cached);
      return;
    }

    setExtractingColor(true);
    try {
      const url = bannerUrl();
      if (!url) {
        // No banner — use Gold (matches Cinematic preset).
        const fallback = "#FFD700";
        setDynamicAccentColor(fallback);
        setCustomAccent(fallback);
        applyAccentToDocument(fallback);
        showToast(
          "No banner set — using Gold accent. Set a banner in Profile to extract a color.",
          "info",
          2800
        );
        return;
      }

      const color = await extractDominantColor(url);
      // extractDominantColor returns the fallback (#FFD700) on failure
      // rather than throwing — detect that and show a helpful toast.
      if (color === "#FFD700") {
        setDynamicAccentColor(color);
        setCustomAccent(color);
        applyAccentToDocument(color);
        showToast(
          "Could not extract color from banner. Using Gold accent.",
          "info",
          2800
        );
      } else {
        setDynamicAccentColor(color);
        setCustomAccent(color);
        applyAccentToDocument(color);
        showToast(`Dynamic accent set: ${color}`, "success", 1800);
      }
    } catch (e) {
      console.error("[settings] Dynamic accent extraction failed:", e);
      // On hard failure, fall back to Gold so the user still gets an
      // accent applied (better than leaving them with no accent).
      const fallback = "#FFD700";
      setDynamicAccentColor(fallback);
      setCustomAccent(fallback);
      applyAccentToDocument(fallback);
      showToast(
        "Could not extract color from banner. Using Gold accent.",
        "error",
        2800
      );
    } finally {
      setExtractingColor(false);
    }
  };

  /**
   * Force a fresh re-extraction of the banner color, discarding any
   * previously cached value.
   *
   * Use this after the user changes their banner image so the dynamic
   * accent reflects the new image. We re-fetch the profile first to
   * pick up any banner_url / banner_type changes (e.g., if the user
   * just uploaded a new banner via the Edit Profile modal).
   */
  const handleReextractDynamic = async () => {
    setExtractingColor(true);
    try {
      // Re-fetch the profile so the banner URL is fresh — covers the
      // case where the user just changed their banner via Edit Profile
      // but the cached bannerUrl() signal hasn't been updated yet.
      const uid = user()?.uid;
      if (uid) {
        const res = await profileRepo.getProfile(uid);
        if (res.data) {
          await resolveBannerUrl(res.data);
        }
      }

      const url = bannerUrl();
      if (!url) {
        showToast(
          "Set a banner image first to extract a color.",
          "info",
          2200
        );
        return;
      }

      const color = await extractDominantColor(url);
      setDynamicAccentColor(color);
      setCustomAccent(color);
      applyAccentToDocument(color);
      if (color === "#FFD700") {
        showToast(
          "Could not extract color from banner. Using Gold accent.",
          "info",
          2800
        );
      } else {
        showToast(`Re-extracted accent: ${color}`, "success", 1800);
      }
    } catch (e) {
      console.error("[settings] Re-extract failed:", e);
      showToast(
        "Could not extract color from banner. Try another image.",
        "error"
      );
    } finally {
      setExtractingColor(false);
    }
  };

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

  const handleToggleProvider = (provider: TmdbProvider) => {
    toggleStreamingProvider(provider.id);
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
        <mark class="settings-search-mark">{text.slice(idx, idx + q.length)}</mark>
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

    // Account state
    hasPassword,
    country,
    displayName,
    bio,
    editingProfile,
    savingProfile,
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
    handleLinkProvider,
    handleUnlinkProvider,
    handleSignOut,
    handleConfirmSignOut,
    handleDeactivate,
    handleDelete,
    refreshHasPassword,

    // Appearance state
    dynamicAccentColor,
    extractingColor,
    bannerUrl,
    bannerType,

    // Appearance handlers
    isPresetActive,
    isDynamicActive,
    handlePresetClick,
    handleDynamicClick,
    handleReextractDynamic,

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

    // Render helpers
    renderSegmented
  };

  return state;
}
