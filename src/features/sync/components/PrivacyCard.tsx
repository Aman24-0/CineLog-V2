// src/features/sync/components/PrivacyCard.tsx
//
// PrivacyCard — a small premium card reassuring the user about data
// privacy. No technical jargon (no "Row-Level Security", no "at rest").

const PrivacyCard = () => (
  <div class="sync-privacy-card">
    <div class="sync-privacy-icon" aria-hidden="true">
      <span class="material-symbols-outlined" style={{ "font-size": "22px", color: "var(--p)" }} aria-hidden="true">shield_lock</span>
    </div>
    <div class="sync-privacy-text">
      <p class="sync-privacy-title">Your library belongs to you</p>
      <p class="sync-privacy-body">
        Only your account can access your data. Cloud backups are securely stored.
        We never share your library with anyone.
      </p>
    </div>
  </div>
);

export default PrivacyCard;
