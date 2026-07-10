// src/routes/settings/account.tsx
import { Title } from "@solidjs/meta";
import { Show, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { useAuth } from "~/shared/hooks/useAuth";
import { signOut } from "~/shared/hooks/useAuthActions";

const AccountRoute: Component = () => {
  const { user, isSignedIn } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  const infoRows = [
    { icon: "email", label: "Email", value: () => user()?.email ?? "Not available" },
    { icon: "person", label: "Name", value: () => user()?.displayName ?? "Not set" },
    { icon: "badge", label: "User ID", value: () => (user()?.uid ? user()!.uid.slice(0, 8) + "…" : "Not available") },
  ];

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
            <p class="sec-subtitle">Your identity, providers, and session.</p>
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
                  {infoRows.map((row) => (
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
                  ))}
                </div>
              </section>

              {/* Connected providers */}
              <section class="sec-section">
                <p class="sec-section-label">Connected Providers</p>
                <div class="setting-group">
                  <div class="setting-row" style={{ cursor: "default" }}>
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        mail
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Email & Password</span>
                      <span class="setting-row-desc">Primary sign-in method</span>
                    </div>
                    <span class="setting-row-value" style={{ color: "#4ade80" }}>Active</span>
                  </div>
                  <div class="setting-row" style={{ cursor: "default" }}>
                    <div class="setting-row-icon" aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                        login
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">Google OAuth</span>
                      <span class="setting-row-desc">Optional social sign-in</span>
                    </div>
                    <span class="setting-row-value">Available</span>
                  </div>
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
                    <span class="setting-row-value">Secured</span>
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
