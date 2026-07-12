// src/routes/settings/sync.tsx
//
// Sync page — "Data Center" for CineLog.
//
// This is NOT a settings page. It's the central hub for:
//   1. Cloud Status         — "Is my data safe?"
//   2. Import                — "Can I move my data?" (CineLog V1 + future)
//   3. Backup                — "How do I recover my library?"
//   4. Devices               — "What happens if I change phone?"
//   5. Sync History          — "When was everything synced?"
//   6. Storage               — friendly library stats
//   7. Privacy               — reassurance
//
// ARCHITECTURE:
//   Each section is a self-contained component in src/features/sync/.
//   Import providers are pluggable (ImportSource registry).
//   Backup strategies are pluggable (BackupService registry).
//   Adding a new provider/strategy requires NO changes to this page.

import { Title } from "@solidjs/meta";
import { Show, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import PageContainer from "~/shared/ui/PageContainer";
import { Button } from "~/shared/ui/primitives";
import CloudStatusCard from "~/features/sync/components/CloudStatusCard";
import ImportHub from "~/features/sync/components/ImportHub";
import BackupCards from "~/features/sync/components/BackupCards";
import DevicesCard from "~/features/sync/components/DevicesCard";
import SyncHistoryTimeline from "~/features/sync/components/SyncHistoryTimeline";
import StorageStats from "~/features/sync/components/StorageStats";
import PrivacyCard from "~/features/sync/components/PrivacyCard";
import DangerZoneCard from "~/features/sync/components/DangerZoneCard";

const SyncRoute: Component = () => {
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <>
      <Title>CineLog — Data Center</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <div class="sec-page sec-fade-in">
          {/* Header */}
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Data Center</p>
            <h1 class="sec-title">Sync &amp; Backup</h1>
            <p class="sec-subtitle">Your library is safe, portable, and yours.</p>
          </div>

          <div class="sec-body">
            <Show
              when={isSignedIn()}
              fallback={
                <div class="sync-guest" role="status" aria-live="polite">
                  <div class="sync-guest-icon" aria-hidden="true">
                    <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "var(--p)" }} aria-hidden="true">lock</span>
                  </div>
                  <h3 class="sync-guest-title">Sign in to access your Data Center</h3>
                  <p class="sync-guest-body">Cloud sync, backups, imports, and device management are available after you sign in.</p>
                  <Button variant="primary" onClick={() => openAuthModal()} style={{ "margin-top": "var(--sp-2)" }}>
                    Sign In
                  </Button>
                </div>
              }
            >
              {/* 1. CLOUD STATUS */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <CloudStatusCard />
              </section>

              {/* 2. IMPORT */}
              <section class="sec-section">
                <p class="sec-section-label">Import</p>
                <ImportHub />
              </section>

              {/* 3. BACKUP */}
              <section class="sec-section">
                <p class="sec-section-label">Backup &amp; Restore</p>
                <BackupCards />
              </section>

              {/* 4. DEVICES */}
              <section class="sec-section">
                <p class="sec-section-label">Devices</p>
                <DevicesCard />
              </section>

              {/* 5. SYNC HISTORY */}
              <section class="sec-section">
                <p class="sec-section-label">Recent Activity</p>
                <SyncHistoryTimeline />
              </section>

              {/* 6. STORAGE */}
              <section class="sec-section">
                <p class="sec-section-label">Your Library</p>
                <StorageStats />
              </section>

              {/* 7. PRIVACY */}
              <section class="sec-section">
                <PrivacyCard />
              </section>

              {/* 8. DANGER ZONE — at the very bottom */}
              <section class="sec-section">
                <p class="sec-section-label sec-section-label-danger">Danger Zone</p>
                <DangerZoneCard />
              </section>
            </Show>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default SyncRoute;
