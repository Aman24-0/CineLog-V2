// src/routes/settings/account.tsx
import { Title } from "@solidjs/meta";
import { Show, For, createMemo, createSignal, createEffect, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { useAuth } from "~/shared/hooks/useAuth";
import { signOut } from "~/shared/hooks/useAuthActions";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { useToast } from "~/shared/hooks/useToast";
import { setDiscoverRegion } from "~/core/config/discoverRegion";
import {
  COUNTRIES,
  countryLabel,
  findCountry,
  DEFAULT_COUNTRY_CODE,
} from "~/shared/data/countryLanguages";

/** All auth providers CineLog supports, with display metadata. */
const ALL_PROVIDERS: { id: string; label: string; icon: string }[] = [
  { id: "google", label: "Google", icon: "login" },
  { id: "email", label: "Email & Password", icon: "mail" },
  { id: "github", label: "GitHub", icon: "code" },
  { id: "apple", label: "Apple", icon: "apple" },
];

const AccountRoute: Component = () => {
  const { user, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const profileRepo = useProfile();
  const { showToast } = useToast();

  // Local copy of the country — initialised from the profile row.
  // We keep a local signal so the dropdown feels instant even before
  // the Supabase write resolves; we re-sync when the profile loads.
  const [country, setCountry] = createSignal<string>(DEFAULT_COUNTRY_CODE);
  const [savingCountry, setSavingCountry] = createSignal(false);

  // Load the profile row to get the user's saved country. We do this
  // client-side because the page is already client-only (auth-gated).
  createEffect(() => {
    const uid = user()?.uid;
    if (!uid) return;
    void profileRepo.getProfile(uid).then((res) => {
      if (res.data?.country) {
        setCountry(res.data.country);
        // Keep the discoverRegion module in sync so the Discover /
        // Upcoming pages pick up the right region on next mount.
        setDiscoverRegion(res.data.country);
      }
    });
  });

  const handleSaveCountry = async (newCountry: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your country.", "error");
      return;
    }
    setCountry(newCountry);
    setSavingCountry(true);
    try {
      // 1. Persist to the profile row.
      const { error } = await profileRepo.updateProfile(uid, { country: newCountry });
      if (error) throw error;
      // 2. Update the in-memory discoverRegion so Discover / Upcoming
      //    pages re-fetch with the new region on next mount.
      setDiscoverRegion(newCountry);
      showToast(`Country set to ${countryLabel(newCountry)}`, "success", 1800);
    } catch (err) {
      console.error("[account] Failed to save country:", err);
      showToast("Failed to save country. Try again.", "error");
    } finally {
      setSavingCountry(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  // Read the actual linked providers from the Supabase user object.
  // This is the SINGLE source of truth — NOT hardcoded values.
  const linkedProviders = (): Set<string> => {
    const providers = user()?.providers ?? [];
    return new Set(providers);
  };

  // Determine which provider is "primary" — the first one in the list.
  const primaryProvider = (): string | null => {
    const providers = user()?.providers ?? [];
    return providers.length > 0 ? providers[0] : null;
  };

  // Format the join date from createdAt.
  const joinDate = (): string => {
    const created = user()?.createdAt;
    if (!created) return "Unknown";
    try {
      return new Date(created).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const infoRows = [
    { icon: "email", label: "Email", value: () => user()?.email ?? "Not available" },
    { icon: "person", label: "Name", value: () => user()?.displayName ?? "Not set" },
    { icon: "badge", label: "User ID", value: () => (user()?.uid ? user()!.uid.slice(0, 8) + "…" : "Not available") },
    { icon: "event", label: "Joined", value: () => joinDate() },
  ];

  // Country display label (flag-style chip in the row chevron slot).
  const countryChip = createMemo(() => {
    const c = findCountry(country());
    return c ? c.label : country();
  });

  return (
    <>
      <Title>CineLog — Account</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          {/* Header */}
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Account</h1>
            <p class="sec-subtitle">Your identity, providers, country, and session.</p>
          </div>

          <div class="sec-body">
            <Show when={isSignedIn()} fallback={
              <div class="empty-premium" role="status">
                <div class="empty-premium-icon" aria-hidden="true">
                  <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                    account_circle
                  </span>
                </div>
                <h3 class="empty-premium-title">Not signed in</h3>
                <p class="empty-premium-body">Sign in to manage your account.</p>
              </div>
            }>
              {/* Account info */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <p class="sec-section-label">Account Info</p>
                <div class="setting-group">
                  <For each={infoRows}>
                    {(row) => (
                      <div class="setting-row" style={{ cursor: "default" }}>
                        <div class="setting-row-icon" aria-hidden="true">
                          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                            {row.icon}
                          </span>
                        </div>
                        <div class="setting-row-text">
                          <span class="setting-row-label">{row.label}</span>
                          <span class="setting-row-desc">{row.value()}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </section>

              {/* Country selector — drives Discover + Upcoming regional
                  filtering. Persists to profile.country and updates the
                  in-memory discoverRegion so the next navigation
                  re-fetches with the new region. */}
              <section class="sec-section">
                <p class="sec-section-label">Country</p>
                <div class="setting-group">
                  <div class="setting-row" style={{ cursor: "default", "align-items": "center" }}>
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        public
                      </span>
                    </div>
                    <div class="setting-row-text" style={{ flex: 1, "min-width": 0 }}>
                      <span class="setting-row-label">Country</span>
                      <span class="setting-row-desc">
                        Drives regional content in Discover and Upcoming.
                        Titles not available in your country are hidden
                        from Upcoming but remain searchable in Discover.
                      </span>
                      <div class="country-selector-row" style={{ "margin-top": "var(--sp-2)" }}>
                        <select
                          value={country()}
                          onChange={(e) => handleSaveCountry(e.currentTarget.value)}
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
                            style={{ "font-size": "16px", color: "var(--p)", animation: "spin 1s linear infinite" }}
                            aria-hidden="true"
                          >
                            progress_activity
                          </span>
                        </Show>
                      </div>
                    </div>
                    <Show when={country() && country() !== DEFAULT_COUNTRY_CODE}>
                      <span class="country-flag-chip" aria-hidden="true">{countryChip()}</span>
                    </Show>
                  </div>
                </div>
              </section>

              {/* Connected providers — reads from actual Supabase auth identities */}
              <section class="sec-section">
                <p class="sec-section-label">Connected Providers</p>
                <div class="setting-group">
                  <For each={ALL_PROVIDERS}>
                    {(provider) => {
                      const linked = linkedProviders().has(provider.id);
                      const primary = primaryProvider() === provider.id;
                      return (
                        <div class="setting-row" style={{ cursor: "default" }}>
                          <div class="setting-row-icon" aria-hidden="true">
                            <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                              {provider.icon}
                            </span>
                          </div>
                          <div class="setting-row-text">
                            <span class="setting-row-label">{provider.label}</span>
                            <span class="setting-row-desc">
                              {linked
                                ? primary
                                  ? "Primary sign-in method"
                                  : "Linked to your account"
                                : "Not connected"}
                            </span>
                          </div>
                          <Show when={linked && primary}>
                            <span class="setting-row-value" style={{ color: "var(--p)" }}>Primary</span>
                          </Show>
                          <Show when={linked && !primary}>
                            <span class="setting-row-value" style={{ color: "#4ade80" }}>Connected</span>
                          </Show>
                          <Show when={!linked}>
                            <span class="setting-row-value">Available</span>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </section>

              {/* Security */}
              <section class="sec-section">
                <p class="sec-section-label">Security</p>
                <div class="setting-group">
                  <div class="setting-row" style={{ cursor: "default" }}>
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        lock
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Password</span>
                      <span class="setting-row-desc">Managed via Supabase Auth</span>
                    </div>
                    <Show when={linkedProviders().has("email")} fallback={
                      <span class="setting-row-value">OAuth only</span>
                    }>
                      <span class="setting-row-value" style={{ color: "#4ade80" }}>Secured</span>
                    </Show>
                  </div>
                </div>
              </section>

              {/* Session — Sign Out is LAST */}
              <section class="sec-section">
                <p class="sec-section-label">Session</p>
                <div class="setting-group">
                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={handleSignOut}
                    aria-label="Sign out of your account"
                  >
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        logout
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Sign Out</span>
                      <span class="setting-row-desc">End your session on this device</span>
                    </div>
                    <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">logout</span>
                  </button>
                </div>
              </section>
            </Show>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default AccountRoute;
