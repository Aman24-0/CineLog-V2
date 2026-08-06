// src/features/landing/LandingPage.tsx
//
// Phase 11 — Landing Page & Marketing Site
// ----------------------------------------
// A cinematic, glassmorphic marketing page that drives sign-ups.
// Rendered at `/` for logged-out users (see src/routes/index.tsx for
// the signed-in → /discover redirect).
//
// Design pillars:
//   1. Cinematic hero — full-bleed TMDB backdrop gradient, oversized
//      headline, primary + secondary CTAs.
//   2. Three core feature pillars — glass cards in a responsive grid.
//   3. App preview — a styled mockup of the CineLog UI inside a large
//      GlassCard, with floating badges.
//   4. Final CTA — large call-to-action band.
//   5. Footer — copyright + link back to the app.
//
// Auth integration:
//   "Get Started" / "Login" / "Get Started Free" / "Join CineLog"
//   buttons all call `openAuthModal()` from useAuthModal(). The
//   AuthModal itself is mounted by AppShell (so it works on every
//   route, including this one).
//
// Mobile-first responsive: looks great on phones, scales beautifully
// up to ultra-wide desktop monitors. The grid collapses from 3 columns
// (desktop) → 1 column (mobile), and the hero typography scales via
// clamp().

import { Component, createSignal, For, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { GlassButton, GlassCard, GlassBadge } from "~/shared/ui/glass";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import Icon from "~/shared/ui/Icon";

// ─── Cinematic backdrop ───────────────────────────────────────────
// A high-quality, royalty-free cinematic still. We use TMDB's
// public CDN with a generic movie backdrop path. The image is loaded
// lazily as a CSS background so it doesn't block initial paint —
// the gradient underneath provides an immediate cinematic feel while
// the image loads. If the image fails to load, the gradient is still
// gorgeous on its own.
const HERO_BACKDROP_URL =
  "https://image.tmdb.org/t/p/original/8YFL5QQVPy3AgrEQxNYVSgiPEbe.jpg";

// ─── LandingPage ──────────────────────────────────────────────────

const LandingPage: Component = () => {
  const { openAuthModal } = useAuthModal();

  // Track scroll position to toggle the header's glass effect.
  // The header starts transparent (over the cinematic hero) and
  // transitions to a glassmorphic surface once the user scrolls
  // past the hero's first fold. This is the standard "transparent
  // header on hero" pattern used by Stripe, Linear, Vercel, etc.
  const [scrolled, setScrolled] = createSignal(false);

  const handleScroll = () => {
    // 80px ≈ the header height. Past this point, the header needs
    // a glass background so text remains readable over the page
    // content below the hero.
    setScrolled(window.scrollY > 80);
  };

  onMount(() => {
    handleScroll(); // Set initial state
    window.addEventListener("scroll", handleScroll, { passive: true });
  });

  onCleanup(() => {
    window.removeEventListener("scroll", handleScroll);
  });

  // Smooth-scroll to the features section. Used by the "Explore
  // Features" secondary CTA. Uses native scrollIntoView with
  // behavior: "smooth" — respects prefers-reduced-motion automatically.
  const scrollToFeatures = () => {
    document
      .getElementById("features")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div class="landing-page">
      {/* ─── Skip Link ──────────────────────────────────────────
          WCAG 2.4.1 — Bypass Blocks. First focusable element so
          keyboard users can jump straight to the hero. */}
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
              // Smooth-scroll to top instead of navigating
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

          {/* Auth CTAs */}
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
              Get Started
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
          style={{ "--hero-backdrop": `url(${HERO_BACKDROP_URL})` }}
          aria-labelledby="landing-hero-title"
        >
          {/* Backdrop image layer (separate from gradient so the
              image can fade in lazily without blocking paint) */}
          <div class="landing-hero__backdrop" aria-hidden="true" />
          {/* Gradient overlays for legibility */}
          <div class="landing-hero__gradient" aria-hidden="true" />
          <div class="landing-hero__vignette" aria-hidden="true" />

          <div class="landing-hero__content">
            {/* Eyebrow badge */}
            <div class="landing-hero__eyebrow animate-fade-up">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{ "font-size": "16px" }}
              >
                auto_awesome
              </span>
              <span>Your all-in-one cinematic companion</span>
            </div>

            {/* Headline */}
            <h1
              id="landing-hero-title"
              class="landing-hero__title animate-fade-up"
              style={{ "animation-delay": "60ms" }}
            >
              Your Cinematic Universe,
              <br />
              <span class="landing-hero__title-accent">Perfected.</span>
            </h1>

            {/* Subheadline */}
            <p
              class="landing-hero__subtitle animate-fade-up"
              style={{ "animation-delay": "120ms" }}
            >
              Track films, TV shows, and anime. Explore cinematic universes.
              Import your history from Trakt or Letterboxd.
            </p>

            {/* CTAs */}
            <div
              class="landing-hero__ctas animate-fade-up"
              style={{ "animation-delay": "180ms" }}
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
              <GlassButton
                variant="secondary"
                size="large"
                icon="explore"
                iconPosition="left"
                onClick={scrollToFeatures}
                aria-label="Smooth scroll down to explore features"
              >
                Explore Features
              </GlassButton>
            </div>

            {/* Trust strip — social proof */}
            <div
              class="landing-hero__trust animate-fade-up"
              style={{ "animation-delay": "240ms" }}
            >
              <div class="landing-hero__trust-item">
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "18px", color: "var(--p)" }}
                >
                  check_circle
                </span>
                <span>Free forever</span>
              </div>
              <div class="landing-hero__trust-item">
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "18px", color: "var(--p)" }}
                >
                  check_circle
                </span>
                <span>No credit card</span>
              </div>
              <div class="landing-hero__trust-item">
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "18px", color: "var(--p)" }}
                >
                  check_circle
                </span>
                <span>Import from Trakt & Letterboxd</span>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <button
            type="button"
            class="landing-hero__scroll"
            onClick={scrollToFeatures}
            aria-label="Scroll to features section"
          >
            <span
              class="material-symbols-outlined"
              aria-hidden="true"
              style={{ "font-size": "28px" }}
            >
              keyboard_arrow_down
            </span>
          </button>
        </section>

        {/* ─── Features Grid (3 Core Pillars) ───────────────── */}
        <section
          id="features"
          class="landing-features"
          aria-labelledby="features-title"
        >
          <div class="landing-features__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">Why CineLog</span>
              <h2 id="features-title" class="landing-section-title">
                Three pillars, one cinematic experience
              </h2>
              <p class="landing-section-subtitle">
                Built for people who treat watching as a craft — not a
                checkbox. Every feature is designed to deepen your
                relationship with what you watch.
              </p>
            </div>

            <div class="landing-features__grid">
              {/* Pillar 1 — Effortless Tracking */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-feature-card animate-fade-up"
              >
                <div class="landing-feature-card__icon landing-feature-card__icon--gold">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    bookmark_add
                  </span>
                </div>
                <h3 class="landing-feature-card__title">
                  Effortless Tracking
                </h3>
                <p class="landing-feature-card__body">
                  Log what you watch, track episode progress, and never
                  lose your place across devices. Smart continue-watching
                  surfaces the next episode the second you open the app —
                  no digging, no friction.
                </p>
                <ul class="landing-feature-card__list">
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    One-tap logging for films, TV & anime
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Episode progress synced across devices
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Custom statuses: watching, planned, paused, dropped
                  </li>
                </ul>
              </GlassCard>

              {/* Pillar 2 — Cinematic Universe Explorer */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-feature-card animate-fade-up"
                style={{ "animation-delay": "80ms" }}
              >
                <div class="landing-feature-card__icon landing-feature-card__icon--purple">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    auto_awesome_mosaic
                  </span>
                </div>
                <h3 class="landing-feature-card__title">
                  Cinematic Universe Explorer
                </h3>
                <p class="landing-feature-card__body">
                  Dive into the MCU, Star Wars, and more with interactive
                  timelines, phases, and custom viewing orders. Build your
                  own canon and share it with friends — perfect for
                  rewatch campaigns and franchise deep-dives.
                </p>
                <ul class="landing-feature-card__list">
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Curated timelines for 50+ franchises
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Custom viewing orders & smart collections
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Phase dividers & progress tracking per universe
                  </li>
                </ul>
              </GlassCard>

              {/* Pillar 3 — Rich Insights & Import */}
              <GlassCard
                variant="glass-strong"
                size="comfortable"
                hoverable
                class="landing-feature-card animate-fade-up"
                style={{ "animation-delay": "160ms" }}
              >
                <div class="landing-feature-card__icon landing-feature-card__icon--cyan">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-variation-settings": "'FILL' 1" }}
                  >
                    insights
                  </span>
                </div>
                <h3 class="landing-feature-card__title">
                  Rich Insights & Import
                </h3>
                <p class="landing-feature-card__body">
                  Visualize your stats and import your history from TV
                  Time, Trakt, or Letterboxd in one click. Beautiful
                  charts surface your taste profile, genre breakdowns,
                  and decade preferences — your watch history, elevated.
                </p>
                <ul class="landing-feature-card__list">
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Import from Trakt, Letterboxd, TV Time, CSV
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Activity heatmaps & genre distributions
                  </li>
                  <li>
                    <Icon name="check" style={{ "font-size": "16px", color: "var(--p)" }} />
                    Shareable year-in-review cards
                  </li>
                </ul>
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
                Every pixel designed to feel like a dimly-lit theatre —
                warm gold accents, deep voids, and glass surfaces that
                layer like a director's cut.
              </p>
            </div>

            {/* App mockup card */}
            <div class="landing-preview__mockup-wrap">
              {/* Floating badges — absolutely positioned around the mockup */}
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

                {/* Mock app content — a stylized representation of the Discover page */}
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

                  {/* Main content area */}
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
              Join thousands of cinephiles who've upgraded their watch
              experience. Your vault is one click away.
            </p>
            <GlassButton
              variant="primary"
              size="large"
              icon="movie"
              iconFill
              onClick={() => openAuthModal()}
              class="landing-cta__button"
              aria-label="Join CineLog — create your free account"
            >
              Join CineLog
            </GlassButton>
            <p class="landing-cta__footnote">
              Free forever. No credit card required. Cancel anytime.
            </p>
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
              <span class="landing-footer__divider" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                class="landing-footer__link landing-footer__link--button"
                onClick={() => openAuthModal()}
              >
                Sign in
              </button>
            </div>
            <p class="landing-footer__copyright">
              © {new Date().getFullYear()} CineLog. Crafted for cinephiles.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;
