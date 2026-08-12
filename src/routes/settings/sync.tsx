// src/routes/settings/sync.tsx
//
// Sync page — the central hub for cloud sync, import, and export.
//
// Sections:
//   1. Cloud Status         — "Is my data safe?"
//   2. Sync Cadence         — Real-time / Wi-Fi only / Manual
//   3. Import                — JSON + CSV (auto-detects Letterboxd / Trakt / IMDb / TV Time)
//   4. Export                — JSON + CSV
//   5. Devices               — current device info
//   6. Danger Zone           — Reset Library (with DELETE confirmation)
//
// What was removed in the cleanup:
//   • "Recent Activity" timeline (lives on Profile, not Settings)
//   • "Your Library" storage stats (lives on Profile, not Settings)
//   • Privacy reassurance card (lives on Privacy page, not Settings)
//
// Architecture:
//   Each section is a self-contained component in src/features/sync/.
//   Import providers are pluggable (ImportSource registry).
//   Backup strategies are pluggable (BackupService registry).
//   Adding a new provider/strategy requires NO changes to this page.

import { Title } from "@solidjs/meta";
import { Show, ErrorBoundary, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { Button } from "~/shared/ui/primitives";
import CloudStatusCard from "~/features/sync/components/CloudStatusCard";
import ImportHub from "~/features/sync/components/ImportHub";
import CsvImportCard from "~/features/sync/components/CsvImportCard";
import BackupCards from "~/features/sync/components/BackupCards";
import CsvExportCard from "~/features/sync/components/CsvExportCard";
import DevicesCard from "~/features/sync/components/DevicesCard";
import DangerZoneCard from "~/features/sync/components/DangerZoneCard";
import SyncCadenceCard from "~/features/sync/components/SyncCadenceCard";

const SyncRoute: Component = () => {
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();

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
      <Title>CineLog — Sync & Backup</Title>
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
            <p class="sec-eyebrow">Sync</p>
            <h1 class="sec-title">Sync &amp; Backup</h1>
            <p class="sec-subtitle">
              Your library is safe, portable, and yours.
            </p>
          </div>

          <div class="sec-body">
            <Show
              when={isSignedIn()}
              fallback={
                <div class="sync-guest" role="status" aria-live="polite">
                  <div class="sync-guest-icon" aria-hidden="true">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "32px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      lock
                    </span>
                  </div>
                  <h3 class="sync-guest-title">
                    Sign in to access sync &amp; backup
                  </h3>
                  <p class="sync-guest-body">
                    Cloud sync, backups, and imports are available after you sign in.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => openAuthModal()}
                    style={{ "margin-top": "var(--sp-2)" }}
                  >
                    Sign In
                  </Button>
                </div>
              }
            >
              {/* 1. CLOUD STATUS */}
              <section class="sec-section" style={{ "margin-top": "0" }}>
                <CloudStatusCard />
              </section>

              {/* 2. SYNC CADENCE */}
              <section class="sec-section">
                <p class="sec-section-label">Sync Cadence</p>
                <SyncCadenceCard />
              </section>

              {/* 3. IMPORT — JSON + CSV unified under one label */}
              <section class="sec-section">
                <p class="sec-section-label">Import</p>
                <ImportHub />
                <CsvImportCard />
              </section>

              {/* 4. EXPORT — JSON + CSV unified under one label */}
              <section class="sec-section">
                <p class="sec-section-label">Export</p>
                <BackupCards />
                <CsvExportCard />
              </section>

              {/* 5. DEVICES */}
              <section class="sec-section">
                <p class="sec-section-label">Devices</p>
                <DevicesCard />
              </section>

              {/* 6. DANGER ZONE — at the very bottom */}
              <section class="sec-section">
                <p class="sec-section-label sec-section-label-danger">
                  Danger Zone
                </p>
                <DangerZoneCard />
              </section>
            </Show>
          </div>
        </div>
      </PageContainer>
    </>
    </ErrorBoundary>
  );
};

export default SyncRoute;
