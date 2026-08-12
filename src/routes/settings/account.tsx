// src/routes/settings/account.tsx
//
// AccountRoute — the upgraded Account page.
//
// STRUCTURE (per spec):
//
//   ┌─ Account Details ─────────────────────────────────┐
//   │  • Name (editable inline)                         │
//   │  • Email address (tap → UpdateEmailSheet)         │
//   │  • Country setting (dropdown, drives Discover)    │
//   │  • Joined date (read-only)                        │
//   │  • Deactivate / Delete account                    │
//   └────────────────────────────────────────────────────┘
//
//   ┌─ Security ────────────────────────────────────────┐
//   │  A. Login methods                                 │
//   │     1. Email & Password                           │
//   │        • Update email                             │
//   │        • Change password                          │
//   │     2. Google — connect / disconnect              │
//   │     3. Apple — connect / disconnect               │
//   │  B. Two-factor authentication                       │
//   │  C. Session management (sign out everywhere)      │
//   │  D. Login history                                  │
//   └────────────────────────────────────────────────────┘
//
// Each row is a button — tapping it opens the relevant sheet or
// toggles the relevant state. The page reads the live `user()`
// signal from useAuth, so any change made inside a sheet
// immediately reflects back here.

import { Title } from "@solidjs/meta";
import {
  Show,
  For,
  createMemo,
  createSignal,
  createEffect,
  onMount,
  ErrorBoundary,
  type Component
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useAuth } from "~/shared/hooks/useAuth";
import { signOut } from "~/shared/hooks/useAuthActions";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { useToast } from "~/shared/hooks/useToast";
import { setDiscoverRegion } from "~/core/config/discoverRegion";
import {
  COUNTRIES,
  countryLabel,
  findCountry,
  DEFAULT_COUNTRY_CODE
} from "~/shared/data/countryLanguages";
import {
  linkProvider,
  unlinkProvider,
  getUserIdentities,
  type AccountActionResult
} from "~/features/account/accountActions";
import UpdateEmailSheet from "~/features/account/components/UpdateEmailSheet";
import ChangePasswordSheet from "~/features/account/components/ChangePasswordSheet";
import DeactivateAccountSheet from "~/features/account/components/DeactivateAccountSheet";
import ConfirmSignOutSheet from "~/features/account/components/ConfirmSignOutSheet";
import LinkEmailPasswordSheet from "~/features/account/components/LinkEmailPasswordSheet";
import TwoFactorSetup from "~/features/settings/components/TwoFactorSetup";
import SessionList from "~/features/settings/components/SessionList";
import LoginHistoryList from "~/features/settings/components/LoginHistoryList";
import { getClient as getSupabaseClient } from "~/lib/supabase/client";
import type { UserIdentity } from "@supabase/supabase-js";

/**
 * OAuth providers CineLog supports, with display metadata.
 *
 * GitHub is intentionally omitted — a movie/TV tracking app has no
 * reason to offer GitHub login. The Supabase project may still have
 * GitHub enabled server-side, but we don't expose it in the UI.
 *
 * Apple uses a custom inline SVG (see APPLE_ICON_SVG below) because
 * the Material Symbols font does not include an "apple" glyph — using
 * the icon name "apple" renders the literal text "apple" and overflows
 * the icon box.
 */
const OAUTH_PROVIDERS: {
  id: "google";
  label: string;
  icon: string;
}[] = [
  { id: "google", label: "Google", icon: "login" }
  // Apple was removed in the Phase 0/1 audit fix — the Supabase project
  // has [auth.external.apple] enabled = false and no Apple Developer
  // credentials are configured, so every "Connect Apple" click would
  // fail with a provider-not-enabled error. Re-add the entry here and
  // enable the provider in supabase/config.toml when credentials are
  // available.
];

// AppleIcon removed — Apple OAuth provider is disabled in
// supabase/config.toml (no Apple Developer credentials configured).
// When re-enabling Apple OAuth, restore both the OAUTH_PROVIDERS entry
// and the AppleIcon component above.

