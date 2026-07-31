// src/routes/settings/profile-preferences.tsx
//
// Profile & Preferences — name, country, language, fallback, default vault status.
//
// This page replaces the "Country" control that used to live on /settings/account,
// and adds the new language/fallback/default-status controls.
//
// All preferences are persisted via src/core/preferences.

import { Title } from "@solidjs/meta";
import {
  Show,
  createMemo,
  createSignal,
  createEffect,
  type Component
} from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import {
  ControlRow,
  Segmented,
  SelectRow
} from "~/features/settings/sharedControls";
import {
  COUNTRIES,
  countryLabel,
  DEFAULT_COUNTRY_CODE
} from "~/shared/data/countryLanguages";
import { setDiscoverRegion } from "~/core/config/discoverRegion";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { useToast } from "~/shared/hooks/useToast";
import { useAuth } from "~/shared/hooks/useAuth";
import {
  language,
  setLanguage,
  fallbackLanguage,
  setFallbackLanguage,
  defaultVaultStatus,
  setDefaultVaultStatus,
  type VaultStatus,
  type LanguageCode
} from "~/core/preferences";

const VAULT_STATUS_OPTIONS: { id: VaultStatus; label: string }[] = [
  { id: "Planned", label: "Planned" },
  { id: "Plan to Watch", label: "Plan to Watch" },
  { id: "Watching", label: "Watching" },
  { id: "Completed", label: "Completed" },
  { id: "Dropped", label: "Dropped" }
];

/**
 * Curated UI-language list — these are languages CineLog's UI is translated to
 * (or will be). For any other language, the UI stays English but TMDB metadata
 * is fetched in the chosen language.
 */
const UI_LANGUAGES: { code: LanguageCode; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" }
];

