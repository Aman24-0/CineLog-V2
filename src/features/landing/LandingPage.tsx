// src/features/landing/LandingPage.tsx
//
// CineLog V2 — Landing Page
// --------------------------
// A premium cinematic product website. 6 sections only.
// The page communicates WHAT CineLog is, WHY it matters,
// and HOW IT FEELS — through visuals, not feature lists.
//
// Sections:
//   1. Navigation
//   2. Hero
//   3. Everything You Watch (poster composition)
//   4. Three Core Experiences (Track / Discover / Explore)
//   5. More Than a Watchlist (one strong product showcase)
//   6. Final CTA + Footer
//
// CTA discipline:
//   Exactly TWO buttons open AuthModal:
//     1. "Get Started Free" (primary) — header + hero + final CTA.
//     2. "Login" (ghost) — header only.
//   "Explore CineLog" is a scroll anchor, NOT a modal trigger.

import { Component, createSignal, onCleanup, onMount, For } from "solid-js";
import { A } from "@solidjs/router";
import { GlassButton } from "~/shared/ui/glass";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SafeImage from "~/shared/ui/SafeImage";
import {
  DEMO_MOVIES,
  DEMO_TV_SHOWS,
  DEMO_ANIME,
  DEMO_VAULT_ITEMS,
  DEMO_FRANCHISES,
} from "./data/demoContent";

// ─── LandingPage ──────────────────────────────────────────────────

