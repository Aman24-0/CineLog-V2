// src/features/profile/components/DangerZone.tsx
//
// Sprint 2C — NEW FILE.
// Isolated danger zone at the bottom of the Profile page.
// Red-tinted surface with Sign Out + Delete Account actions.

import { type Component } from "solid-js";
import { PremiumSurface, PremiumButton, PremiumDivider, PremiumSectionHeader } from "~/shared/ui/premium";

interface DangerZoneProps {
  onSignOut: () => void;
}

/**
 * DangerZone — isolated red-tinted section at the bottom of the Profile.
 *
 * Contains:
 *   • Sign Out — ghost button, standard destructive action
 *   • Delete Account — danger button, permanent destructive action
 *
 * Uses PremiumSurface with a red-tinted background
 * (color-mix of danger + tier-1) for visual isolation.
 */
const DangerZone: Component<DangerZoneProps> = (props) => {
  return (
    <section
      style={{ "margin-top": "var(--space-12)" }}
      aria-label="Danger zone"
    >
      <PremiumSectionHeader
        title="Danger Zone"
        icon="warning"
        variant="compact"
      />
      <PremiumSurface
        elevation="flat"
        border="subtle"
        padding="comfortable"
        radius="lg"
        style={{
          "background-color": "color-mix(in srgb, var(--color-danger, #ef4444) 8%, var(--tier-1))",
        }}
      >
        <div class="danger-zone-content">
          {/* Sign Out row */}
          <div class="danger-zone-row">
            <div class="danger-zone-row-text">
              <p class="danger-zone-title">Sign Out</p>
              <p class="danger-zone-desc">Sign out of your account</p>
            </div>
            <PremiumButton
              variant="ghost"
              size="compact"
              onClick={props.onSignOut}
            >
              Sign Out
            </PremiumButton>
          </div>

          <PremiumDivider variant="subtle" spacing="compact" />

          {/* Delete Account row */}
          <div class="danger-zone-row">
            <div class="danger-zone-row-text">
              <p class="danger-zone-title danger-zone-title-danger">Delete Account</p>
              <p class="danger-zone-desc">Permanently delete your account and all data</p>
            </div>
            <PremiumButton
              variant="danger"
              size="compact"
            >
              Delete
            </PremiumButton>
          </div>
        </div>
      </PremiumSurface>
    </section>
  );
};

export default DangerZone;
