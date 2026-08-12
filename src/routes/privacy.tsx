// src/routes/privacy.tsx
import { Title, Meta } from "@solidjs/meta";
import { A } from "@solidjs/router";

export default function PrivacyPage() {
  return (
    <div class="legal-page">
      <Title>Privacy Policy — CineLog</Title>
      <Meta name="description" content="CineLog privacy policy - how we handle your data." />
      <div class="legal-page__inner">
        <A href="/" class="legal-page__back">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to CineLog
        </A>
        <h1 class="legal-page__title">Privacy Policy</h1>
        <p class="legal-page__updated">Last updated: August 2026</p>

        <section class="legal-page__section">
          <h2>Information Collected</h2>
          <p>CineLog collects information you provide directly: your email address (for authentication), display name, and the entertainment content you choose to track (watchlist items, ratings, collections, and viewing history).</p>
        </section>

        <section class="legal-page__section">
          <h2>How Information Is Used</h2>
          <p>Your information is used to provide and improve the CineLog service. This includes displaying your watchlist and collections, generating personalized recommendations, and syncing your data across devices when you are signed in.</p>
        </section>

        <section class="legal-page__section">
          <h2>Authentication</h2>
          <p>CineLog uses Supabase for authentication. Your email and password are handled by Supabase's authentication system. CineLog does not store raw passwords. Google Sign-In is available as an alternative authentication method.</p>
        </section>

        <section class="legal-page__section">
          <h2>Watchlist / Collection Data</h2>
          <p>Your watchlist, ratings, collections, and viewing history are stored in a Supabase PostgreSQL database. This data is private to your account by default and is not shared with other users or third parties.</p>
        </section>

        <section class="legal-page__section">
          <h2>Third-Party Services</h2>
          <p>CineLog uses The Movie Database (TMDB) for content metadata and images. When you import data from Trakt or Letterboxd, those services' APIs are accessed according to their respective privacy policies. CineLog does not send your private watchlist data to these services.</p>
        </section>

        <section class="legal-page__section">
          <h2>Local Storage</h2>
          <p>CineLog uses browser local storage and IndexedDB for caching preferences, theme settings, and recently viewed content. This improves performance and allows some features to work offline. You can clear this data through your browser settings.</p>
        </section>

        <section class="legal-page__section">
          <h2>Data Retention</h2>
          <p>Your data is retained as long as your account is active. If you delete your account, your data is scheduled for removal. Some cached data (such as TMDB content information) may be retained for service performance but is not personally identifiable.</p>
        </section>

        <section class="legal-page__section">
          <h2>Security</h2>
          <p>CineLog uses industry-standard practices to protect your data. Authentication is handled through Supabase with Row Level Security policies that ensure users can only access their own data.</p>
        </section>

        <section class="legal-page__section">
          <h2>User Rights</h2>
          <p>You have the right to access, export, and delete your personal data. These actions can be performed through your account settings. If you delete your account, your watchlist, collections, and associated data will be removed.</p>
        </section>

        <section class="legal-page__section">
          <h2>Changes to Privacy Policy</h2>
          <p>We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date. Continued use after changes constitutes acceptance of the updated policy.</p>
        </section>

        <section class="legal-page__section">
          <h2>Contact</h2>
          <p>For questions about this privacy policy, please reach out through the CineLog support channels.</p>
        </section>
      </div>
    </div>
  );
}
