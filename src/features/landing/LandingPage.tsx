// src/features/landing/LandingPage.tsx
//
// CineLog V2 — Landing Page
// --------------------------
// A premium cinematic product website.
// The page communicates WHAT CineLog is, WHY it matters,
// and HOW IT FEELS — through visuals, not feature lists.
//
// Sections:
//   1. Navigation (header with only Login)
//   2. Hero (headline + subtitle + product visual — NO CTA buttons)
//   3. Everything You Watch (continuous poster marquee)
//   4. Collections (MCU timeline visual)
//   5. Three Core Experiences (Track / Discover / Explore)
//   6. More Than a Watchlist (real watchlist cards + timeline + expanded stats)
//   7. FAQ (accordion)
//   8. Final CTA (Get Started Free)
//   9. Footer (social links, Terms, Privacy, copyright)
//
// CTA discipline:
//   Exactly TWO interactive auth triggers on the entire page:
//     1. "Login" (ghost) — header only.
//     2. "Get Started Free" (primary) — final CTA only.
//   No auth buttons in hero, footer, or anywhere else.

import { Component, createSignal, onCleanup, onMount, For, Show } from "solid-js";
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

// ─── Demo Timeline Data ───────────────────────────────────────────
// Inline demo data for the watch-history timeline.
// If DEMO_TIMELINE_ENTRIES is later added to demoContent,
// this can be replaced with an import.

interface DemoTimelineEntry {
  date: string;          // ISO date string, e.g. "2026-08-07"
  title: string;
  type: "movie" | "tv" | "anime";
  year: number;
  rating: number;
  posterPath: string;
  status: "watching" | "completed" | "planned" | "dropped";
}

const DEMO_TIMELINE_ENTRIES: readonly DemoTimelineEntry[] = [
  {
    date: "2026-08-07",
    title: "The Last of Us",
    type: "tv",
    year: 2023,
    rating: 8.8,
    posterPath: "/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
    status: "watching",
  },
  {
    date: "2026-08-03",
    title: "Dune: Part Two",
    type: "movie",
    year: 2024,
    rating: 8.6,
    posterPath: "/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg",
    status: "completed",
  },
  {
    date: "2026-08-01",
    title: "Jujutsu Kaisen",
    type: "anime",
    year: 2020,
    rating: 8.4,
    posterPath: "/sOow1zTzjsYSvqoCjwJa5sAiiPa.jpg",
    status: "watching",
  },
  {
    date: "2026-07-28",
    title: "Severance",
    type: "tv",
    year: 2022,
    rating: 8.7,
    posterPath: "/lAC6gf6iemJ8Xp5dW2VbZeexj7J.jpg",
    status: "watching",
  },
  {
    date: "2026-07-22",
    title: "The Dark Knight",
    type: "movie",
    year: 2008,
    rating: 9.0,
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    status: "completed",
  },
  {
    date: "2026-07-15",
    title: "Steins;Gate",
    type: "anime",
    year: 2011,
    rating: 8.8,
    posterPath: "/96R4bV7dB8ramaWceNKsxvJgCUd.jpg",
    status: "planned",
  },
] as const;

// ─── FAQ Data ─────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What is CineLog?",
    a: "A personal cinematic universe app for tracking, discovering, and organizing everything you watch.",
  },
  {
    q: "What can I track with CineLog?",
    a: "Movies, TV shows, and anime. Track watch status, ratings, progress, and more.",
  },
  {
    q: "Is CineLog free to use?",
    a: "Yes, CineLog offers a free tier with core tracking features.",
  },
  {
    q: "Can I organize movies and shows into collections?",
    a: "Yes, create custom collections and explore curated cinematic universes with timelines and viewing orders.",
  },
  {
    q: "Can I import my existing watch history?",
    a: "Yes, import from Trakt, Letterboxd, IMDb, and CSV files.",
  },
  {
    q: "Does CineLog work across devices?",
    a: "CineLog syncs your data through your account so it's available wherever you sign in.",
  },
  {
    q: "How does CineLog protect my data?",
    a: "Your watchlist and collections are private by default. Authentication is handled securely through Supabase.",
  },
] as const;

