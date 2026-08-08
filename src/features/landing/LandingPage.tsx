// src/features/landing/LandingPage.tsx
//
// Phase 17 Chunk 2 — Complete Content Redesign
// --------------------------------------------
// A premium product showcase landing page that drives sign-ups.
// Rendered at `/` for logged-out users (see src/routes/index.tsx for
// the signed-in → /discover redirect).
//
// Design pillars:
//   1. Cinematic hero — punchy headline, single CTA, scroll anchor.
//   2. Trust bar — concise social proof right under the hero.
//   3. Differentiator — bold statement separating CineLog from trackers.
//   4. How It Works — 3-step grid (Track → Explore → Import).
//   5. App preview — stylized GlassCard mockup, no external images.
//   6. Final CTA — second "Get Started Free" button.
//   7. Footer — copyright + discover link.
//
// CTA discipline (CRITICAL):
//   Exactly TWO buttons open AuthModal:
//     1. "Get Started Free" (primary) — appears in header + hero + final CTA.
//     2. "Login" (ghost) — appears in header only.
//   "Explore Features" is a scroll anchor, NOT a modal trigger.
//   No "Join CineLog", no duplicate "Get Started", no extra auth buttons.

import { Component, createSignal, For, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { GlassButton, GlassCard, GlassBadge } from "~/shared/ui/glass";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import Icon from "~/shared/ui/Icon";

// ─── LandingPage ──────────────────────────────────────────────────

const LandingPage: Component = () => {
  const { openAuthModal } = useAuthModal();

  // Track scroll position to toggle the header's glass effect.
  const [scrolled, setScrolled] = createSignal(false);

  const handleScroll = () => {
    setScrolled(window.scrollY > 80);
  };

  onMount(() => {
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
  });

  onCleanup(() => {
    window.removeEventListener("scroll", handleScroll);
  });

  // Smooth-scroll to the features section. "Explore Features" is
  // an anchor link — it does NOT open the AuthModal.
  const scrollToFeatures = () => {
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div class="landing-page">
      {/* Skip Link — WCAG 2.4.1 */}
      <a href="#landing-hero" class="skip-link">
        Skip to content
      </a>

      {/* ─── Sticky Header ───────────────────────────────────── */}
      <header
        class="landing-header"
        classList={{ "landing-header--scrolled": scrolled() }}
        role="banner"
      >
        <div class="landing-header__inner">
          {/* Logo */}
          <A
            href="/"
            class="landing-logo"
            aria-label="CineLog home"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span
              class="material-symbols-outlined landing-logo__icon"
              aria-hidden="true"
              style={{ "font-variation-settings": "'FILL' 1" }}
            >
              movie
            </span>
            <span class="landing-logo__text">CineLog</span>
          </A>

          {/* Header CTAs — exactly: Login (ghost) + Get Started Free (primary) */}
          <div class="landing-header__actions">
            <GlassButton
              variant="ghost"
              size="compact"
              onClick={() => openAuthModal()}
              aria-label="Log in to your account"
            >
              Login
            </GlassButton>
            <GlassButton
              variant="primary"
              size="compact"
              onClick={() => openAuthModal()}
              aria-label="Create a new CineLog account"
            >
              Get Started Free
            </GlassButton>
          </div>
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────── */}
      <main id="main-content" class="landing-main">

        {/* ─── Hero Section ─────────────────────────────────── */}
        <section
          id="landing-hero"
          class="landing-hero"
          aria-labelledby="landing-hero-title"
        >
          {/* CSS gradient mesh backdrop (Phase 17 Chunk 1) */}
          <div class="landing-hero__backdrop" aria-hidden="true" />
          <div class="landing-hero__gradient" aria-hidden="true" />
          <div class="landing-hero__vignette" aria-hidden="true" />

          <div class="landing-hero__content">
            {/* Headline */}
            <h1
              id="landing-hero-title"
              class="landing-hero__title animate-fade-up"
            >
              Your Cinematic Universe,{" "}
              <span class="landing-hero__title-accent">Perfected.</span>
            </h1>

            {/* Subheadline */}
            <p
              class="landing-hero__subtitle animate-fade-up"
              style={{ "animation-delay": "60ms" }}
            >
              Track every film, series, and anime you watch. All in one
              beautiful place.
            </p>

            {/* Single primary CTA + scroll anchor */}
            <div
              class="landing-hero__ctas animate-fade-up"
              style={{ "animation-delay": "120ms" }}
            >
              <GlassButton
                variant="primary"
                size="large"
                icon="rocket_launch"
                onClick={() => openAuthModal()}
                aria-label="Get started for free — create an account"
              >
                Get Started Free
              </GlassButton>
              <a
                href="#how-it-works"
                class="landing-hero__scroll-link"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToFeatures();
                }}
              >
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "20px" }}
                >
                  keyboard_arrow_down
                </span>
                Explore Features
              </a>
            </div>
          </div>
        </section>

        {/* ─── Trust Bar ────────────────────────────────────── */}
        <section class="landing-trust" aria-label="Trust indicators">
          <div class="landing-trust__inner">
            <div class="landing-trust__item">
              <Icon name="check_circle" fill style={{ "font-size": "18px", color: "var(--p)" }} />
              <span>100% Free</span>
            </div>
            <span class="landing-trust__dot" aria-hidden="true">•</span>
            <div class="landing-trust__item">
              <Icon name="block" fill style={{ "font-size": "18px", color: "var(--p)" }} />
              <span>No Ads</span>
            </div>
            <span class="landing-trust__dot" aria-hidden="true">•</span>
            <div class="landing-trust__item">
              <Icon name="sync" fill style={{ "font-size": "18px", color: "var(--p)" }} />
              <span>Import from Trakt &amp; Letterboxd</span>
            </div>
            <span class="landing-trust__dot" aria-hidden="true">•</span>
            <div class="landing-trust__item">
              <Icon name="devices" fill style={{ "font-size": "18px", color: "var(--p)" }} />
              <span>Cross-Device Sync</span>
            </div>
          </div>
        </section>

        {/* ─── The Differentiator ───────────────────────────── */}
        <section class="landing-differentiator" aria-labelledby="diff-title">
          <div class="landing-differentiator__inner">
            <div class="landing-differentiator__glow" aria-hidden="true" />
            <h2 id="diff-title" class="landing-differentiator__title animate-fade-up">
              Stop juggling trackers.
            </h2>
            <p class="landing-differentiator__subtitle animate-fade-up" style={{ "animation-delay": "60ms" }}>
              Movies, TV, and Anime — <em>all in one place.</em>
            </p>
            <p class="landing-differentiator__body animate-fade-up" style={{ "animation-delay": "120ms" }}>
              Other apps force you to pick: one for films, one for anime,
              one for TV. CineLog unifies your entire watch life with
              a single vault, smart collections, and franchise timelines
              that span every medium.
            </p>
          </div>
        </section>

        {/* ─── How It Works (3 Steps) ───────────────────────── */}
        <section
          id="how-it-works"
          class="landing-how"
          aria-labelledby="how-title"
        >
          <div class="landing-how__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">How It Works</span>
              <h2 id="how-title" class="landing-section-title">
                Three steps to a perfected watch life
              </h2>
            </div>

            <div class="landing-how__grid">
              {/* Step 1 — Track */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-how__card animate-fade-up"
              >
                <div class="landing-how__step-number">1</div>
                <div class="landing-how__icon landing-how__icon--gold">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    bookmark_add
                  </span>
                </div>
                <h3 class="landing-how__card-title">
                  Track What You Watch
                </h3>
                <p class="landing-how__card-body">
                  One-tap logging for films, TV episodes, and anime.
                  Smart continue-watching surfaces the next episode
                  the moment you open the app — no digging, no friction.
                </p>
              </GlassCard>

              {/* Step 2 — Explore */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-how__card animate-fade-up"
                style={{ "animation-delay": "80ms" }}
              >
                <div class="landing-how__step-number">2</div>
                <div class="landing-how__icon landing-how__icon--purple">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    auto_awesome_mosaic
                  </span>
                </div>
                <h3 class="landing-how__card-title">
                  Explore Cinematic Universes
                </h3>
                <p class="landing-how__card-body">
                  Dive into the MCU, Star Wars, and 50+ franchises with
                  interactive timelines, phases, and custom viewing orders.
                  Build your own canon and share it.
                </p>
              </GlassCard>

              {/* Step 3 — Import */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-how__card animate-fade-up"
                style={{ "animation-delay": "160ms" }}
              >
                <div class="landing-how__step-number">3</div>
                <div class="landing-how__icon landing-how__icon--cyan">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    upload_file
                  </span>
                </div>
                <h3 class="landing-how__card-title">
                  Import Your History
                </h3>
                <p class="landing-how__card-body">
                  Bring your watch history from Trakt, Letterboxd, or
                  TV Time in one click. Beautiful charts surface your
                  taste profile and genre breakdowns instantly.
                </p>
              </GlassCard>
            </div>
          </div>
        </section>

        {/* ─── App Preview Section ───────────────────────────── */}
        <section
          class="landing-preview"
          aria-labelledby="preview-title"
        >
          <div class="landing-preview__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">A glimpse inside</span>
              <h2 id="preview-title" class="landing-section-title">
                A UI worthy of the cinema
              </h2>
              <p class="landing-section-subtitle">
                Warm gold accents, deep voids, and glass surfaces that
                layer like a director's cut — no screenshots needed.
              </p>
            </div>

            {/* Stylized app mockup using GlassCards — no external images */}
            <div class="landing-preview__mockup-wrap">
              {/* Floating badges */}
              <div
                class="landing-preview__floating-badge landing-preview__floating-badge--tl"
                aria-hidden="true"
              >
                <GlassBadge
                  intent="primary"
                  label="Dark Mode"
                  icon="dark_mode"
                  glass
                />
              </div>
              <div
                class="landing-preview__floating-badge landing-preview__floating-badge--tr"
                aria-hidden="true"
              >
                <GlassBadge
                  intent="success"
                  label="Premium UI"
                  icon="diamond"
                  glass
                />
              </div>
              <div
                class="landing-preview__floating-badge landing-preview__floating-badge--bl"
                aria-hidden="true"
              >
                <GlassBadge
                  intent="info"
                  label="Glassmorphism"
                  icon="blur_on"
                  glass
                />
              </div>
              <div
                class="landing-preview__floating-badge landing-preview__floating-badge--br"
                aria-hidden="true"
              >
                <GlassBadge
                  intent="warning"
                  label="Cinema Gold"
                  icon="star"
                  glass
                />
              </div>

              <GlassCard
                variant="glass-strong"
                padding="none"
                class="landing-preview__mockup"
              >
                {/* Mock browser chrome */}
                <div class="landing-preview__chrome">
                  <span class="landing-preview__dot" />
                  <span class="landing-preview__dot" />
                  <span class="landing-preview__dot" />
                  <div class="landing-preview__url">
                    <Icon
                      name="lock"
                      style={{ "font-size": "12px", color: "var(--text-dim)" }}
                    />
                    <span>cinelog.app/discover</span>
                  </div>
                </div>

                {/* Mock app content */}
                <div class="landing-preview__app">
                  {/* Sidebar (desktop only) */}
                  <div class="landing-preview__sidebar">
                    <div class="landing-preview__sidebar-logo">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                        style={{
                          "font-size": "20px",
                          color: "var(--p)",
                          "font-variation-settings": "'FILL' 1"
                        }}
                      >
                        movie
                      </span>
                    </div>
                    <For each={["explore", "bookmark", "auto_awesome_mosaic", "bar_chart", "settings"]}>{(iconName) => (
                        <div class="landing-preview__sidebar-icon" aria-hidden="true">
                          <span
                            class="material-symbols-outlined"
                            style={{
                              "font-size": "18px",
                              color:
                                iconName === "explore"
                                  ? "var(--p)"
                                  : "var(--text-dim)"
                            }}
                          >
                            {iconName}
                          </span>
                        </div>
                      )}</For>
                  </div>

                  {/* Main content — mock Discover rail + Vault card */}
                  <div class="landing-preview__content">
                    {/* Spotlight hero */}
                    <div class="landing-preview__spotlight">
                      <div class="landing-preview__spotlight-text">
                        <div class="landing-preview__skeleton landing-preview__skeleton--badge" />
                        <div class="landing-preview__skeleton landing-preview__skeleton--title" />
                        <div class="landing-preview__skeleton landing-preview__skeleton--line" />
                        <div class="landing-preview__skeleton landing-preview__skeleton--line landing-preview__skeleton--short" />
                        <div class="landing-preview__spotlight-cta">
                          <div class="landing-preview__skeleton landing-preview__skeleton--button" />
                          <div class="landing-preview__skeleton landing-preview__skeleton--button-secondary" />
                        </div>
                      </div>
                    </div>

                    {/* Rails */}
                    <div class="landing-preview__rails">
                      <For each={[0, 1]}>{(railIdx) => (
                        <div class="landing-preview__rail" aria-hidden="true">
                          <div class="landing-preview__skeleton landing-preview__skeleton--rail-title" />
                          <div class="landing-preview__rail-row">
                            <For each={[0, 1, 2, 3, 4, 5]}>{(posterIdx) => (
                              <div
                                class="landing-preview__poster"
                                classList={{
                                  "landing-preview__poster--accent":
                                    railIdx === 0 && posterIdx === 1
                                }}
                              />
                            )}</For>
                          </div>
                        </div>
                      )}</For>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─────────────────────────────────────── */}
        <section class="landing-cta" aria-labelledby="cta-title">
          <div class="landing-cta__inner">
            <div class="landing-cta__glow" aria-hidden="true" />
            <h2 id="cta-title" class="landing-cta__title">
              Ready to start your journey?
            </h2>
            <p class="landing-cta__subtitle">
              Your cinematic vault is one click away. Free forever,
              no credit card required.
            </p>
            <GlassButton
              variant="primary"
              size="large"
              icon="rocket_launch"
              onClick={() => openAuthModal()}
              class="landing-cta__button"
              aria-label="Get started for free — create an account"
            >
              Get Started Free
            </GlassButton>
          </div>
        </section>

        {/* ─── Footer ────────────────────────────────────────── */}
        <footer class="landing-footer" role="contentinfo">
          <div class="landing-footer__inner">
            <div class="landing-footer__brand">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  "font-size": "24px",
                  color: "var(--p)",
                  "font-variation-settings": "'FILL' 1"
                }}
              >
                movie
              </span>
              <span class="landing-footer__brand-text">CineLog</span>
            </div>
            <p class="landing-footer__tagline">
              Your cinematic universe, perfected.
            </p>
            <div class="landing-footer__links">
              <A href="/discover" class="landing-footer__link">
                Explore the app
              </A>
            </div>
            <p class="landing-footer__copyright">
              &copy; {new Date().getFullYear()} CineLog. Crafted for cinephiles.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;
