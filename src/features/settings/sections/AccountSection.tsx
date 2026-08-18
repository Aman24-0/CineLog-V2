// src/features/settings/sections/AccountSection.tsx
//
// Account section — profile, email, password, 2FA, sessions, login
// methods, sign out. Pure JSX extractor: receives the `SettingsState`
// bag and renders the section. All state lives in `SettingsPage.tsx`.
//
// What lives here:
//   • The outer `<Show when={filteredSections().some(id === "account")}>`
//     visibility filter (driven by the search bar).
//   • The accordion header (title, description, chevron) — uses
//     `s.isExpanded("account")`, `s.toggleSection("account")`, and
//     `s.highlightText(...)` for the search-markup helper.
//   • The inner panel: profile (inline-edit), email, password, country,
//     joined date, 2FA, login methods (Google OAuth link/unlink),
//     sessions, login history, sign out.
//
// Sheets (UpdateEmailSheet, ChangePasswordSheet, etc.) are NOT rendered
// here — they're rendered at the SettingsPage root so they overlay
// correctly. This section only controls their `open` state via the
// setters in the state bag.

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import TwoFactorSetup from "~/features/settings/components/TwoFactorSetup";
import SessionList from "~/features/settings/components/SessionList";
import LoginHistoryList from "~/features/settings/components/LoginHistoryList";
import { SelectRow } from "~/features/settings/sharedControls";
import { MutationButton } from "~/shared/ui/states";

