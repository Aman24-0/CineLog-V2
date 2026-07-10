// src/routes/settings/account.tsx
import { Title } from "@solidjs/meta";
import { Show, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { signOut } from "~/shared/hooks/useAuthActions";
import { Button } from "~/shared/ui/primitives";

const AccountRoute: Component = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  return (
    <>
      <Title>CineLog — Account</Title>
      <PageContainer width="narrow" paddingBottom="var(--sp-12)">
        <div class="profile-fade-in" style={{ "padding-top": "var(--sp-8)" }}>
          <a href="/settings" class="settings-back focus-ring" aria-label="Back to settings">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Settings
          </a>

          <div class="settings-header">
            <p class="settings-eyebrow">Settings</p>
            <h1 class="settings-title">Account</h1>
            <p class="settings-subtitle">Manage your account. Sign out is at the bottom.</p>
          </div>

          <div class="settings-body">
            {/* Account info */}
            <section class="settings-section">
              <p class="settings-section-label">Account Info</p>
              <div class="settings-group">
                <div class="settings-row" style={{ cursor: "default" }}>
                  <div class="settings-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                      email
                    </span>
                  </div>
                  <div class="settings-row-text">
                    <span class="settings-row-label">Email</span>
                    <span class="settings-row-desc">{user()?.email ?? "Not signed in"}</span>
                  </div>
                </div>
                <div class="settings-row" style={{ cursor: "default" }}>
                  <div class="settings-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                      person
                    </span>
                  </div>
                  <div class="settings-row-text">
                    <span class="settings-row-label">Name</span>
                    <span class="settings-row-desc">{user()?.displayName ?? "Not set"}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Danger zone — Sign Out is LAST */}
            <section class="settings-section">
              <p class="settings-section-label">Session</p>
              <div class="settings-group">
                <button
                  type="button"
                  class="settings-row focus-ring settings-row-danger"
                  onClick={handleSignOut}
                  aria-label="Sign out of your account"
                >
                  <div class="settings-row-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                      logout
                    </span>
                  </div>
                  <div class="settings-row-text">
                    <span class="settings-row-label">Sign Out</span>
                    <span class="settings-row-desc">End your session on this device</span>
                  </div>
                  <span class="material-symbols-outlined settings-row-chevron" aria-hidden="true">
                    logout
                  </span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default AccountRoute;
