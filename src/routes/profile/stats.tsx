// src/routes/profile/stats.tsx
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";

export default function StatsRoute() {
  return (
    <>
      <Title>CineLog — Statistics</Title>
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
                insights
              </span>
            </div>
            <h3 class="empty-premium-title">Statistics</h3>
            <p class="empty-premium-body">
              Your full watching insights — totals, genre breakdowns, monthly activity. Coming soon.
            </p>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
