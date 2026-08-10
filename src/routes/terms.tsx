// src/routes/terms.tsx
import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";

export default function TermsPage() {
  return (
    <div class="legal-page">
      <Title>Terms of Service — CineLog</Title>
      <div class="legal-page__inner">
        <A href="/" class="legal-page__back">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to CineLog
        </A>
        <h1 class="legal-page__title">Terms of Service</h1>
        <p class="legal-page__updated">Last updated: August 2026</p>

        <section class="legal-page__section">
          <h2>Introduction</h2>
          <p>These Terms of Service govern your use of CineLog, a personal cinematic universe application. By using CineLog, you agree to these terms. If you do not agree, please do not use the service.</p>
        </section>

        <section class="legal-page__section">
          <h2>Use of CineLog</h2>
          <p>CineLog is a personal entertainment tracking application. You may use it to track movies, TV shows, and anime you have watched, plan to watch, or are currently watching. The service is provided for personal, non-commercial use.</p>
        </section>

        <section class="legal-page__section">
          <h2>Accounts</h2>
          <p>You may create an account to access personalized features. You are responsible for maintaining the security of your account credentials. You must be at least 13 years old to create an account.</p>
        </section>

        <section class="legal-page__section">
          <h2>User Content / Watch Data</h2>
          <p>Your watchlist data, ratings, collections, and viewing history belong to you. CineLog stores this data to provide the service. You can export or delete your data at any time through your account settings.</p>
        </section>

        <section class="legal-page__section">
          <h2>Acceptable Use</h2>
          <p>You agree not to misuse the service, attempt unauthorized access, or use it in ways that could damage, disable, or impair the service. Automated access (scraping) beyond provided APIs is prohibited.</p>
        </section>

        <section class="legal-page__section">
          <h2>Third-Party Services</h2>
          <p>CineLog integrates with third-party services including The Movie Database (TMDB) for content data, and optionally Trakt, Letterboxd, and IMDb for data import. These services operate under their own terms. CineLog is not responsible for the availability or accuracy of third-party data.</p>
        </section>

        <section class="legal-page__section">
          <h2>Changes to Service</h2>
          <p>We may update or modify the service from time to time. We will strive to notify users of significant changes. Continued use after changes constitutes acceptance of the modified terms.</p>
        </section>

        <section class="legal-page__section">
          <h2>Termination</h2>
          <p>You may delete your account at any time. We reserve the right to suspend or terminate accounts that violate these terms.</p>
        </section>

        <section class="legal-page__section">
          <h2>Disclaimer</h2>
          <p>CineLog is provided as-is, without warranty of any kind. We do not guarantee uninterrupted or error-free operation.</p>
        </section>

        <section class="legal-page__section">
          <h2>Contact</h2>
          <p>For questions about these terms, please reach out through the CineLog support channels.</p>
        </section>
      </div>
    </div>
  );
}
