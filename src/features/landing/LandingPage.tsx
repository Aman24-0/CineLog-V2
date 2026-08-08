// src/features/landing/LandingPage.tsx
//
// CineLog V2 — Landing Page Redesign
// ------------------------------------
// A premium cinematic product website for a serious movie/TV/anime
// tracking application. Renders at `/` for logged-out users.
//
// Sections:
//   1.  Premium navigation (sticky, glass on scroll)
//   2.  Cinematic hero — product UI with real poster rail
//   3.  Media intro — Movies / Shows / Anime scope
//   4.  Discover — major product showcase
//   5.  Watchlist / Vault — organized watch life
//   6.  Cinematic Universes — franchise timelines
//   7.  Statistics + Your Story — viewing habits
//   8.  Upcoming + Reminders — never miss what's next
//   9.  Import / Sync — bring your history
//  10.  Personalization — theme strip
//  11.  Cross-Device / PWA — compact visual
//  12.  Final CTA — closing scene
//  13.  Minimal footer
//
// CTA discipline (CRITICAL):
//   Exactly TWO buttons open AuthModal:
//     1. "Get Started Free" (primary) — header + hero + final CTA.
//     2. "Login" (ghost) — header only.
//   "Explore CineLog" is a scroll anchor, NOT a modal trigger.

import { Component, createSignal, onCleanup, onMount, For } from "solid-js";
import { A } from "@solidjs/router";
import { GlassButton, GlassCard, GlassBadge, GlassStatCard } from "~/shared/ui/glass";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import Icon from "~/shared/ui/Icon";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  DEMO_MOVIES,
  DEMO_TV_SHOWS,
  DEMO_ANIME,
  DEMO_UPCOMING,
  DEMO_STATS,
  DEMO_STAT_CARDS,
  DEMO_GENRE_BARS,
  DEMO_TYPE_SPLIT,
} from "./data/demoContent";
import DemoPosterRail from "./components/DemoPosterRail";
import DemoDiscoverShowcase from "./components/DemoDiscoverShowcase";
import DemoVaultShowcase from "./components/DemoVaultShowcase";
import DemoTimeline from "./components/DemoTimeline";
import DemoStatsShowcase from "./components/DemoStatsShowcase";
import ImportFlow from "./components/ImportFlow";
import ThemeStrip from "./components/ThemeStrip";

// ─── LandingPage ──────────────────────────────────────────────────

