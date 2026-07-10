// src/routes/profile/history.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function HistoryRoute() {
  return (
    <>
      <Title>CineLog — History</Title>
      <PageContainer width="narrow" paddingBottom="var(--sp-12)">
        <div class="profile-fade-in" style={{ "padding-top": "var(--sp-8)" }}>
          <a href="/profile" class="settings-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <div class="empty-premium" style={{ "margin-top": "var(--sp-8)" }}>
            <div class="empty-premium-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">
                history
              </span>
            </div>
            <h3 class="empty-premium-title">History</h3>
            <p class="empty-premium-body">
              Your chronological watch log — every title, date-stamped. Coming soon.
            </p>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