const ProfilePreferencesRoute: Component = () => {
  const { user } = useAuth();
  const profileRepo = useProfile();
  const { showToast } = useToast();

  // Local state mirrors of profile fields
  const [country, setCountry] = createSignal<string>(DEFAULT_COUNTRY_CODE);
  const [displayName, setDisplayName] = createSignal<string>("");
  const [nameInput, setNameInput] = createSignal("");
  const [editingName, setEditingName] = createSignal(false);
  const [savingName, setSavingName] = createSignal(false);
  const [savingCountry, setSavingCountry] = createSignal(false);

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
        setNameInput(res.data.display_name);
      }
    });
  });

  const handleSaveName = async () => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your name.", "error");
      return;
    }
    const trimmed = nameInput().trim();
    if (!trimmed) {
      showToast("Name cannot be empty.", "error");
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
      showToast("Display name saved.", "success", 1500);
    } catch (e) {
      console.error("[profile-prefs] Failed to save name:", e);
      showToast("Failed to save name. Try again.", "error");
    } finally {
      setSavingName(false);
    }
  };

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
    } catch (e) {
      console.error("[profile-prefs] Failed to save country:", e);
      showToast("Failed to save country. Try again.", "error");
    } finally {
      setSavingCountry(false);
    }
  };

  // Country options
  const countryOptions = createMemo(() =>
    COUNTRIES.map((c) => ({ value: c.code, label: c.label }))
  );

  // Language options — all UI languages
  const languageOptions = createMemo(() =>
    UI_LANGUAGES.map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  // Fallback language options — same list, but skip the primary language
  const fallbackOptions = createMemo(() =>
    UI_LANGUAGES.filter((l) => l.code !== language()).map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  return (
    <>
      <Title>CineLog — Profile & Preferences</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
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
            <h1 class="sec-title">Profile & Preferences</h1>
            <p class="sec-subtitle">
              How CineLog addresses you, and how content language is chosen.
            </p>
          </div>

          <div class="sec-body">
            {/* Display name */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Display Name</p>
              <div class="setting-group">
                <div class="setting-row-control">
                  <div class="setting-row-control-header">
                    <div class="setting-row-icon" aria-hidden="true">
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        person
                      </span>
                    </div>
                    <div class="setting-row-control-meta">
                      <span class="setting-row-control-label">Your name</span>
                      <span class="setting-row-control-desc">
                        Shown on your profile.
                      </span>
                    </div>
                  </div>
                  <Show
                    when={!editingName()}
                    fallback={
                      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                        <input
                          type="text"
                          class="custom-hex-input focus-ring"
                          style={{ flex: "1" }}
                          value={nameInput()}
                          onInput={(e) => setNameInput(e.currentTarget.value)}
                          placeholder="Your display name"
                          maxlength={50}
                          aria-label="Display name"
                        />
                        <button
                          type="button"
                          class="settings-link-btn focus-ring"
                          onClick={handleSaveName}
                          disabled={savingName()}
                        >
                          <Show when={!savingName()} fallback="Saving…">
                            <span
                              class="material-symbols-outlined"
                              style={{ "font-size": "14px" }}
                              aria-hidden="true"
                            >
                              save
                            </span>
                            Save
                          </Show>
                        </button>
                        <button
                          type="button"
                          class="settings-link-btn focus-ring"
                          onClick={() => {
                            setEditingName(false);
                            setNameInput(displayName());
                          }}
                          disabled={savingName()}
                        >
                          Cancel
                        </button>
                      </div>
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--sp-2)",
                        "align-items": "center",
                        "margin-top": "var(--sp-1)"
                      }}
                    >
                      <span
                        style={{
                          "font-family": "'Outfit', sans-serif",
                          "font-size": "0.9375rem",
                          "font-weight": 600,
                          color: "var(--text-strong)"
                        }}
                      >
                        {displayName() || "Not set"}
                      </span>
                      <button
                        type="button"
                        class="settings-link-btn focus-ring"
                        onClick={() => {
                          setNameInput(displayName());
                          setEditingName(true);
                        }}
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "14px" }}
                          aria-hidden="true"
                        >
                          edit
                        </span>
                        Edit
                      </button>
                    </div>
                  </Show>
                </div>
              </div>
            </section>

            {/* Country & Region */}
            <section class="sec-section">
              <p class="sec-section-label">Country & Region</p>
              <div class="setting-group">
                <SelectRow
                  icon="public"
                  label="Country"
                  desc="Affects Discover, Upcoming releases, and Where-to-watch."
                  value={country}
                  onChange={handleSaveCountry}
                  options={countryOptions()}
                />
                <Show when={savingCountry()}>
                  <div
                    style={{
                      padding: "0 var(--sp-5)",
                      color: "var(--text-muted)",
                      "font-size": "0.75rem"
                    }}
                  >
                    Saving…
                  </div>
                </Show>
              </div>
            </section>

            {/* Language */}
            <section class="sec-section">
              <p class="sec-section-label">Language</p>
              <div class="setting-group">
                <SelectRow
                  icon="translate"
                  label="Primary language"
                  desc="Used for movie/TV metadata (overviews, posters with text)."
                  value={language}
                  onChange={(v) => setLanguage(v)}
                  options={languageOptions()}
                />
                <SelectRow
                  icon="swap_horiz"
                  label="Fallback language"
                  desc="Used when a title has no content in your primary language."
                  value={fallbackLanguage}
                  onChange={(v) => setFallbackLanguage(v)}
                  options={fallbackOptions()}
                />
              </div>
            </section>

            {/* Default vault status */}
            <section class="sec-section">
              <p class="sec-section-label">Default Vault Status</p>
              <div class="setting-group">
                <ControlRow
                  icon="bookmark_add"
                  label="When you add a title to your vault"
                  desc="Status assigned to new titles automatically."
                >
                  <Segmented
                    options={VAULT_STATUS_OPTIONS}
                    current={defaultVaultStatus}
                    onChange={(id) => setDefaultVaultStatus(id)}
                    name="Default vault status"
                  />
                </ControlRow>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default ProfilePreferencesRoute;
