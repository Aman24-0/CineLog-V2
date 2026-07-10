// src/routes/profile/index.tsx
import { Title } from "@solidjs/meta";
import { ErrorBoundary } from "solid-js";
import ProfilePage from "~/features/profile/ProfilePage";

export default function ProfileRoute() {
  return (
    <>
      <Title>CineLog — Profile</Title>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="profile-page" style={{ "padding": "var(--sp-12) var(--sp-5)" }}>
            <div class="empty-premium" role="alert" aria-live="assertive">
              <div class="empty-premium-icon" aria-hidden="true">
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                  error
                </span>
              </div>
              <h3 class="empty-premium-title">Couldn't load profile</h3>
              <p class="empty-premium-body">{error.message || "Something went wrong loading your profile."}</p>
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={() => reset()}
                style={{ "margin-top": "var(--sp-2)" }}
                aria-label="Retry loading profile"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      >
        <ProfilePage />
      </ErrorBoundary>
    </>
  );
}