export function AccountSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "account")}>
      <section
        id="section-account"
        class="settings-accordion-section"
      >
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("account")}
          aria-expanded={s.isExpanded("account")}
          aria-controls="panel-account"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
          >
            manage_accounts
          </span>
          <div class="settings-accordion-meta">
            <span class="settings-accordion-title">
              {s.highlightText("Account")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Profile, security, 2FA, sessions")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("account")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("account")}>
          <div id="panel-account" class="settings-accordion-panel">
            <div class="setting-group">
              {/* Profile row — opens inline edit */}
              <Show when={s.isSignedIn()}>
                {/* Display name + bio — inline editable */}
                <Show
                  when={!s.editingProfile()}
                  fallback={
                    <div
                      class="setting-row"
                      style={{
                        cursor: "default",
                        "flex-direction": "column",
                        "align-items": "stretch",
                        gap: "var(--sp-2)"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "var(--sp-3)"
                        }}
                      >
                        <div
                          class="setting-row-icon"
                          aria-hidden="true"
                        >
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
                          <span class="setting-row-label">
                            Profile
                          </span>
                          <span class="setting-row-desc">
                            Name, bio, and avatar.
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          "flex-direction": "column",
                          gap: "var(--sp-2)",
                          padding: "0 var(--sp-3)"
                        }}
                      >
                        <input
                          type="text"
                          value={s.nameInput()}
                          onInput={(e) =>
                            s.setNameInput(e.currentTarget.value)
                          }
                          placeholder="Display name"
                          maxlength={60}
                          class="custom-hex-input focus-ring"
                          aria-label="Display name"
                        />
                        <textarea
                          value={s.bioInput()}
                          onInput={(e) =>
                            s.setBioInput(e.currentTarget.value)
                          }
                          placeholder="Bio (optional)"
                          maxlength={160}
                          rows={2}
                          class="custom-hex-input focus-ring"
                          style={{
                            resize: "vertical",
                            "font-family": "'Outfit', sans-serif"
                          }}
                          aria-label="Bio"
                        />
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--sp-2)"
                          }}
                        >
                          <MutationButton
                            status={s.saveProfileStatus()}
                            onClick={() => void s.handleSaveProfile()}
                            idleLabel="Save"
                            submittingLabel="Saving…"
                            successLabel="Saved!"
                            errorLabel="Failed"
                            variant="primary"
                          />
                          <button
                            type="button"
                            class="settings-link-btn focus-ring"
                            onClick={s.handleCancelEditProfile}
                            disabled={s.savingProfile()}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    class="setting-row focus-ring"
                    onClick={s.handleStartEditProfile}
                    aria-label="Edit profile"
                  >
                    <div
                      class="setting-row-icon"
                      aria-hidden="true"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        person
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Profile</span>
                      <span class="setting-row-desc">
                        {s.nameDisplay()}
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

                {/* Email */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() => s.setShowEmailSheet(true)}
                  aria-label="Update email"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      mail
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Email</span>
                    <span class="setting-row-desc">
                      {s.emailDisplay()}
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </button>

                {/* Password — "Connected" or "Not set" */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() =>
                    s.hasPassword()
                      ? s.setShowPasswordSheet(true)
                      : s.setShowLinkEmailPasswordSheet(true)
                  }
                  aria-label="Password settings"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      lock
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">Password</span>
                    <span class="setting-row-desc">
                      {s.hasPassword() ? "Connected" : "Not set"}
                    </span>
                  </div>
                  <span
                    class="setting-row-value"
                    style={{
                      color: s.hasPassword()
                        ? "#4ade80"
                        : "var(--text-muted)"
                    }}
                  >
                    {s.hasPassword() ? "Connected" : "Set"}
                  </span>
                </button>

                {/* Country — inline select */}
                <SelectRow
                  icon="public"
                  label="Country"
                  desc="Affects Discover and Where-to-Watch."
                  value={s.country}
                  onChange={s.handleSaveCountry}
                  options={s.countryOptions()}
                />

                {/* Joined — read-only */}
                <div
                  class="setting-row"
                  style={{ cursor: "default" }}
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
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
                    <span class="setting-row-desc">
                      {s.joinDate()}
                    </span>
                  </div>
                </div>

                {/* 2FA */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() =>
                    s.setShow2FAPanel(!s.show2FAPanel())
                  }
                  aria-expanded={s.show2FAPanel()}
                  aria-label="Two-factor authentication"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
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
                      transform: s.show2FAPanel()
                        ? "rotate(180deg)"
                        : "none",
                      transition: "transform 200ms ease"
                    }}
                  >
                    expand_more
                  </span>
                </button>
                <Show when={s.show2FAPanel()}>
                  <div class="settings-expandable-panel">
                    <TwoFactorSetup />
                  </div>
                </Show>

                {/* Login methods — OAuth linking (Google, Apple) */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() =>
                    s.setShowLoginMethodsPanel(
                      !s.showLoginMethodsPanel()
                    )
                  }
                  aria-expanded={s.showLoginMethodsPanel()}
                  aria-label="Login methods"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      manage_accounts
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">
                      Login methods
                    </span>
                    <span class="setting-row-desc">
                      Connect Google or Apple for one-tap sign-in.
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                    style={{
                      transform: s.showLoginMethodsPanel()
                        ? "rotate(180deg)"
                        : "none",
                      transition: "transform 200ms ease"
                    }}
                  >
                    expand_more
                  </span>
                </button>
                <Show when={s.showLoginMethodsPanel()}>
                  <div class="settings-expandable-panel">
                    <div class="setting-group">
                      {/* Google */}
                      <div class="setting-row" style={{ cursor: "default" }}>
                        <div
                          class="setting-row-icon"
                          aria-hidden="true"
                        >
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "18px" }}
                            aria-hidden="true"
                          >
                            login
                          </span>
                        </div>
                        <div class="setting-row-text">
                          <span class="setting-row-label">
                            Google
                          </span>
                          <span class="setting-row-desc">
                            {s.linkedProviders().has("google")
                              ? "Connected — sign in with Google."
                              : "Not connected."}
                          </span>
                        </div>
                        <Show
                          when={s.linkedProviders().has("google")}
                          fallback={
                            <button
                              type="button"
                              class="settings-link-btn focus-ring"
                              onClick={() =>
                                void s.handleLinkProvider("google")
                              }
                              disabled={s.linkingProvider() !== null}
                            >
                              <Show
                                when={s.linkingProvider() === "google"}
                                fallback="+ Connect"
                              >
                                Connecting…
                              </Show>
                            </button>
                          }
                        >
                          <button
                            type="button"
                            class="settings-link-btn settings-link-btn-danger focus-ring"
                            onClick={() =>
                              void s.handleUnlinkProvider("google")
                            }
                            disabled={
                              s.unlinkingProvider() !== null
                            }
                          >
                            <Show
                              when={
                                s.unlinkingProvider() === "google"
                              }
                              fallback="Disconnect"
                            >
                              Removing…
                            </Show>
                          </button>
                        </Show>
                      </div>

                      {/* Apple OAuth provider removed in Phase 0/1
                          audit fix — [auth.external.apple] is
                          disabled in supabase/config.toml (no
                          Apple Developer credentials). Re-add
                          this block when credentials are
                          configured. */}
                    </div>
                  </div>
                </Show>

                {/* Sessions & devices */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() =>
                    s.setShowSessionsPanel(!s.showSessionsPanel())
                  }
                  aria-expanded={s.showSessionsPanel()}
                  aria-label="Sessions and devices"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      devices
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">
                      Sessions &amp; devices
                    </span>
                    <span class="setting-row-desc">
                      Sign out everywhere.
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                    style={{
                      transform: s.showSessionsPanel()
                        ? "rotate(180deg)"
                        : "none",
                      transition: "transform 200ms ease"
                    }}
                  >
                    expand_more
                  </span>
                </button>
                <Show when={s.showSessionsPanel()}>
                  <div class="settings-expandable-panel">
                    <SessionList />
                  </div>
                </Show>

                {/* Login history */}
                <button
                  type="button"
                  class="setting-row focus-ring"
                  onClick={() =>
                    s.setShowLoginHistoryPanel(
                      !s.showLoginHistoryPanel()
                    )
                  }
                  aria-expanded={s.showLoginHistoryPanel()}
                  aria-label="Login history"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "18px" }}
                      aria-hidden="true"
                    >
                      history
                    </span>
                  </div>
                  <div class="setting-row-text">
                    <span class="setting-row-label">
                      Login history
                    </span>
                    <span class="setting-row-desc">
                      Recent sign-ins.
                    </span>
                  </div>
                  <span
                    class="material-symbols-outlined setting-row-chevron"
                    aria-hidden="true"
                    style={{
                      transform: s.showLoginHistoryPanel()
                        ? "rotate(180deg)"
                        : "none",
                      transition: "transform 200ms ease"
                    }}
                  >
                    expand_more
                  </span>
                </button>
                <Show when={s.showLoginHistoryPanel()}>
                  <div class="settings-expandable-panel">
                    <LoginHistoryList />
                  </div>
                </Show>

                {/* Sign out (this device only) */}
                <button
                  type="button"
                  class="setting-row focus-ring setting-row-danger"
                  onClick={s.handleSignOut}
                  aria-label="Sign out of this device"
                >
                  <div
                    class="setting-row-icon"
                    aria-hidden="true"
                  >
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
              </Show>

              <Show when={!s.isSignedIn()}>
                <div
                  class="settings-empty-section"
                  role="status"
                >
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      "font-size": "32px",
                      color: "var(--p)"
                    }}
                  >
                    account_circle
                  </span>
                  <p>Sign in to manage your account.</p>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </section>
    </Show>
  );
}