const AccountRoute: Component = () => {
  const { user, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const profileRepo = useProfile();
  const { showToast } = useToast();

  // ── Profile row state ───────────────────────────────────────────
  // Local mirrors of profile fields so the UI feels instant even
  // before the Supabase write resolves.
  const [country, setCountry] = createSignal<string>(DEFAULT_COUNTRY_CODE);
  const [savingCountry, setSavingCountry] = createSignal(false);
  const [displayName, setDisplayName] = createSignal<string>("");
  const [editingName, setEditingName] = createSignal(false);
  const [savingName, setSavingName] = createSignal(false);
  const [nameInput, setNameInput] = createSignal("");
  const [identities, setIdentities] = createSignal<UserIdentity[] | null>(null);
  const [linkingProvider, setLinkingProvider] = createSignal<string | null>(
    null
  );
  const [unLinkingProvider, setUnlinkingProvider] = createSignal<string | null>(
    null
  );

  // ── Email/password linkage state ─────────────────────────────────
  // The `user().providers` array tells us which providers are linked
  // (google, email, apple, etc.). It includes "email" when the user
  // signed up with email OR later linked a password. To be more
  // accurate and reactive (the cached providers list can lag behind
  // a fresh link), we also call supabase.auth.getUser() on mount and
  // after the LinkEmailPasswordSheet closes.
  const [hasPassword, setHasPassword] = createSignal<boolean>(
    isProviderLinkedInitial()
  );

  function isProviderLinkedInitial(): boolean {
    return (user()?.providers ?? []).includes("email");
  }

  // ── Sheet open state ────────────────────────────────────────────
  const [showEmailSheet, setShowEmailSheet] = createSignal(false);
  const [showPasswordSheet, setShowPasswordSheet] = createSignal(false);
  const [showLinkEmailPasswordSheet, setShowLinkEmailPasswordSheet] =
    createSignal(false);
  const [showDeactivateSheet, setShowDeactivateSheet] = createSignal(false);
  const [deactivateMode, setDeactivateMode] = createSignal<
    "deactivate" | "delete"
  >("deactivate");
  // Sign-out confirmation sheet — opens BEFORE the actual sign-out call
  // fires, so a misclick doesn't instantly log the user out.
  // (Global sign-out is handled by SessionList via revokeAllSessions.)
  const [showSignOutSheet, setShowSignOutSheet] = createSignal(false);

  // Expandable panels for 2FA, Sessions, and Login History.
  // Each can be toggled open/closed inline on the Account page.
  const [show2FAPanel, setShow2FAPanel] = createSignal(false);
  const [showSessionsPanel, setShowSessionsPanel] = createSignal(false);
  const [showLoginHistoryPanel, setShowLoginHistoryPanel] = createSignal(false);

  // Load the profile row to get country + display name.
  createEffect(() => {
    const uid = user()?.uid;
    if (!uid) return;
    void profileRepo.getProfile(uid).then((res) => {
      if (res.data?.country) {
        setCountry(res.data.country);
        setDiscoverRegion(res.data.country);
      }
      if (res.data?.display_name) {
        setDisplayName(res.data.display_name);
      }
    });
  });

  // Load the user's OAuth identities so we can show "Connected" /
  // "Disconnect" buttons for each provider. The `user().providers`
  // array tells us which providers are linked, but to UNLINK we
  // need the identity_id from the getUserIdentities() call.
  onMount(() => {
    void refreshIdentities();
    void refreshHasPassword();
  });

  /**
   * Refresh whether the user has a password set on their account.
   *
   * `user().providers` is cached in app_metadata and can lag behind a
   * fresh password-link. Calling supabase.auth.getUser() forces a fresh
   * fetch and lets us check the providers list AND whether the user has
   * a password set (via user.user_metadata + the providers list).
   *
   * Supabase adds "email" to app_metadata.providers as soon as a
   * password is linked, so we just check the fresh providers list.
   */
  async function refreshHasPassword() {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error) {
        // Don't update state on error — keep the cached value.
        return;
      }
      const providers: string[] = data?.user?.app_metadata?.providers ?? [];
      setHasPassword(providers.includes("email"));
    } catch (e) {
      console.warn("[account] refreshHasPassword failed:", e);
    }
  }

  const refreshIdentities = async () => {
    const ids = await getUserIdentities();
    setIdentities(ids);
  };

  // Helper: is the given provider currently linked?
  const isProviderLinked = (providerId: string): boolean => {
    const providers = user()?.providers ?? [];
    return providers.includes(providerId);
  };

  // Helper: find the UserIdentity for a given provider (for unlink).
  const identityForProvider = (providerId: string): UserIdentity | null => {
    const ids = identities();
    if (!ids) return null;
    return ids.find((i) => i.provider === providerId) ?? null;
  };

  // ── Handlers ────────────────────────────────────────────────────

  const handleSaveCountry = async (newCountry: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your country.", "error");
      return;
    }
    setCountry(newCountry);
    setSavingCountry(true);
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        country: newCountry
      });
      if (error) throw error;
      setDiscoverRegion(newCountry);
      showToast(`Country set to ${countryLabel(newCountry)}`, "success", 1800);
    } catch (err) {
      console.error("[account] Failed to save country:", err);
      showToast("Failed to save country. Try again.", "error");
    } finally {
      setSavingCountry(false);
    }
  };

  const handleStartEditName = () => {
    setNameInput(displayName() || user()?.displayName || "");
    setEditingName(true);
  };

  const handleSaveName = async () => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to update your name.", "error");
      return;
    }
    const trimmed = nameInput().trim();
    if (!trimmed) {
      showToast("Name can't be empty.", "error");
      return;
    }
    if (trimmed.length > 60) {
      showToast("Name is too long (max 60).", "error");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        displayName: trimmed
      });
      if (error) throw error;
      setDisplayName(trimmed);
      setEditingName(false);
      showToast("Name updated.", "success", 1500);
    } catch (err) {
      console.error("[account] Failed to save name:", err);
      showToast("Failed to save name. Try again.", "error");
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameInput("");
  };

  /** Connect a new OAuth provider (linkIdentity). */
  const handleLinkProvider = async (providerId: "google" | "apple") => {
    setLinkingProvider(providerId);
    // linkProvider redirects the browser — if it returns without
    // redirecting, something failed (toast already shown inside).
    const result: AccountActionResult = await linkProvider(providerId);
    setLinkingProvider(null);
    if (result.success) {
      // Page will reload on redirect — no further action needed.
      // If we somehow get here without a redirect, refresh identities.
      await refreshIdentities();
    }
  };

  /** Disconnect an OAuth identity (unlinkIdentity). */
  const handleUnlinkProvider = async (providerId: "google" | "apple") => {
    const identity = identityForProvider(providerId);
    if (!identity) {
      showToast(
        "Couldn't find that provider's identity. Refresh and try again.",
        "error"
      );
      return;
    }
    // Safety check: don't allow unlinking the LAST identity.
    const linkedCount = (user()?.providers ?? []).length;
    if (linkedCount <= 1) {
      showToast("You can't disconnect your last sign-in method.", "error");
      return;
    }
    setUnlinkingProvider(providerId);
    const result = await unlinkProvider(identity);
    setUnlinkingProvider(null);
    if (result.success) {
      await refreshIdentities();
    }
  };

  /**
   * Open the "Sign out?" confirmation sheet (local — this device only).
   * The actual signOut() call fires only after the user taps "Yes" in
   * the sheet. Prevents accidental sign-out from a misclick.
   */
  const handleSignOut = () => {
    setShowSignOutSheet(true);
  };

  /**
   * Called by ConfirmSignOutSheet when the user taps the confirm
   * button. Runs the actual sign-out (local only — global sign-out
   * is now handled by the SessionList component via revokeAllSessions).
   * Navigates to /discover on success.
   */
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

  const emailMasked = (): string => user()?.email ?? "Not set";
  const displayNameDisplay = (): string =>
    displayName() || user()?.displayName || "Not set";

  const countryChip = createMemo(() => {
    const c = findCountry(country());
    return c ? c.label : country();
  });



  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
          <div class="glass-empty-state" role="alert">
            <h3 class="glass-empty-state-title">Something went wrong</h3>
            <p class="glass-empty-state-body">{error.message}</p>
            <button
              class="btn-primary focus-ring"
              onClick={() => reset()}
              style={{ "margin-top": "var(--sp-2)" }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      <>
      <Title>CineLog — Account</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          {/* Header */}
          <div class="sec-header">
            <a
              href="/settings"
              class="sec-back focus-ring"
              aria-label="Back to settings"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px" }}
                aria-hidden="true"
              >
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Account</h1>
            <p class="sec-subtitle">
              Your identity, country, security, and sessions.
            </p>
          </div>

          <div class="sec-body">
            <Show
              when={isSignedIn()}
              fallback={
                <div class="glass-empty-state" role="status">
                  <div class="glass-empty-state-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "32px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      account_circle
                    </span>
                  </div>
                  <h3 class="glass-empty-state-title">Not signed in</h3>
                  <p class="glass-empty-state-body">
                    Sign in to manage your account.
                  </p>
                </div>
              }
            >
              {/* =================================================== */}
              {/* 1. ACCOUNT DETAILS                                   */}
              {/* =================================================== */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <p class="sec-section-label">Account Details</p>
                <div class="setting-group">
                  {/* A. Name — inline editable */}
                  <Show
                    when={!editingName()}
                    fallback={
                      <div
                        class="setting-row"
                        style={{ cursor: "default", "align-items": "center" }}
                      >
                        <div class="setting-row-icon" aria-hidden="true">
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "18px" }}
                            aria-hidden="true"
                          >
                            person
                          </span>
                        </div>
                        <div
                          class="setting-row-text"
                          style={{ flex: 1, "min-width": 0 }}
                        >
                          <span class="setting-row-label">Name</span>
                          <input
                            type="text"
                            value={nameInput()}
                            onInput={(e) => setNameInput(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveName();
                              if (e.key === "Escape") handleCancelEditName();
                            }}
                            placeholder="Your name"
                            maxlength={60}
                            class="account-inline-input"
                            aria-label="Edit your name"
                          />
                        </div>
                        <div class="account-inline-actions">
                          <button
                            type="button"
                            class="account-inline-btn account-inline-btn-ghost focus-ring"
                            onClick={handleCancelEditName}
                            disabled={savingName()}
                            aria-label="Cancel name edit"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="account-inline-btn account-inline-btn-primary focus-ring"
                            onClick={() => void handleSaveName()}
                            disabled={savingName() || !nameInput().trim()}
                            aria-label="Save name"
                          >
                            <Show when={savingName()} fallback="Save">
                              <span
                                class="material-symbols-outlined"
                                style={{
                                  "font-size": "13px",
                                  animation: "spin 1s linear infinite"
                                }}
                                aria-hidden="true"
                              >
                                progress_activity
                              </span>
                            </Show>
                          </button>
                        </div>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      class="setting-row focus-ring"
                      onClick={handleStartEditName}
                      aria-label="Edit your name"
                    >
                      <div class="setting-row-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "18px" }}
                          aria-hidden="true"
                        >
                          person
                        </span>
                      </div>
                      <div class="setting-row-text">
                        <span class="setting-row-label">Name</span>
                        <span class="setting-row-desc">
                          {displayNameDisplay()}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined setting-row-chevron"
                        aria-hidden="true"
                      >
                        edit
                      </span>
                    </button>
                  </Show>

                  {/* B. Email address — opens UpdateEmailSheet */}
                  <button
                    type="button"
                    class="setting-row focus-ring"
                    onClick={() => setShowEmailSheet(true)}
                    aria-label="Update email address"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        mail
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Email address</span>
                      <span class="setting-row-desc">{emailMasked()}</span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>

                  {/* C. Country setting — inline dropdown */}
                  <div
                    class="setting-row"
                    style={{ cursor: "default", "align-items": "center" }}
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        public
                      </span>
                    </div>
                    <div
                      class="setting-row-text"
                      style={{ flex: 1, "min-width": 0 }}
                    >
                      <span class="setting-row-label">Country</span>
                      <span class="setting-row-desc">
                        Drives regional content in Discover and Where-to-Watch.
                      </span>
                      <div
                        class="country-selector-row"
                        style={{ "margin-top": "var(--sp-2)" }}
                      >
                        <select
                          value={country()}
                          onChange={(e) =>
                            handleSaveCountry(e.currentTarget.value)
                          }
                          disabled={savingCountry()}
                          aria-label="Select your country"
                        >
                          <For each={COUNTRIES}>
                            {(c) => <option value={c.code}>{c.label}</option>}
                          </For>
                        </select>
                        <Show when={savingCountry()}>
                          <span
                            class="material-symbols-outlined"
                            style={{
                              "font-size": "16px",
                              color: "var(--p)",
                              animation: "spin 1s linear infinite"
                            }}
                            aria-hidden="true"
                          >
                            progress_activity
                          </span>
                        </Show>
                      </div>
                    </div>
                    <Show
                      when={country() && country() !== DEFAULT_COUNTRY_CODE}
                    >
                      <span class="country-flag-chip" aria-hidden="true">
                        {countryChip()}
                      </span>
                    </Show>
                  </div>

                  {/* D. Joined — read-only */}
                  <div class="setting-row" style={{ cursor: "default" }}>
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        event
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Joined</span>
                      <span class="setting-row-desc">{joinDate()}</span>
                    </div>
                  </div>

                  {/* E. Deactivate + Delete — destructive, two separate rows */}
                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={handleDeactivate}
                    aria-label="Deactivate account"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        block
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Deactivate account</span>
                      <span class="setting-row-desc">
                        Temporarily disable. Recovers within 7 days.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>

                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={handleDelete}
                    aria-label="Permanently delete account"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        delete_forever
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">
                        Permanently delete account
                      </span>
                      <span class="setting-row-desc">
                        Irreversible. Removes all your data.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>
                </div>
              </section>

              {/* =================================================== */}
              {/* 2. SECURITY                                          */}
              {/* =================================================== */}
              <section class="sec-section">
                <p class="sec-section-label">Security</p>
                <div class="setting-group">
                  {/* A. Login methods — header row (non-interactive) */}
                  <div
                    class="setting-row setting-row-subheader"
                    style={{ cursor: "default" }}
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        key
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Login methods</span>
                      <span class="setting-row-desc">
                        Manage how you sign in.
                      </span>
                    </div>
                  </div>

                  {/* A1. Email & Password — two action rows inside */}
                  <div
                    class="setting-row setting-row-nested"
                    style={{
                      cursor: "default",
                      "flex-direction": "column",
                      "align-items": "stretch",
                      gap: "0.5rem"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--sp-3)"
                      }}
                    >
                      <div class="setting-row-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "18px" }}
                          aria-hidden="true"
                        >
                          mail
                        </span>
                      </div>
                      <div class="setting-row-text">
                        <span class="setting-row-label">
                          Email &amp; Password
                        </span>
                        <span class="setting-row-desc">
                          {hasPassword()
                            ? "Connected"
                            : "Not connected"}
                        </span>
                      </div>
                      <Show
                        when={hasPassword()}
                        fallback={
                          <button
                            type="button"
                            class="account-connect-btn focus-ring"
                            onClick={() => setShowLinkEmailPasswordSheet(true)}
                            aria-label="Connect email and password"
                          >
                            <span
                              class="material-symbols-outlined"
                              style={{ "font-size": "14px" }}
                              aria-hidden="true"
                            >
                              add
                            </span>
                            Connect
                          </button>
                        }
                      >
                        <span
                          class="setting-row-value"
                          style={{ color: "#4ade80" }}
                        >
                          Connected
                        </span>
                      </Show>
                    </div>
                    {/* Two sub-action buttons — only visible when already linked */}
                    <Show when={hasPassword()}>
                      <div class="account-subactions">
                        <button
                          type="button"
                          class="account-subaction-btn focus-ring"
                          onClick={() => setShowEmailSheet(true)}
                        >
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "14px" }}
                            aria-hidden="true"
                          >
                            alternate_email
                          </span>
                          Update email
                        </button>
                        <button
                          type="button"
                          class="account-subaction-btn focus-ring"
                          onClick={() => setShowPasswordSheet(true)}
                        >
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "14px" }}
                            aria-hidden="true"
                          >
                            lock
                          </span>
                          Change password
                        </button>
                      </div>
                    </Show>
                  </div>

                  {/* A2/A3. OAuth providers — Google, Apple, GitHub */}
                  <For each={OAUTH_PROVIDERS}>
                    {(provider) => {
                      const linked = () => isProviderLinked(provider.id);
                      const isLinking = () => linkingProvider() === provider.id;
                      const isUnlinking = () =>
                        unLinkingProvider() === provider.id;
                      return (
                        <div
                          class="setting-row setting-row-nested"
                          style={{ cursor: "default", "align-items": "center" }}
                        >
                          <div class="setting-row-icon" aria-hidden="true">
                            <span
                              class="material-symbols-outlined"
                              style={{ "font-size": "18px" }}
                              aria-hidden="true"
                            >
                              {provider.icon}
                            </span>
                          </div>
                          <div class="setting-row-text">
                            <span class="setting-row-label">
                              {provider.label}
                            </span>
                            <span class="setting-row-desc">
                              {linked() ? "Connected" : "Not connected"}
                            </span>
                          </div>
                          <Show
                            when={linked()}
                            fallback={
                              <button
                                type="button"
                                class="account-connect-btn focus-ring"
                                onClick={() =>
                                  void handleLinkProvider(provider.id)
                                }
                                disabled={isLinking()}
                                aria-label={`Connect ${provider.label}`}
                              >
                                <Show
                                  when={isLinking()}
                                  fallback={
                                    <>
                                      <span
                                        class="material-symbols-outlined"
                                        style={{ "font-size": "14px" }}
                                        aria-hidden="true"
                                      >
                                        add
                                      </span>
                                      Connect
                                    </>
                                  }
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{
                                      "font-size": "14px",
                                      animation: "spin 1s linear infinite"
                                    }}
                                    aria-hidden="true"
                                  >
                                    progress_activity
                                  </span>
                                  Connecting…
                                </Show>
                              </button>
                            }
                          >
                            <button
                              type="button"
                              class="account-disconnect-btn focus-ring"
                              onClick={() =>
                                void handleUnlinkProvider(provider.id)
                              }
                              disabled={
                                isUnlinking() ||
                                (user()?.providers ?? []).length <= 1
                              }
                              aria-label={`Disconnect ${provider.label}`}
                              title={
                                (user()?.providers ?? []).length <= 1
                                  ? "You can't disconnect your last sign-in method."
                                  : `Disconnect ${provider.label}`
                              }
                            >
                              <Show
                                when={isUnlinking()}
                                fallback={
                                  <>
                                    <span
                                      class="material-symbols-outlined"
                                      style={{ "font-size": "14px" }}
                                      aria-hidden="true"
                                    >
                                      link_off
                                    </span>
                                    Disconnect
                                  </>
                                }
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{
                                    "font-size": "14px",
                                    animation: "spin 1s linear infinite"
                                  }}
                                  aria-hidden="true"
                                >
                                  progress_activity
                                </span>
                              </Show>
                            </button>
                          </Show>
                        </div>
                      );
                    }}
                  </For>

                  {/* B. 2FA — functional, expandable panel */}
                  <button
                    type="button"
                    class="setting-row focus-ring"
                    onClick={() => setShow2FAPanel(!show2FAPanel())}
                    aria-expanded={show2FAPanel()}
                    aria-label="Two-factor authentication"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        phonelink_lock
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">
                        Two-factor authentication
                      </span>
                      <span class="setting-row-desc">
                        Extra security at sign-in.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                      style={{
                        transform: show2FAPanel() ? "rotate(180deg)" : "none",
                        transition: "transform 200ms ease"
                      }}
                    >
                      expand_more
                    </span>
                  </button>
                  <Show when={show2FAPanel()}>
                    <div class="settings-expandable-panel">
                      <TwoFactorSetup />
                    </div>
                  </Show>

                  {/* C. Session management — expandable panel */}
                  <button
                    type="button"
                    class="setting-row focus-ring"
                    onClick={() => setShowSessionsPanel(!showSessionsPanel())}
                    aria-expanded={showSessionsPanel()}
                    aria-label="Session management"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        devices
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Sessions & devices</span>
                      <span class="setting-row-desc">
                        Manage active sessions and sign out everywhere.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                      style={{
                        transform: showSessionsPanel() ? "rotate(180deg)" : "none",
                        transition: "transform 200ms ease"
                      }}
                    >
                      expand_more
                    </span>
                  </button>
                  <Show when={showSessionsPanel()}>
                    <div class="settings-expandable-panel">
                      <SessionList />
                    </div>
                  </Show>

                  {/* D. Login history — functional, expandable panel */}
                  <button
                    type="button"
                    class="setting-row focus-ring"
                    onClick={() =>
                      setShowLoginHistoryPanel(!showLoginHistoryPanel())
                    }
                    aria-expanded={showLoginHistoryPanel()}
                    aria-label="Login history"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        history
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Login history</span>
                      <span class="setting-row-desc">
                        Recent sign-ins.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                      style={{
                        transform: showLoginHistoryPanel()
                          ? "rotate(180deg)"
                          : "none",
                        transition: "transform 200ms ease"
                      }}
                    >
                      expand_more
                    </span>
                  </button>
                  <Show when={showLoginHistoryPanel()}>
                    <div class="settings-expandable-panel">
                      <LoginHistoryList />
                    </div>
                  </Show>

                  {/* Sign out (this device only) — last in security */}
                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={handleSignOut}
                    aria-label="Sign out of this device"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        logout
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Sign out</span>
                      <span class="setting-row-desc">
                        End your session on this device.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>
                </div>
              </section>
            </Show>
          </div>
        </div>
      </PageContainer>

      {/* Sheets */}
      <UpdateEmailSheet
        open={showEmailSheet()}
        onClose={() => setShowEmailSheet(false)}
      />
      <ChangePasswordSheet
        open={showPasswordSheet()}
        onClose={() => setShowPasswordSheet(false)}
      />
      <LinkEmailPasswordSheet
        open={showLinkEmailPasswordSheet()}
        onClose={() => {
          setShowLinkEmailPasswordSheet(false);
          // Refresh password state — the cached providers list may not
          // reflect the new link until the next page load.
          void refreshHasPassword();
        }}
      />
      <DeactivateAccountSheet
        open={showDeactivateSheet()}
        mode={deactivateMode()}
        onClose={() => setShowDeactivateSheet(false)}
      />
      <ConfirmSignOutSheet
        open={showSignOutSheet()}
        mode="local"
        onConfirm={handleConfirmSignOut}
        onClose={() => setShowSignOutSheet(false)}
      />
    </>
    </ErrorBoundary>
  );
};

export default AccountRoute;