const LandingPage: Component = () => {
  const { openAuthModal } = useAuthModal();

  // Track scroll position to toggle the header's glass effect.
  const [scrolled, setScrolled] = createSignal(false);

  const handleScroll = () => {
    if (typeof window !== "undefined") {
      setScrolled(window.scrollY > 80);
    }
  };

  onMount(() => {
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
  });

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", handleScroll);
    }
  });

  // Smooth-scroll anchor — browser-only (called from onClick).
  const scrollToSection = (id: string) => () => {
    if (typeof document !== "undefined") {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // SSR-safe current year
  const currentYear = typeof window !== "undefined" ? new Date().getFullYear() : 2026;

  return (
    <div class="landing-page">
      {/* Skip Link — WCAG 2.4.1 */}
      <a href="#landing-hero" class="skip-link">
        Skip to content
      </a>

      {/* ─── 1. Sticky Navigation ────────────────────────────── */}
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
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
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

          {/* Desktop nav links */}
          <nav class="landing-header__nav" aria-label="Main navigation">
            <a
              href="#landing-discover"
              class="landing-header__link"
              onClick={(e) => { e.preventDefault(); scrollToSection("landing-discover")(); }}
            >
              Explore
            </a>
            <a
              href="#landing-features"
              class="landing-header__link"
              onClick={(e) => { e.preventDefault(); scrollToSection("landing-features")(); }}
            >
              Features
            </a>
          </nav>

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
              Get Started
            </GlassButton>
          </div>
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────── */}
      <main id="main-content" class="landing-main">

        {/* ─── 2. Cinematic Hero ────────────────────────────── */}
        <section
          id="landing-hero"
          class="landing-hero"
          aria-labelledby="landing-hero-title"
        >
          <div class="landing-hero__backdrop" aria-hidden="true" />
          <div class="landing-hero__gradient" aria-hidden="true" />
          <div class="landing-hero__vignette" aria-hidden="true" />

          <div class="landing-hero__content">
            <h1
              id="landing-hero-title"
              class="landing-hero__title animate-fade-up"
            >
              Everything you watch.{" "}
              <span class="landing-hero__title-accent">One cinematic vault.</span>
            </h1>

            <p
              class="landing-hero__subtitle animate-fade-up"
              style={{ "animation-delay": "60ms" }}
            >
              Track movies, TV shows and anime, discover what to watch next,
              organize your collections, and understand your taste — all in one
              beautiful place.
            </p>

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
                href="#landing-discover"
                class="landing-hero__scroll-link"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("landing-discover")();
                }}
              >
                Explore CineLog
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "20px" }}
                >
                  keyboard_arrow_down
                </span>
              </a>
            </div>
          </div>

          {/* Hero product UI — real poster rail */}
          <div class="landing-hero__product animate-fade-up" style={{ "animation-delay": "200ms" }}>
            <DemoPosterRail
              titles={DEMO_MOVIES.slice(0, 10)}
              showRating
            />
          </div>
        </section>

        {/* ─── 3. Media Intro ──────────────────────────────── */}
        <section class="landing-media-intro" aria-labelledby="media-intro-title">
          <div class="landing-media-intro__inner">
            <h2 id="media-intro-title" class="landing-media-intro__title animate-fade-up">
              Movies. Shows. Anime.{" "}
              <span class="landing-media-intro__title-accent">One place to keep them all.</span>
            </h2>
            <div class="landing-media-intro__rails">
              <div class="landing-media-intro__rail-group">
                <DemoPosterRail titles={DEMO_MOVIES.slice(0, 8)} title="Movies" />
              </div>
              <div class="landing-media-intro__rail-group">
                <DemoPosterRail titles={DEMO_TV_SHOWS.slice(0, 6)} title="TV Shows" />
              </div>
              <div class="landing-media-intro__rail-group">
                <DemoPosterRail titles={DEMO_ANIME.slice(0, 6)} title="Anime" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── 4. Discover ─────────────────────────────────── */}
        <section
          id="landing-discover"
          class="landing-section landing-discover-section"
          aria-labelledby="discover-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">Discover</span>
              <h2 id="discover-title" class="landing-section-title">
                Know what to watch next.
              </h2>
              <p class="landing-section-subtitle">
                CineLog learns from what you watch to make discovery feel personal.
                Spotlight picks, genre-deep dives, hidden gems — every visit surfaces
                something you'll love.
              </p>
            </div>
            <DemoDiscoverShowcase />
          </div>
        </section>

        {/* ─── 5. Watchlist / Vault ────────────────────────── */}
        <section
          class="landing-section landing-vault-section"
          aria-labelledby="vault-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header landing-section-header--right">
              <span class="landing-section-eyebrow">Your Vault</span>
              <h2 id="vault-title" class="landing-section-title">
                Your entire watch life.{" "}
                <span class="landing-section-title-accent">Organized.</span>
              </h2>
              <p class="landing-section-subtitle">
                One-tap logging, smart continue-watching, status filters,
                tags, episode progress, and ratings — everything about your
                watching in a single, beautiful interface.
              </p>
            </div>
            <DemoVaultShowcase />
          </div>
        </section>

        {/* ─── 6. Cinematic Universes ─────────────────────── */}
        <section
          id="landing-features"
          class="landing-section landing-universe-section"
          aria-labelledby="universe-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">Cinematic Universes</span>
              <h2 id="universe-title" class="landing-section-title">
                Watch the universe{" "}
                <span class="landing-section-title-accent">your way.</span>
              </h2>
              <p class="landing-section-subtitle">
                Dive into the MCU, Star Wars, and 50+ franchises with
                interactive timelines, phases, and custom viewing orders.
                Build your own canon with Smart Collections.
              </p>
            </div>
            <DemoTimeline />
          </div>
        </section>

        {/* ─── 7. Statistics + Your Story ──────────────────── */}
        <section
          class="landing-section landing-stats-section"
          aria-labelledby="stats-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header landing-section-header--right">
              <span class="landing-section-eyebrow">Your Story</span>
              <h2 id="stats-title" class="landing-section-title">
                Your watching habits have{" "}
                <span class="landing-section-title-accent">a story.</span>
              </h2>
              <p class="landing-section-subtitle">
                CineLog turns your viewing history into a personal cinematic
                reflection. Genre breakdowns, rating distributions, watch pace
                trends, and a narrative only your library can tell.
              </p>
            </div>
            <DemoStatsShowcase />
          </div>
        </section>

        {/* ─── 8. Upcoming + Reminders ────────────────────── */}
        <section
          class="landing-section landing-upcoming-section"
          aria-labelledby="upcoming-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">Upcoming</span>
              <h2 id="upcoming-title" class="landing-section-title">
                Never miss{" "}
                <span class="landing-section-title-accent">what's next.</span>
              </h2>
              <p class="landing-section-subtitle">
                Track upcoming releases, set reminders, and get notified
                when new episodes or films drop. Calendar view, countdown
                badges, and a notification center that keeps you in the loop.
              </p>
            </div>
            <div class="landing-upcoming-grid">
              <For each={DEMO_UPCOMING}>
                {(item, idx) => (
                  <GlassCard
                    variant="glass"
                    size="compact"
                    hoverable
                    class="landing-upcoming__card animate-fade-up"
                    style={{ "animation-delay": `${idx() * 60}ms` }}
                  >
                    <div class="landing-upcoming__poster">
                      <Icon name="movie" fill style={{ "font-size": "28px", color: "var(--text-dim)" }} />
                    </div>
                    <div class="landing-upcoming__info">
                      <span class="landing-upcoming__title">{item.title}</span>
                      <GlassBadge
                        intent={item.type === "anime" ? "warning" : item.type === "tv" ? "info" : "primary"}
                        label={item.type === "anime" ? "Anime" : item.type === "tv" ? "TV" : "Movie"}
                        size="compact"
                        glass
                      />
                      <span class="landing-upcoming__date">
                        <Icon name="calendar_today" style={{ "font-size": "14px" }} />
                        {new Date(item.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </GlassCard>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ─── 9. Import / Sync ────────────────────────────── */}
        <section
          class="landing-section landing-import-section"
          aria-labelledby="import-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header landing-section-header--right">
              <span class="landing-section-eyebrow">Import & Sync</span>
              <h2 id="import-title" class="landing-section-title">
                Already have a watch history?{" "}
                <span class="landing-section-title-accent">Bring it with you.</span>
              </h2>
              <p class="landing-section-subtitle">
                Import from Trakt, Letterboxd, IMDb, and more. Export and back
                up anytime. Your library syncs across every device in real time.
              </p>
            </div>
            <ImportFlow />
            <div class="landing-import__features">
              <GlassCard variant="glass" size="compact" class="landing-import__feature">
                <Icon name="cloud_sync" fill style={{ "font-size": "24px", color: "var(--p)" }} />
                <span>Realtime cross-device sync</span>
              </GlassCard>
              <GlassCard variant="glass" size="compact" class="landing-import__feature">
                <Icon name="download" fill style={{ "font-size": "24px", color: "var(--p)" }} />
                <span>Export & backup anytime</span>
              </GlassCard>
              <GlassCard variant="glass" size="compact" class="landing-import__feature">
                <Icon name="install_mobile" fill style={{ "font-size": "24px", color: "var(--p)" }} />
                <span>Installable PWA</span>
              </GlassCard>
            </div>
          </div>
        </section>

        {/* ─── 10. Personalization ─────────────────────────── */}
        <section
          class="landing-section landing-personalization-section"
          aria-labelledby="personalization-title"
        >
          <div class="landing-section__inner">
            <div class="landing-section-header">
              <span class="landing-section-eyebrow">Personalization</span>
              <h2 id="personalization-title" class="landing-section-title">
                Make CineLog feel like{" "}
                <span class="landing-section-title-accent">yours.</span>
              </h2>
            </div>
            <ThemeStrip />
          </div>
        </section>

        {/* ─── 11. Cross-Device / PWA ─────────────────────── */}
        <section class="landing-crossdevice" aria-labelledby="crossdevice-title">
          <div class="landing-crossdevice__inner">
            <h2 id="crossdevice-title" class="landing-crossdevice__title">
              Designed to travel with you.
            </h2>
            <p class="landing-crossdevice__subtitle">
              Phone, desktop, or installed as a PWA — CineLog is
              built to go wherever you go.
            </p>
            <div class="landing-crossdevice__devices">
              <div class="landing-crossdevice__device">
                <Icon name="smartphone" fill style={{ "font-size": "32px", color: "var(--p)" }} />
                <span>Phone</span>
              </div>
              <div class="landing-crossdevice__arrow" aria-hidden="true">
                <Icon name="arrow_forward" style={{ "font-size": "20px", color: "var(--text-dim)" }} />
              </div>
              <div class="landing-crossdevice__device">
                <Icon name="desktop_windows" fill style={{ "font-size": "32px", color: "var(--p)" }} />
                <span>Desktop</span>
              </div>
              <div class="landing-crossdevice__arrow" aria-hidden="true">
                <Icon name="arrow_forward" style={{ "font-size": "20px", color: "var(--text-dim)" }} />
              </div>
              <div class="landing-crossdevice__device">
                <Icon name="install_desktop" fill style={{ "font-size": "32px", color: "var(--p)" }} />
                <span>Installed PWA</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 12. Final CTA ─────────────────────────────────── */}
        <section class="landing-cta" aria-labelledby="cta-title">
          <div class="landing-cta__inner">
            <div class="landing-cta__glow" aria-hidden="true" />
            <h2 id="cta-title" class="landing-cta__title">
              Your cinematic universe starts here.
            </h2>
            <p class="landing-cta__subtitle">
              Track what you love. Discover what comes next.
            </p>
            <div class="landing-cta__buttons">
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
                href="#landing-discover"
                class="landing-cta__secondary"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("landing-discover")();
                }}
              >
                Explore CineLog
              </a>
            </div>
          </div>
        </section>

        {/* ─── 13. Footer ────────────────────────────────────── */}
        <footer class="landing-footer" role="contentinfo">
          <div class="landing-footer__inner">
            <div class="landing-footer__brand">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  "font-size": "24px",
                  color: "var(--p)",
                  "font-variation-settings": "'FILL' 1",
                }}
              >
                movie
              </span>
              <span class="landing-footer__brand-text">CineLog</span>
            </div>
            <nav class="landing-footer__links" aria-label="Footer navigation">
              <A href="/discover" class="landing-footer__link">Discover</A>
              <a href="https://github.com/Aman24-0/CineLog-V2" class="landing-footer__link" target="_blank" rel="noopener noreferrer">GitHub</a>
            </nav>
            <p class="landing-footer__copyright">
              &copy; {currentYear} CineLog. Crafted for cinephiles.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;