// ─── Status badge color map ──────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  watching: "#22c55e",  // green
  completed: "#3b82f6", // blue
  planned: "#f59e0b",   // amber
  dropped: "#ef4444",   // red
};

const STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  completed: "Completed",
  planned: "Planned",
  dropped: "Dropped",
};

// ─── Timeline group helper ────────────────────────────────────────

interface TimelineGroup {
  label: string; // e.g. "AUGUST 2026"
  entries: DemoTimelineEntry[];
}

function groupByMonth(entries: readonly DemoTimelineEntry[]): TimelineGroup[] {
  const map = new Map<string, DemoTimelineEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ ...entry });
  }
  const months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([key, items]) => {
      const [yr, mo] = key.split("-");
      return {
        label: `${months[parseInt(mo, 10) - 1]} ${yr}`,
        entries: items.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      };
    });
}

// ─── Format date pill ─────────────────────────────────────────────

function formatDatePill(isoDate: string): string {
  const d = new Date(isoDate);
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
}

// ─── Media type label ─────────────────────────────────────────────

function mediaTypeLabel(type: string): string {
  if (type === "tv") return "TV Show";
  if (type === "anime") return "Anime";
  return "Movie";
}

// ─── LandingPage ──────────────────────────────────────────────────

const LandingPage: Component = () => {
  const { openAuthModal } = useAuthModal();

  const [scrolled, setScrolled] = createSignal(false);
  const [openFaq, setOpenFaq] = createSignal<number | null>(null);

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

  // Vault items for the "More Than a Watchlist" section — first 6
  const vaultPreview = DEMO_VAULT_ITEMS.slice(0, 6);

  // MCU franchise for the Collections section
  const mcu = DEMO_FRANCHISES[0];

  // Timeline groups
  const timelineGroups = groupByMonth(DEMO_TIMELINE_ENTRIES);

  // FAQ accordion toggle
  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  };

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
            <a href="#landing-collections" class="landing-header__link"
              onClick={(e) => { e.preventDefault(); scrollTo("landing-collections")(); }}>Collections</a>
          </nav>

          <div class="landing-header__actions">
            <GlassButton variant="ghost" size="compact" onClick={() => openAuthModal()}
              aria-label="Log in">Login</GlassButton>
          </div>
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────── */}
      <main class="landing-main">

        {/* ─── 2. Hero (NO CTA buttons) ─────────────────────── */}
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

        {/* ─── 3. Everything You Watch — Continuous Marquee ─── */}
        <section id="landing-media" class="landing-media" aria-labelledby="media-title">
          <div class="landing-media__inner">
            <h2 id="media-title" class="landing-media__title">
              Movies. Shows. Anime.
              <span class="landing-media__title-accent">One place for all of them.</span>
            </h2>
            <p class="landing-media__subtitle">
              Your entire watch life, organized in one cinematic vault.
            </p>

            {/* Continuous horizontal marquee — CSS animation, no JS loop */}
            <div class="landing-marquee" aria-hidden="true">
              <div class="landing-marquee__track">
                {/* Render items twice for seamless infinite loop */}
                <For each={[...allMedia, ...allMedia]}>
                  {(item) => (
                    <div class="landing-marquee__item">
                      <SafeImage
                        src={tmdbImage(item.posterPath, "w342")}
                        alt=""
                        class="landing-marquee__img"
                        fallback={<div class="landing-marquee__fallback" />}
                        loading="lazy"
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Marquee CSS — injected once, respects prefers-reduced-motion */}
          <style>{`
            @keyframes landingMarquee {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
            .landing-marquee {
              overflow: hidden;
              width: 100%;
              margin-top: 2.5rem;
            }
            .landing-marquee__track {
              display: flex;
              gap: 12px;
              width: max-content;
              will-change: transform;
              animation: landingMarquee 40s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .landing-marquee__track {
                animation-play-state: paused;
              }
            }
            .landing-marquee__item {
              flex-shrink: 0;
              width: 140px;
              aspect-ratio: 2 / 3;
              border-radius: 10px;
              overflow: hidden;
              background: var(--glass-bg, rgba(255,255,255,0.05));
            }
            .landing-marquee__img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .landing-marquee__fallback {
              width: 100%;
              height: 100%;
              background: linear-gradient(145deg, var(--glass-bg, rgba(255,255,255,0.05)), var(--glass-bg, rgba(255,255,255,0.02)));
            }
          `}</style>
        </section>

        {/* ─── 4. Collections (MCU Timeline) ────────────────── */}
        <section id="landing-collections" class="landing-collections" aria-labelledby="collections-title">
          <div class="landing-collections__inner">
            <span class="landing-collections__label">Collections</span>
            <h2 id="collections-title" class="landing-collections__title">
              Go deeper into the worlds you love.
            </h2>

            {/* MCU Timeline visual */}
            <div class="landing-collections__timeline">
              <span class="landing-collections__timeline-label">{mcu.name}</span>
              <div class="landing-collections__timeline-track">
                <For each={mcu.phases}>
                  {(phase) => (
                    <div class="landing-collections__phase">
                      <div class="landing-collections__phase-dot" />
                      <span class="landing-collections__phase-name">{phase.name}</span>
                      <span class="landing-collections__phase-years">{phase.years}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Collections section styles */}
          <style>{`
            .landing-collections {
              padding: 6rem 1.5rem 4rem;
              text-align: center;
            }
            .landing-collections__inner {
              max-width: 900px;
              margin: 0 auto;
            }
            .landing-collections__label {
              display: inline-block;
              font-size: 0.75rem;
              font-weight: 600;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--p, #e2b04a);
              margin-bottom: 0.75rem;
            }
            .landing-collections__title {
              font-size: clamp(1.75rem, 4vw, 2.75rem);
              font-weight: 700;
              color: var(--text-primary, #fff);
              margin: 0 0 2rem;
              line-height: 1.2;
            }
            .landing-collections__timeline {
              margin-top: 0;
            }
            .landing-collections__timeline-label {
              display: block;
              font-size: 0.85rem;
              font-weight: 600;
              letter-spacing: 0.06em;
              color: var(--p, #e2b04a);
              margin-bottom: 1.25rem;
            }
            .landing-collections__timeline-track {
              display: flex;
              align-items: flex-start;
              justify-content: center;
              gap: 2rem;
              padding: 1rem 0;
            }
            .landing-collections__phase {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 0.5rem;
              position: relative;
            }
            .landing-collections__phase-dot {
              width: 12px;
              height: 12px;
              border-radius: 50%;
              background: var(--p, #e2b04a);
              box-shadow: 0 0 12px var(--p, #e2b04a);
              flex-shrink: 0;
            }
            .landing-collections__phase-name {
              font-size: 0.8rem;
              font-weight: 600;
              color: var(--text-primary, #fff);
            }
            .landing-collections__phase-years {
              font-size: 0.7rem;
              color: var(--text-dim, rgba(255,255,255,0.5));
              letter-spacing: 0.04em;
            }
            @media (max-width: 640px) {
              .landing-collections__timeline-track {
                flex-direction: column;
                align-items: center;
                gap: 1.25rem;
              }
              .landing-collections__phase {
                flex-direction: row;
                gap: 0.75rem;
              }
            }
          `}</style>
        </section>

        {/* ─── 5. Three Core Experiences ───────────────────── */}
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

        {/* ─── 6. More Than a Watchlist ────────────────────── */}
        <section class="landing-more" aria-labelledby="more-title">
          <div class="landing-more__inner">
            <h2 id="more-title" class="landing-more__title">
              More than a watchlist.
            </h2>
            <p class="landing-more__subtitle">
              From your next watch to your entire viewing history, CineLog keeps your cinematic life in one place.
            </p>

            {/* ─ Watchlist + Timeline editorial layout ─ */}
            <div class="landing-more__editorial">

              {/* ─ Watchlist Cards (matching real MovieCard design) ─ */}
              <div class="landing-more__watchlist">
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
                    {(item) => {
                      const progress = item.episodeProgress
                        ? (item.episodeProgress.current / item.episodeProgress.total) * 100
                        : 0;
                      return (
                        <div class="landing-wl-card">
                          {/* Poster with 2:3 aspect ratio */}
                          <div class="landing-wl-card__poster">
                            <SafeImage
                              src={tmdbImage(item.posterPath, "w342")}
                              alt={item.title}
                              class="landing-wl-card__poster-img"
                              fallback={<div class="landing-wl-card__poster-fallback"><span class="material-symbols-outlined" aria-hidden="true">movie</span></div>}
                              loading="lazy"
                            />
                            {/* Dark gradient overlay at bottom */}
                            <div class="landing-wl-card__gradient" />
                            {/* Status badge at top-left */}
                            <span
                              class="landing-wl-card__status"
                              style={{
                                background: STATUS_COLORS[item.status] || "#888",
                              }}
                            >
                              {STATUS_LABELS[item.status] || item.status}
                            </span>
                            {/* Heart/favorite icon at top-right */}
                            <span class="landing-wl-card__heart" aria-label="Favorite">
                              <span class="material-symbols-outlined" aria-hidden="true"
                                style={{ "font-size": "18px" }}>favorite</span>
                            </span>
                            {/* Title over poster */}
                            <span class="landing-wl-card__title">{item.title}</span>
                            {/* Year · Rating */}
                            <span class="landing-wl-card__meta">
                              {item.year} · ★ {item.rating}
                            </span>
                            {/* Episode progress bar (TV shows only) */}
                            <Show when={item.episodeProgress}>
                              <div class="landing-wl-card__progress">
                                <div
                                  class="landing-wl-card__progress-fill"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>

              {/* ─ Timeline / Watch History ─ */}
              <div class="landing-more__timeline">
                <span class="landing-more__timeline-heading">Watch History</span>
                <div class="landing-timeline">
                  <For each={timelineGroups}>
                    {(group) => (
                      <div class="landing-timeline__group">
                        <span class="landing-timeline__month">{group.label}</span>
                        <For each={group.entries}>
                          {(entry, idx) => (
                            <div class="landing-timeline__entry">
                              {/* Vertical line + dot */}
                              <div class="landing-timeline__line-col">
                                <div class="landing-timeline__dot" />
                                <Show when={idx() < group.entries.length - 1}>
                                  <div class="landing-timeline__line" />
                                </Show>
                              </div>
                              {/* Date pill */}
                              <span class="landing-timeline__date">{formatDatePill(entry.date)}</span>
                              {/* Poster thumbnail */}
                              <div class="landing-timeline__thumb">
                                <SafeImage
                                  src={tmdbImage(entry.posterPath, "w92")}
                                  alt={entry.title}
                                  class="landing-timeline__thumb-img"
                                  fallback={<div class="landing-timeline__thumb-fallback" />}
                                  loading="lazy"
                                />
                              </div>
                              {/* Info cluster */}
                              <div class="landing-timeline__info">
                                <span class="landing-timeline__title">{entry.title}</span>
                                <span class="landing-timeline__detail">
                                  {mediaTypeLabel(entry.type)} · {entry.year} · ★ {entry.rating}
                                </span>
                                <span
                                  class="landing-timeline__status"
                                  style={{ color: STATUS_COLORS[entry.status] || "#888" }}
                                >
                                  {STATUS_LABELS[entry.status] || entry.status}
                                </span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>

            {/* ─ Expanded Statistics ─ */}
            <div class="landing-more__stats">
              <div class="landing-more__stat">
                <span class="landing-more__stat-value">500</span>
                <span class="landing-more__stat-label">Titles</span>
              </div>
              <div class="landing-more__stat">
                <span class="landing-more__stat-value">247</span>
                <span class="landing-more__stat-label">Movies</span>
              </div>
              <div class="landing-more__stat">
                <span class="landing-more__stat-value">253</span>
                <span class="landing-more__stat-label">Shows</span>
              </div>
              <div class="landing-more__stat">
                <span class="landing-more__stat-value">1,842</span>
                <span class="landing-more__stat-label">Hours</span>
              </div>
              <div class="landing-more__stat">
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

          {/* Watchlist card + timeline + stats styles */}
          <style>{`
            /* ── Editorial layout: side-by-side on desktop, stacked on mobile ── */
            .landing-more__editorial {
              display: grid;
              grid-template-columns: 1fr;
              gap: 3rem;
              margin-bottom: 3rem;
            }
            @media (min-width: 900px) {
              .landing-more__editorial {
                grid-template-columns: 1.2fr 0.8fr;
              }
            }

            /* ── Watchlist card (MovieCard design) ── */
            .landing-wl-card {
              position: relative;
              border-radius: 12px;
              overflow: hidden;
              background: var(--glass-bg, rgba(255,255,255,0.05));
              transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .landing-wl-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 12px 32px rgba(0,0,0,0.4);
            }
            .landing-wl-card__poster {
              position: relative;
              aspect-ratio: 2 / 3;
              overflow: hidden;
            }
            .landing-wl-card__poster-img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .landing-wl-card__poster-fallback {
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              background: linear-gradient(145deg, var(--glass-bg, rgba(255,255,255,0.05)), var(--glass-bg, rgba(255,255,255,0.02)));
              color: var(--text-dim, rgba(255,255,255,0.3));
              font-size: 32px;
            }
            /* Dark gradient overlay at poster bottom */
            .landing-wl-card__gradient {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 55%;
              background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
              pointer-events: none;
            }
            /* Status badge — top left */
            .landing-wl-card__status {
              position: absolute;
              top: 8px;
              left: 8px;
              z-index: 3;
              padding: 2px 8px;
              border-radius: 6px;
              font-size: 0.6rem;
              font-weight: 700;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #fff;
              line-height: 1.5;
            }
            /* Heart icon — top right */
            .landing-wl-card__heart {
              position: absolute;
              top: 8px;
              right: 8px;
              z-index: 3;
              color: rgba(255,255,255,0.7);
              cursor: pointer;
              transition: color 0.15s;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .landing-wl-card__heart:hover {
              color: #ef4444;
            }
            /* Title over poster bottom */
            .landing-wl-card__title {
              position: absolute;
              bottom: 28px;
              left: 10px;
              right: 10px;
              z-index: 3;
              font-size: 0.8rem;
              font-weight: 700;
              color: #fff;
              line-height: 1.3;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            /* Year · Rating meta */
            .landing-wl-card__meta {
              position: absolute;
              bottom: 12px;
              left: 10px;
              z-index: 3;
              font-size: 0.65rem;
              color: rgba(255,255,255,0.6);
              letter-spacing: 0.02em;
            }
            /* Episode progress bar at poster bottom edge */
            .landing-wl-card__progress {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 3px;
              background: rgba(255,255,255,0.1);
              z-index: 4;
            }
            .landing-wl-card__progress-fill {
              height: 100%;
              background: var(--p, #e2b04a);
              border-radius: 0 2px 2px 0;
              transition: width 0.3s ease;
            }

            /* ── Timeline ── */
            .landing-more__timeline-heading {
              display: block;
              font-size: 0.75rem;
              font-weight: 600;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: var(--text-dim, rgba(255,255,255,0.5));
              margin-bottom: 1rem;
            }
            .landing-timeline__group {
              margin-bottom: 1.5rem;
            }
            .landing-timeline__month {
              display: block;
              font-size: 0.7rem;
              font-weight: 700;
              letter-spacing: 0.1em;
              color: var(--p, #e2b04a);
              margin-bottom: 0.75rem;
            }
            .landing-timeline__entry {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              margin-bottom: 1rem;
              position: relative;
            }
            .landing-timeline__line-col {
              display: flex;
              flex-direction: column;
              align-items: center;
              width: 12px;
              flex-shrink: 0;
              position: relative;
            }
            .landing-timeline__dot {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: var(--p, #e2b04a);
              flex-shrink: 0;
              margin-top: 4px;
            }
            .landing-timeline__line {
              width: 2px;
              flex: 1;
              min-height: 20px;
              background: rgba(255,255,255,0.08);
              margin-top: 4px;
            }
            .landing-timeline__date {
              font-size: 0.65rem;
              font-weight: 600;
              letter-spacing: 0.06em;
              color: var(--text-dim, rgba(255,255,255,0.5));
              min-width: 48px;
              flex-shrink: 0;
              padding-top: 2px;
            }
            .landing-timeline__thumb {
              width: 36px;
              aspect-ratio: 2 / 3;
              border-radius: 4px;
              overflow: hidden;
              flex-shrink: 0;
              background: var(--glass-bg, rgba(255,255,255,0.05));
            }
            .landing-timeline__thumb-img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .landing-timeline__thumb-fallback {
              width: 100%;
              height: 100%;
              background: var(--glass-bg, rgba(255,255,255,0.05));
            }
            .landing-timeline__info {
              display: flex;
              flex-direction: column;
              gap: 2px;
              min-width: 0;
            }
            .landing-timeline__title {
              font-size: 0.8rem;
              font-weight: 600;
              color: var(--text-primary, #fff);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .landing-timeline__detail {
              font-size: 0.65rem;
              color: var(--text-dim, rgba(255,255,255,0.5));
            }
            .landing-timeline__status {
              font-size: 0.6rem;
              font-weight: 600;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              margin-top: 1px;
            }

            /* ── Stats grid ── */
            .landing-more__stats {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 1rem;
              text-align: center;
              margin-top: 2rem;
            }
            @media (min-width: 640px) {
              .landing-more__stats {
                grid-template-columns: repeat(5, 1fr);
              }
            }
            .landing-more__stat {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
            }
            .landing-more__stat-value {
              font-size: clamp(1.5rem, 3vw, 2rem);
              font-weight: 700;
              color: var(--p, #e2b04a);
              line-height: 1;
            }
            .landing-more__stat-label {
              font-size: 0.7rem;
              font-weight: 500;
              color: var(--text-dim, rgba(255,255,255,0.5));
              letter-spacing: 0.06em;
              text-transform: uppercase;
            }
          `}</style>
        </section>

        {/* ─── 7. FAQ (Accordion) ───────────────────────────── */}
        <section class="landing-faq" aria-labelledby="faq-title">
          <div class="landing-faq__inner">
            <h2 id="faq-title" class="landing-faq__title">Frequently Asked Questions</h2>

            <div class="landing-faq__list" role="list">
              <For each={FAQ_ITEMS}>
                {(item, idx) => {
                  const index = idx();
                  const isOpen = () => openFaq() === index;
                  return (
                    <div class="landing-faq__item" role="listitem">
                      <button
                        class="landing-faq__question"
                        aria-expanded={isOpen()}
                        aria-controls={`faq-answer-${index}`}
                        onClick={() => toggleFaq(index)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            toggleFaq(index);
                          }
                        }}
                      >
                        <span class="landing-faq__question-text">{item.q}</span>
                        <span
                          class="landing-faq__chevron"
                          classList={{ "landing-faq__chevron--open": isOpen() }}
                          aria-hidden="true"
                        >
                          <span class="material-symbols-outlined"
                            style={{ "font-size": "20px" }}>expand_more</span>
                        </span>
                      </button>
                      <div
                        id={`faq-answer-${index}`}
                        class="landing-faq__answer-wrapper"
                        classList={{ "landing-faq__answer-wrapper--open": isOpen() }}
                        aria-hidden={!isOpen()}
                        role="region"
                      >
                        <p class="landing-faq__answer">{item.a}</p>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* FAQ styles */}
          <style>{`
            .landing-faq {
              padding: 5rem 1.5rem;
            }
            .landing-faq__inner {
              max-width: 720px;
              margin: 0 auto;
            }
            .landing-faq__title {
              font-size: clamp(1.5rem, 3.5vw, 2.25rem);
              font-weight: 700;
              color: var(--text-primary, #fff);
              text-align: center;
              margin: 0 0 2.5rem;
            }
            .landing-faq__list {
              display: flex;
              flex-direction: column;
              gap: 0;
            }
            .landing-faq__item {
              border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .landing-faq__question {
              width: 100%;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 1rem;
              padding: 1.15rem 0;
              background: none;
              border: none;
              cursor: pointer;
              text-align: left;
              color: var(--text-primary, #fff);
              font-size: 0.95rem;
              font-weight: 600;
              font-family: inherit;
              line-height: 1.4;
              transition: color 0.15s;
            }
            .landing-faq__question:hover,
            .landing-faq__question:focus-visible {
              color: var(--p, #e2b04a);
              outline: none;
            }
            .landing-faq__question:focus-visible {
              box-shadow: inset 0 0 0 2px var(--p, #e2b04a);
              border-radius: 4px;
            }
            .landing-faq__question-text {
              flex: 1;
              min-width: 0;
            }
            .landing-faq__chevron {
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              color: var(--text-dim, rgba(255,255,255,0.5));
              transition: transform 0.25s ease, color 0.15s;
              transform: rotate(0deg);
            }
            .landing-faq__chevron--open {
              transform: rotate(180deg);
              color: var(--p, #e2b04a);
            }
            .landing-faq__answer-wrapper {
              max-height: 0;
              overflow: hidden;
              transition: max-height 0.3s ease, opacity 0.3s ease;
              opacity: 0;
            }
            .landing-faq__answer-wrapper--open {
              max-height: 200px;
              opacity: 1;
            }
            .landing-faq__answer {
              padding: 0 0 1.15rem;
              font-size: 0.85rem;
              line-height: 1.6;
              color: var(--text-dim, rgba(255,255,255,0.65));
            }
          `}</style>
        </section>

        {/* ─── 8. Final CTA ──────────────────────────────────── */}
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

        {/* ─── 9. Footer ─────────────────────────────────────── */}
        <footer class="landing-footer" role="contentinfo">
          <div class="landing-footer__inner">
            <div class="landing-footer__brand">
              <span class="material-symbols-outlined" aria-hidden="true"
                style={{ "font-size": "20px", color: "var(--p)", "font-variation-settings": "'FILL' 1" }}>movie</span>
              <span class="landing-footer__brand-text">CineLog</span>
            </div>
            <p class="landing-footer__tagline">Your cinematic universe, perfected.</p>

            {/* Social icons — placeholder <a> elements */}
            <div class="landing-footer__social">
              <a
                href="#"
                class="landing-footer__social-link"
                aria-label="Facebook"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.preventDefault()}
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  style={{ "font-size": "20px", "font-variation-settings": "'FILL' 0" }}>share</span>
              </a>
              <a
                href="#"
                class="landing-footer__social-link"
                aria-label="Instagram"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.preventDefault()}
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  style={{ "font-size": "20px", "font-variation-settings": "'FILL' 0" }}>photo_camera</span>
              </a>
              <a
                href="#"
                class="landing-footer__social-link"
                aria-label="Twitter / X"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.preventDefault()}
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  style={{ "font-size": "20px", "font-variation-settings": "'FILL' 0" }}>close</span>
              </a>
              <a
                href="#"
                class="landing-footer__social-link"
                aria-label="Discord"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.preventDefault()}
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  style={{ "font-size": "20px", "font-variation-settings": "'FILL' 0" }}>forum</span>
              </a>
            </div>

            {/* Navigation links: Terms, Privacy */}
            <nav class="landing-footer__links" aria-label="Footer navigation">
              <A href="/terms" class="landing-footer__link">Terms</A>
              <A href="/privacy" class="landing-footer__link">Privacy</A>
            </nav>

            <p class="landing-footer__copy">&copy; {year} CineLog</p>
          </div>

          {/* Footer styles */}
          <style>{`
            .landing-footer__social {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 16px;
              margin: 1rem 0;
            }
            .landing-footer__social-link {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              color: var(--text-dim, rgba(255,255,255,0.5));
              background: rgba(255,255,255,0.04);
              transition: color 0.15s, background 0.15s;
              text-decoration: none;
            }
            .landing-footer__social-link:hover,
            .landing-footer__social-link:focus-visible {
              color: var(--p, #e2b04a);
              background: rgba(255,255,255,0.08);
            }
          `}</style>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;