const LandingPage: Component = () => {
  const { openAuthModal } = useAuthModal();

  const [scrolled, setScrolled] = createSignal(false);

  const handleScroll = () => {
    if (typeof window !== "undefined") {
      setScrolled(window.scrollY > 60);
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

  const scrollTo = (id: string) => () => {
    if (typeof document !== "undefined") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const year = typeof window !== "undefined" ? new Date().getFullYear() : 2026;

  // Mix of movies + TV + anime for the "Everything You Watch" poster rail
  const allMedia = [
    ...DEMO_MOVIES.slice(0, 4),
    ...DEMO_TV_SHOWS.slice(0, 3),
    ...DEMO_ANIME.slice(0, 3),
  ];

  // Vault items for the "More Than a Watchlist" section — just the first 6
  const vaultPreview = DEMO_VAULT_ITEMS.slice(0, 6);

  // MCU phases for the Explore experience
  const mcu = DEMO_FRANCHISES[0];

  return (
    <div class="landing-page">
      <a href="#landing-hero" class="skip-link">Skip to content</a>

      {/* ─── 1. Navigation ──────────────────────────────────── */}
      <header
        class="landing-header"
        classList={{ "landing-header--scrolled": scrolled() }}
        role="banner"
      >
        <div class="landing-header__inner">
          <A
            href="/"
            class="landing-logo"
            aria-label="CineLog home"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span class="material-symbols-outlined landing-logo__icon" aria-hidden="true"
              style={{ "font-variation-settings": "'FILL' 1" }}>movie</span>
            <span class="landing-logo__text">CineLog</span>
          </A>

          <nav class="landing-header__nav" aria-label="Main navigation">
            <a href="#landing-experiences" class="landing-header__link"
              onClick={(e) => { e.preventDefault(); scrollTo("landing-experiences")(); }}>Explore</a>
          </nav>

          <div class="landing-header__actions">
            <GlassButton variant="ghost" size="compact" onClick={() => openAuthModal()}
              aria-label="Log in">Login</GlassButton>
            <GlassButton variant="primary" size="compact" onClick={() => openAuthModal()}
              aria-label="Create a new account">Get Started</GlassButton>
          </div>
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────── */}
      <main class="landing-main">

        {/* ─── 2. Hero ─────────────────────────────────────── */}
        <section id="landing-hero" class="landing-hero" aria-labelledby="hero-title">
          <div class="landing-hero__backdrop" aria-hidden="true" />
          <div class="landing-hero__gradient" aria-hidden="true" />

          <div class="landing-hero__content">
            <h1 id="hero-title" class="landing-hero__title">
              Everything you watch.<br />
              <span class="landing-hero__title-accent">One cinematic vault.</span>
            </h1>
            <p class="landing-hero__subtitle">
              Track movies, shows, and anime. Discover what to watch next,
              organize your collection, and build your own cinematic universe.
            </p>
            <div class="landing-hero__ctas">
              <GlassButton variant="primary" size="large" icon="rocket_launch"
                onClick={() => openAuthModal()}
                aria-label="Get started for free">Get Started Free</GlassButton>
              <button class="landing-hero__scroll-btn"
                onClick={scrollTo("landing-media")}>
                Explore CineLog
                <span class="material-symbols-outlined" aria-hidden="true"
                  style={{ "font-size": "18px" }}>keyboard_arrow_down</span>
              </button>
            </div>
          </div>

          {/* Hero product composition — one large CineLog interface */}
          <div class="landing-hero__product">
            <div class="landing-hero__product-frame">
              {/* Mock Discover Spotlight — one large backdrop + 5 small posters */}
              <div class="landing-hero__spotlight">
                <SafeImage
                  src={tmdbImage(DEMO_MOVIES[0].posterPath, "w780")}
                  alt="Inception"
                  class="landing-hero__spotlight-img"
                  fallback={<div class="landing-hero__spotlight-fallback" />}
                  loading="eager"
                />
                <div class="landing-hero__spotlight-overlay" />
                <div class="landing-hero__spotlight-info">
                  <span class="landing-hero__spotlight-year">{DEMO_MOVIES[0].year}</span>
                  <span class="landing-hero__spotlight-title">{DEMO_MOVIES[0].title}</span>
                  <span class="landing-hero__spotlight-rating">★ {DEMO_MOVIES[0].rating}</span>
                </div>
              </div>
              <div class="landing-hero__poster-row">
                <For each={DEMO_MOVIES.slice(1, 6)}>
                  {(m) => (
                    <div class="landing-hero__poster-item">
                      <SafeImage
                        src={tmdbImage(m.posterPath, "w342")}
                        alt={m.title}
                        class="landing-hero__poster-img"
                        fallback={<div class="landing-hero__poster-fallback" />}
                        loading="lazy"
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 3. Everything You Watch ─────────────────────── */}
        <section id="landing-media" class="landing-media" aria-labelledby="media-title">
          <div class="landing-media__inner">
            <h2 id="media-title" class="landing-media__title">
              Movies. Shows. Anime.
              <span class="landing-media__title-accent">One place for all of them.</span>
            </h2>
            <p class="landing-media__subtitle">
              Your entire watch life, organized in one cinematic vault.
            </p>
            <div class="landing-media__posters">
              <For each={allMedia}>
                {(item) => (
                  <div class="landing-media__poster">
                    <SafeImage
                      src={tmdbImage(item.posterPath, "w342")}
                      alt={item.title}
                      class="landing-media__poster-img"
                      fallback={<div class="landing-media__poster-fallback" />}
                      loading="lazy"
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ─── 4. Three Core Experiences ───────────────────── */}
        <section id="landing-experiences" class="landing-experiences" aria-labelledby="exp-title">
          <div class="landing-experiences__inner">

            {/* TRACK */}
            <div class="landing-exp landing-exp--track">
              <div class="landing-exp__visual landing-exp__visual--track">
                <div class="landing-exp__vault-mock">
                  <For each={vaultPreview.slice(0, 4)}>
                    {(item) => (
                      <div class="landing-exp__vault-item">
                        <SafeImage
                          src={tmdbImage(item.posterPath, "w185")}
                          alt={item.title}
                          class="landing-exp__vault-poster"
                          fallback={<div class="landing-exp__vault-fallback"><span class="material-symbols-outlined" aria-hidden="true">movie</span></div>}
                          loading="lazy"
                        />
                        <div class="landing-exp__vault-meta">
                          <span class="landing-exp__vault-name">{item.title}</span>
                          <span class={`landing-exp__vault-status landing-exp__vault-status--${item.status}`} />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <div class="landing-exp__text">
                <span class="landing-exp__label">Track</span>
                <h3 class="landing-exp__heading">Your watch life, organized.</h3>
                <p class="landing-exp__desc">
                  Track what you're watching, what you've finished, and exactly where you left off.
                </p>
              </div>
            </div>

            {/* DISCOVER */}
            <div class="landing-exp landing-exp--discover">
              <div class="landing-exp__text">
                <span class="landing-exp__label">Discover</span>
                <h3 class="landing-exp__heading">Always know what to watch next.</h3>
                <p class="landing-exp__desc">
                  Explore movies, shows, and anime through a discovery experience shaped around your taste.
                </p>
              </div>
              <div class="landing-exp__visual landing-exp__visual--discover">
                <div class="landing-exp__discover-mock">
                  <div class="landing-exp__discover-spotlight">
                    <SafeImage
                      src={tmdbImage(DEMO_TV_SHOWS[0].posterPath, "w780")}
                      alt="Breaking Bad"
                      class="landing-exp__discover-img"
                      fallback={<div class="landing-exp__discover-fallback" />}
                      loading="lazy"
                    />
                    <div class="landing-exp__discover-overlay" />
                    <div class="landing-exp__discover-label">
                      <span class="landing-exp__discover-tag">Spotlight</span>
                      <span class="landing-exp__discover-name">{DEMO_TV_SHOWS[0].title}</span>
                    </div>
                  </div>
                  <div class="landing-exp__discover-rail">
                    <For each={DEMO_MOVIES.slice(2, 6)}>
                      {(m) => (
                        <SafeImage
                          src={tmdbImage(m.posterPath, "w185")}
                          alt={m.title}
                          class="landing-exp__rail-img"
                          fallback={<div class="landing-exp__rail-fallback" />}
                          loading="lazy"
                        />
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>

            {/* EXPLORE */}
            <div class="landing-exp landing-exp--explore">
              <div class="landing-exp__visual landing-exp__visual--explore">
                <div class="landing-exp__timeline">
                  <span class="landing-exp__timeline-label">{mcu.name}</span>
                  <div class="landing-exp__timeline-track">
                    <For each={mcu.phases}>
                      {(phase) => (
                        <div class="landing-exp__phase">
                          <div class="landing-exp__phase-dot" />
                          <span class="landing-exp__phase-name">{phase.name}</span>
                          <span class="landing-exp__phase-years">{phase.years}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
              <div class="landing-exp__text">
                <span class="landing-exp__label">Explore</span>
                <h3 class="landing-exp__heading">Go deeper into the worlds you love.</h3>
                <p class="landing-exp__desc">
                  Explore cinematic universes, collections, timelines, and viewing orders.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* ─── 5. More Than a Watchlist ────────────────────── */}
        <section class="landing-more" aria-labelledby="more-title">
          <div class="landing-more__inner">
            <h2 id="more-title" class="landing-more__title">
              More than a watchlist.
            </h2>
            <p class="landing-more__subtitle">
              From your next watch to your entire viewing history, CineLog keeps your cinematic life in one place.
            </p>

            {/* Main vault interface */}
            <div class="landing-more__vault">
              <div class="landing-more__vault-header">
                <span class="landing-more__vault-label">Your Vault</span>
                <div class="landing-more__vault-tabs">
                  <span class="landing-more__tab landing-more__tab--active">All</span>
                  <span class="landing-more__tab">Watching</span>
                  <span class="landing-more__tab">Completed</span>
                </div>
              </div>
              <div class="landing-more__vault-grid">
                <For each={vaultPreview}>
                  {(item) => (
                    <div class="landing-more__item">
                      <SafeImage
                        src={tmdbImage(item.posterPath, "w342")}
                        alt={item.title}
                        class="landing-more__item-img"
                        fallback={<div class="landing-more__item-fallback"><span class="material-symbols-outlined" aria-hidden="true">movie</span></div>}
                        loading="lazy"
                      />
                      <div class="landing-more__item-info">
                        <span class="landing-more__item-title">{item.title}</span>
                        <span class="landing-more__item-year">{item.year}</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Small supporting details */}
            <div class="landing-more__details">
              <div class="landing-more__stats">
                <span class="landing-more__stat-value">247</span>
                <span class="landing-more__stat-label">Titles</span>
              </div>
              <div class="landing-more__stats">
                <span class="landing-more__stat-value">1,842</span>
                <span class="landing-more__stat-label">Hours</span>
              </div>
              <div class="landing-more__stats">
                <span class="landing-more__stat-value">7.9</span>
                <span class="landing-more__stat-label">Avg Rating</span>
              </div>
            </div>

            {/* Import mention */}
            <p class="landing-more__import-note">
              Bring your existing history with you.{' '}
              <span class="landing-more__import-sources">Trakt · Letterboxd · IMDb · TV Time · CSV</span>
            </p>
          </div>
        </section>

        {/* ─── 6. Final CTA + Footer ───────────────────────── */}
        <section class="landing-cta" aria-labelledby="cta-title">
          <div class="landing-cta__glow" aria-hidden="true" />
          <h2 id="cta-title" class="landing-cta__title">
            Your cinematic universe starts here.
          </h2>
          <p class="landing-cta__subtitle">
            Track what you love.<br />Discover what comes next.
          </p>
          <GlassButton variant="primary" size="large" icon="rocket_launch"
            onClick={() => openAuthModal()}
            aria-label="Get started for free">Get Started Free</GlassButton>
        </section>

        <footer class="landing-footer" role="contentinfo">
          <div class="landing-footer__inner">
            <div class="landing-footer__brand">
              <span class="material-symbols-outlined" aria-hidden="true"
                style={{ "font-size": "20px", color: "var(--p)", "font-variation-settings": "'FILL' 1" }}>movie</span>
              <span class="landing-footer__brand-text">CineLog</span>
            </div>
            <p class="landing-footer__tagline">Your cinematic universe, perfected.</p>
            <nav class="landing-footer__links" aria-label="Footer navigation">
              <A href="/discover" class="landing-footer__link">Explore</A>
              <a href="#" class="landing-footer__link"
                onClick={(e) => { e.preventDefault(); openAuthModal(); }}>Sign in</a>
            </nav>
            <p class="landing-footer__copy">&copy; {year} CineLog</p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;
