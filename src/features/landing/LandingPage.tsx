// src/features/landing/LandingPage.tsx
//
// CineLog V2 — Landing Page (CLEAN REBUILD)
// ------------------------------------------
// A premium cinematic product website.
// 10 sections, no duplicates, LABEL → HEADLINE → DESCRIPTION → VISUAL order.
//
// Sections:
//   1. Header — Logo left, Login right. Sticky/fixed 56px.
//   2. Hero — Headline + subtitle + product visual. NO CTA.
//   3. Everything You Watch — Marquee of posters (CSS @keyframes).
//   4. Collections — MCU timeline visual.
//   5. Track — Mock vault interface.
//   6. Discover — Spotlight poster + rail.
//   7. More Than a Watchlist — Cards + Timeline + Stats + Import.
//   8. FAQ — Accordion with 6 questions.
//   9. Final CTA — "Get Started Free" button.
//  10. Footer — Logo + tagline + social SVGs + links + copyright.
//
// CTA discipline:
//   Exactly TWO interactive auth triggers on the entire page:
//     1. "Login" (ghost) — header only.
//     2. "Get Started Free" (primary) — final CTA only.
//   No auth buttons in hero, footer, or anywhere else.
//
// SSR safety:
//   All window/document refs guarded with typeof checks or inside onMount/event handlers.

import { Component, createSignal, onMount, For, Show } from "solid-js";
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
  DEMO_TIMELINE_ENTRIES,
  DEMO_SPOTLIGHT,
  DEMO_STATS,
} from "./data/demoContent";
import type { DemoVaultItem, DemoTimelineEntry, WatchStatus } from "./data/demoContent";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Combined poster array for the continuous marquee */
const MARQUEE_TITLES = [...DEMO_MOVIES, ...DEMO_TV_SHOWS, ...DEMO_ANIME];

/** Duplicated for infinite-loop seamless scroll */
const MARQUEE_DUPLICATED = [...MARQUEE_TITLES, ...MARQUEE_TITLES];

/** Vault items for the "More Than a Watchlist" MovieCard-style section (6 cards) */
const VAULT_CARDS: readonly DemoVaultItem[] = DEMO_VAULT_ITEMS.slice(0, 6);

/** MCU franchise (first entry in DEMO_FRANCHISES) */
const MCU_FRANCHISE = DEMO_FRANCHISES[0];

/** Status badge color map */
const STATUS_COLORS: Record<WatchStatus, string> = {
  watching: "bg-emerald-500",
  completed: "bg-blue-500",
  planned: "bg-amber-500",
  dropped: "bg-red-500",
};

/** Status label map */
const STATUS_LABELS: Record<WatchStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  planned: "Planned",
  dropped: "Dropped",
};

/** FAQ data — full paragraph answers */
const FAQ_ITEMS = [
  {
    q: "What is CineLog?",
    a: "CineLog is a personal cinematic universe — a premium application for tracking every movie, TV show, and anime you watch. It combines a powerful watchlist, intelligent discovery, and organized collections into one elegant experience. Whether you're keeping tabs on what you're currently watching, planning your next binge, or exploring an entire cinematic universe in order, CineLog keeps your viewing life organized and beautifully presented.",
  },
  {
    q: "What can I track with CineLog?",
    a: "You can track movies, TV shows, and anime — all in one place. For each title, CineLog stores your watch status (watching, completed, planned, or dropped), your personal rating, progress for TV series, and the date you watched it. Your entire viewing history builds automatically as you use the app, creating a comprehensive timeline of everything you've ever watched.",
  },
  {
    q: "Is CineLog free to use?",
    a: "Yes, CineLog offers a free tier that includes core tracking features — add titles to your watchlist, rate them, organize collections, and discover new content. Create an account to sync your data across devices and unlock the full experience.",
  },
  {
    q: "Can I import my existing watch history?",
    a: "Yes. CineLog supports importing your existing watch history from Trakt, Letterboxd, IMDb ratings, and CSV files. This means you don't have to start from scratch — bring your existing data and CineLog will integrate it seamlessly into your vault.",
  },
  {
    q: "Does CineLog work across devices?",
    a: "Yes. When you create an account, your watchlist, collections, ratings, and viewing history sync through your CineLog account. Sign in from any device and your cinematic universe is right where you left it.",
  },
  {
    q: "How does CineLog protect my data?",
    a: "Your watchlist and collections are private by default — only you can see them. Authentication is handled securely through Supabase with row-level security policies ensuring users can only access their own data. You can export or delete your data at any time through your account settings.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL SVG COMPONENTS
// Real brand logos as inline SVGs — no external icon package required.
// ═══════════════════════════════════════════════════════════════════════════

const FacebookIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={props.class}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.923-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={props.class}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.695.073 7.053.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

const TwitterIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={props.class}>
    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.9 4.9 0 002.15-2.727 9.86 9.86 0 01-3.12 1.192 4.92 4.92 0 00-8.384 4.482A13.96 13.96 0 011.64 3.161a4.92 4.92 0 001.594 6.57 4.9 4.9 0 01-2.228-.616v.061a4.926 4.926 0 003.946 4.827 4.897 4.897 0 01-2.224.084 4.93 4.93 0 004.634 3.417 9.867 9.867 0 01-6.102 2.107c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.986 0-.21 0-.423-.015-.634A9.935 9.935 0 0024 4.59z" />
  </svg>
);

const DiscordIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={props.class}>
    <path d="M20.317 4.369c-1.52-.703-3.14-1.215-4.828-1.508a.086.086 0 00-.092.043c-.208.375-.444.864-.608 1.25a18.181 18.181 0 00-5.762 0c-.164-.393-.4-.88-.612-1.25a.083.083 0 00-.092-.043 19.3 19.3 0 00-4.828 1.508.07.07 0 00-.032.027C.533 9.045-.32 13.58.099 18.057a.082.082 0 00.031.057 19.4 19.4 0 005.698 3.177.08.08 0 00.086-.027c.437-.594.824-1.221 1.154-1.88a.06.06 0 00-.034-.082 12.79 12.79 0 01-1.792-.832.06.06 0 01-.009-.1c.121-.09.242-.183.358-.276a.058.058 0 01.06-.01c3.765 1.727 7.838 1.727 11.562 0a.058.058 0 01.061.01c.116.093.237.186.358.276a.06.06 0 01-.008.1c-.576.336-1.163.617-1.793.832a.06.06 0 00-.033.082c.33.66.717 1.287 1.153 1.88a.08.08 0 00.086.028 19.39 19.39 0 005.699-3.177.082.082 0 00.031-.057c.548-5.482-.299-10.012-2.71-13.66a.07.07 0 00-.033-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// SITE SETTINGS (social links)
// TODO: Replace with a public /api/site-settings endpoint that returns
// site_settings without requiring admin auth. For now, defaults to empty.
// ═══════════════════════════════════════════════════════════════════════════

interface SiteSettings {
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  discordUrl: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  facebookUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  discordUrl: "",
};

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STYLES
// ═══════════════════════════════════════════════════════════════════════════

const SECTION_PADDING = "py-20 md:py-28";
const CONTENT_MAX = "max-w-6xl mx-auto px-6";
const LABEL_CLASS = "text-xs font-semibold tracking-[0.2em] uppercase text-gold mb-3";
const HEADLINE_CLASS = "text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight mb-4";
const DESCRIPTION_CLASS = "text-base md:text-lg text-white/60 max-w-2xl leading-relaxed";

// ═══════════════════════════════════════════════════════════════════════════
// 1. HEADER
// ═══════════════════════════════════════════════════════════════════════════

const Header: Component = () => {
  const { openAuthModal } = useAuthModal();

  return (
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6"
      style={{
        background: "rgba(8, 8, 14, 0.85)",
        "backdrop-filter": "blur(16px)",
        "-webkit-backdrop-filter": "blur(16px)",
        "border-bottom": "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Logo */}
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-gold text-2xl" style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
          movie
        </span>
        <span class="text-lg font-display font-bold text-white tracking-tight">
          CineLog
        </span>
      </div>

      {/* Login only — no Get Started */}
      <GlassButton variant="ghost" size="compact" onClick={() => openAuthModal()}>
        Login
      </GlassButton>
    </header>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. HERO
// ═══════════════════════════════════════════════════════════════════════════

const Hero: Component = () => {
  return (
    <section class="relative min-h-[90vh] flex flex-col items-center justify-center text-center pt-14 overflow-hidden">
      {/* Ambient gradient background */}
      <div
        class="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 40%, rgba(212,175,55,0.08) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(99,102,241,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Content */}
      <div class="relative z-10 max-w-3xl mx-auto px-6">
        <h1 class="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-[1.1] mb-6">
          Everything you watch.
          <br />
          <span class="text-gold">One cinematic vault.</span>
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-xl mx-auto leading-relaxed">
          Track every movie, show, and anime you love. Discover what comes next.
          Build collections that tell your story.
        </p>
      </div>

      {/* Product visual — decorative poster grid */}
      <div class="relative z-10 mt-16 flex gap-3 md:gap-4 opacity-60">
        {/* 3 staggered poster cards */}
        {[
          { path: DEMO_MOVIES[0].posterPath, offset: "mt-6" },
          { path: DEMO_TV_SHOWS[0].posterPath, offset: "" },
          { path: DEMO_ANIME[0].posterPath, offset: "mt-8" },
        ].map((item, i) => (
          <div
            class={`${item.offset} w-24 md:w-36 rounded-lg overflow-hidden shadow-2xl`}
            style={{
              transform: `rotate(${(i - 1) * 5}deg)`,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <SafeImage
              src={tmdbImage(item.path, "w342")}
              alt=""
              class="w-full h-auto object-cover"
              fallback={
                <div class="w-full aspect-[2/3] bg-white/5 flex items-center justify-center">
                  <span class="material-symbols-outlined text-white/20 text-2xl">movie</span>
                </div>
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. EVERYTHING YOU WATCH — Continuous Poster Marquee
// ═══════════════════════════════════════════════════════════════════════════

const EverythingYouWatch: Component = () => {
  return (
    <section class={`${SECTION_PADDING} overflow-hidden`}>
      <div class={`${CONTENT_MAX} text-center mb-12`}>
        <h2 class={HEADLINE_CLASS}>
          Movies. Shows. Anime.
          <br />
          <span class="text-gold">One place for all of them.</span>
        </h2>
        <p class={`${DESCRIPTION_CLASS} mx-auto`}>
          Whether it's the latest blockbuster, a cult-series binge, or that anime
          everyone's talking about — CineLog tracks them all in one unified vault.
          No more scattered lists across different apps.
        </p>
      </div>

      {/* Continuous poster marquee — right → left, infinite loop */}
      <div class="relative">
        {/* Fade edges */}
        <div class="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: "linear-gradient(to right, rgba(8,8,14,1), transparent)" }} />
        <div class="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: "linear-gradient(to left, rgba(8,8,14,1), transparent)" }} />

        <div
          class="flex gap-4"
          style={{
            animation: "marquee-scroll 40s linear infinite",
            width: "max-content",
          }}
        >
          <For each={MARQUEE_DUPLICATED}>
            {(title) => (
              <div class="flex-shrink-0 w-32 md:w-40 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <SafeImage
                  src={tmdbImage(title.posterPath, "w342")}
                  alt={title.title}
                  class="w-full aspect-[2/3] object-cover"
                  fallback={
                    <div class="w-full aspect-[2/3] bg-white/5 flex items-center justify-center">
                      <span class="material-symbols-outlined text-white/20">movie</span>
                    </div>
                  }
                />
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Inline keyframes + prefers-reduced-motion */}
      <style>{`
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .flex[style*="marquee-scroll"] {
            animation-play-state: paused !important;
          }
        }
      `}</style>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. COLLECTIONS — MCU Timeline Visual
// ═══════════════════════════════════════════════════════════════════════════

const Collections: Component = () => {
  return (
    <section class={`${SECTION_PADDING}`}>
      <div class={`${CONTENT_MAX}`}>
        {/* Label → Headline → Description */}
        <div class="mb-12">
          <p class={LABEL_CLASS}>Collections</p>
          <h2 class={HEADLINE_CLASS}>Go deeper into the worlds you love.</h2>
          <p class={DESCRIPTION_CLASS}>
            Don't just watch — explore. CineLog collections let you organize entire
            franchises, universes, and sagas in chronological order. See the full
            timeline, track your progress, and never lose your place.
          </p>
        </div>

        {/* MCU Timeline Visual — ONE franchise only */}
        <div class="relative max-w-3xl mx-auto">
          {/* Vertical gold timeline line */}
          <div
            class="absolute left-6 top-0 bottom-0 w-0.5"
            style={{ background: "linear-gradient(to bottom, transparent, #D4AF37 10%, #D4AF37 90%, transparent)" }}
          />

          <div class="space-y-10">
            <For each={MCU_FRANCHISE.phases}>
              {(phase, i) => (
                <div class="relative pl-16">
                  {/* Glowing node */}
                  <div
                    class="absolute left-4 top-1 w-5 h-5 rounded-full z-10"
                    style={{
                      background: "#D4AF37",
                      "box-shadow": "0 0 12px rgba(212,175,55,0.5), 0 0 24px rgba(212,175,55,0.2)",
                    }}
                  />

                  {/* Phase card */}
                  <div
                    class="rounded-xl p-5"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(212,175,55,0.15)",
                    }}
                  >
                    <div class="flex items-baseline gap-3 mb-3">
                      <h3 class="text-lg font-display font-semibold text-gold">
                        {phase.name}
                      </h3>
                      <span class="text-sm text-white/40">{phase.years}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <For each={phase.titles}>
                        {(title) => (
                          <span
                            class="text-xs px-2.5 py-1 rounded-md text-white/70"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            {title}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. TRACK — Mock Vault Interface
// ═══════════════════════════════════════════════════════════════════════════

const Track: Component = () => {
  const vaultTabs = ["Watching", "Planned", "Completed"] as const;
  const [activeTab, setActiveTab] = createSignal<number>(0);

  const filteredItems = () => {
    const statusMap: Record<string, WatchStatus> = {
      Watching: "watching",
      Planned: "planned",
      Completed: "completed",
    };
    const status = statusMap[vaultTabs[activeTab()]];
    return DEMO_VAULT_ITEMS.filter((item) => item.status === status).slice(0, 4);
  };

  return (
    <section class={`${SECTION_PADDING}`}>
      <div class={`${CONTENT_MAX}`}>
        {/* Label → Headline → Description */}
        <div class="mb-12">
          <p class={LABEL_CLASS}>Track</p>
          <h2 class={HEADLINE_CLASS}>Your watch life, organized.</h2>
          <p class={DESCRIPTION_CLASS}>
            Know exactly what you're watching, what's next, and what you've finished.
            CineLog keeps every status update, rating, and progress marker in one
            beautiful, searchable vault.
          </p>
        </div>

        {/* Mock Vault Interface */}
        <div
          class="max-w-2xl mx-auto rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Tabs */}
          <div class="flex border-b" style={{ "border-color": "rgba(255,255,255,0.06)" }}>
            <For each={vaultTabs}>
              {(tab, i) => (
                <button
                  class="flex-1 py-3 text-sm font-semibold transition-colors relative"
                  classList={{
                    "text-gold": activeTab() === i(),
                    "text-white/40 hover:text-white/60": activeTab() !== i(),
                  }}
                  onClick={() => setActiveTab(i())}
                >
                  {tab}
                  {/* Status dot */}
                  <span
                    class="inline-block w-1.5 h-1.5 rounded-full ml-1.5"
                    classList={{
                      "bg-emerald-500": tab === "Watching",
                      "bg-amber-500": tab === "Planned",
                      "bg-blue-500": tab === "Completed",
                    }}
                  />
                </button>
              )}
            </For>
          </div>

          {/* Items */}
          <div class="p-4 space-y-3">
            <For each={filteredItems()}>
              {(item) => (
                <div
                  class="flex items-center gap-3 rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  {/* Mini poster thumbnail */}
                  <div class="w-10 h-14 rounded overflow-hidden flex-shrink-0">
                    <SafeImage
                      src={tmdbImage(item.posterPath, "w92")}
                      alt={item.title}
                      class="w-full h-full object-cover"
                      fallback={<div class="w-full h-full bg-white/5" />}
                    />
                  </div>

                  {/* Info */}
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-white truncate">{item.title}</p>
                    <p class="text-xs text-white/40">
                      {item.year} · ★ {item.rating}
                    </p>
                  </div>

                  {/* Status dot */}
                  <span class={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[item.status]}`} />
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. DISCOVER — Spotlight + Poster Rail
// ═══════════════════════════════════════════════════════════════════════════

const Discover: Component = () => {
  return (
    <section class={`${SECTION_PADDING}`}>
      <div class={`${CONTENT_MAX}`}>
        {/* Label → Headline → Description */}
        <div class="mb-12">
          <p class={LABEL_CLASS}>Discover</p>
          <h2 class={HEADLINE_CLASS}>Always know what to watch next.</h2>
          <p class={DESCRIPTION_CLASS}>
            CineLog surfaces recommendations based on what you love — not what
            algorithms want to push. Explore trending titles, hidden gems, and
            the next entry in your favorite franchise.
          </p>
        </div>

        {/* Visual: large spotlight poster + smaller rail */}
        <div class="max-w-3xl mx-auto">
          {/* Spotlight poster */}
          <div
            class="relative rounded-2xl overflow-hidden mb-6"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <SafeImage
              src={tmdbImage(DEMO_SPOTLIGHT.backdropPath, "w780")}
              alt={DEMO_SPOTLIGHT.title}
              class="w-full aspect-video object-cover"
              fallback={
                <div class="w-full aspect-video bg-white/5 flex items-center justify-center">
                  <span class="material-symbols-outlined text-white/20 text-4xl">movie</span>
                </div>
              }
            />
            {/* Gradient overlay */}
            <div class="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(8,8,14,0.9) 0%, transparent 60%)" }} />
            <div class="absolute bottom-0 left-0 right-0 p-6">
              <p class="text-gold text-xs font-semibold tracking-wider uppercase mb-1">
                {DEMO_SPOTLIGHT.genres.join(" · ")}
              </p>
              <h3 class="text-xl md:text-2xl font-display font-bold text-white mb-1">
                {DEMO_SPOTLIGHT.title}
              </h3>
              <p class="text-sm text-white/50">
                {DEMO_SPOTLIGHT.year} · ★ {DEMO_SPOTLIGHT.rating} · "{DEMO_SPOTLIGHT.tagline}"
              </p>
            </div>
          </div>

          {/* Smaller poster rail beneath */}
          <div class="flex gap-3 overflow-x-auto pb-2" style={{ "scrollbar-width": "none" }}>
            <For each={DEMO_MOVIES.slice(0, 6)}>
              {(title) => (
                <div class="flex-shrink-0 w-24 md:w-28 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <SafeImage
                    src={tmdbImage(title.posterPath, "w342")}
                    alt={title.title}
                    class="w-full aspect-[2/3] object-cover"
                    fallback={
                      <div class="w-full aspect-[2/3] bg-white/5 flex items-center justify-center">
                        <span class="material-symbols-outlined text-white/20 text-sm">movie</span>
                      </div>
                    }
                  />
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. MORE THAN A WATCHLIST
//   (a) Watchlist cards matching REAL MovieCard style
//   (b) Timeline view
//   (c) Statistics
//   (d) Import mention
// ═══════════════════════════════════════════════════════════════════════════

const MoreThanAWatchlist: Component = () => {
  return (
    <section class={`${SECTION_PADDING}`}>
      <div class={`${CONTENT_MAX}`}>
        {/* Label → Headline → Description */}
        <div class="mb-16">
          <h2 class={HEADLINE_CLASS}>More than a watchlist.</h2>
          <p class={DESCRIPTION_CLASS}>
            CineLog isn't just about checking off titles. It's about building a
            living record of your cinematic journey — with real cards, a visual
            timeline, stats that tell your story, and the freedom to bring your
            history with you.
          </p>
        </div>

        {/* (a) Watchlist Cards — REAL MovieCard style */}
        <div class="mb-20">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <For each={VAULT_CARDS}>
              {(item) => (
                <div
                  class="relative rounded-lg overflow-hidden group"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {/* 2:3 Poster */}
                  <SafeImage
                    src={tmdbImage(item.posterPath, "w342")}
                    alt={item.title}
                    class="w-full aspect-[2/3] object-cover"
                    fallback={
                      <div class="w-full aspect-[2/3] bg-white/5 flex items-center justify-center">
                        <span class="material-symbols-outlined text-white/20">movie</span>
                      </div>
                    }
                  />

                  {/* Dark gradient overlay at bottom */}
                  <div
                    class="absolute bottom-0 left-0 right-0 h-1/2 pointer-events-none"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)" }}
                  />

                  {/* Status badge top-left */}
                  <span
                    class={`absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white ${STATUS_COLORS[item.status]}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>

                  {/* Heart icon top-right */}
                  <span
                    class="absolute top-2 right-2 material-symbols-outlined text-white/40 text-sm"
                    style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  >
                    favorite
                  </span>

                  {/* Title + meta at bottom */}
                  <div class="absolute bottom-0 left-0 right-0 p-2.5">
                    <p class="text-xs font-medium text-white leading-tight" style={{ display: "-webkit-box", "-webkit-line-clamp": "2", "-webkit-box-orient": "vertical", overflow: "hidden" }}>
                      {item.title}
                    </p>
                    <p class="text-[10px] text-white/50 mt-0.5">
                      {item.year} · ★ {item.rating}
                    </p>

                    {/* Episode progress bar for TV/anime */}
                    <Show when={item.episodeProgress}>
                      <div class="mt-1.5">
                        <div class="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div
                            class="h-full rounded-full bg-gold"
                            style={{ width: `${((item.episodeProgress?.current ?? 0) / (item.episodeProgress?.total ?? 1)) * 100}%` }}
                          />
                        </div>
                        <p class="text-[9px] text-white/30 mt-0.5">
                          {item.episodeProgress?.current}/{item.episodeProgress?.total} eps
                        </p>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* (b) Timeline View */}
        <div class="mb-20">
          <h3 class="text-2xl font-display font-bold text-white mb-2">
            Your history, in one timeline.
          </h3>
          <p class="text-white/50 mb-8 max-w-xl">
            Every watch, every rating, every status change — chronologically
            organized so you can look back on your journey.
          </p>

          {/* Timeline: group by month/year, vertical gold line, date pills, thumbnails */}
          <div class="relative max-w-2xl">
            {/* Vertical gold timeline line */}
            <div
              class="absolute left-[18px] top-0 bottom-0 w-0.5"
              style={{ background: "linear-gradient(to bottom, transparent, #D4AF37 5%, #D4AF37 95%, transparent)" }}
            />

            <div class="space-y-6">
              <For each={DEMO_TIMELINE_ENTRIES}>
                {(entry) => {
                  const date = new Date(entry.date);
                  const monthLabel = date.toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  });
                  const dayLabel = date.getDate();

                  return (
                    <div class="relative pl-12">
                      {/* Date pill on the line */}
                      <div
                        class="absolute left-0 top-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-gold z-10"
                        style={{
                          background: "rgba(8,8,14,0.9)",
                          border: "2px solid #D4AF37",
                          "box-shadow": "0 0 8px rgba(212,175,55,0.3)",
                        }}
                      >
                        {dayLabel}
                      </div>

                      {/* Entry row */}
                      <div
                        class="flex items-center gap-3 rounded-lg p-3"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        {/* Poster thumbnail */}
                        <div class="w-9 h-12 rounded overflow-hidden flex-shrink-0">
                          <SafeImage
                            src={tmdbImage(entry.posterPath, "w92")}
                            alt={entry.title}
                            class="w-full h-full object-cover"
                            fallback={<div class="w-full h-full bg-white/5" />}
                          />
                        </div>

                        {/* Info */}
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-white truncate">{entry.title}</p>
                          <p class="text-xs text-white/40">
                            {entry.type === "movie" ? "Movie" : entry.type === "tv" ? "TV Show" : "Anime"} · {entry.year} · ★ {entry.rating}
                            <Show when={entry.userRating}> · <span class="text-gold">♥ {entry.userRating}</span></Show>
                          </p>
                        </div>

                        {/* Status */}
                        <span class={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[entry.status]}`} />
                      </div>

                      {/* Month label (small) */}
                      <p class="text-[10px] text-white/30 mt-1 pl-0">{monthLabel}</p>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>

        {/* (c) Statistics — gold numbers */}
        <div class="mb-20">
          <div class="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
            {[
              { value: "500", label: "Titles" },
              { value: "247", label: "Movies" },
              { value: "253", label: "Shows" },
              { value: "1,842", label: "Hours" },
              { value: "7.9", label: "Avg Rating" },
            ].map((stat) => (
              <div>
                <p class="text-3xl md:text-4xl font-display font-bold text-gold">{stat.value}</p>
                <p class="text-sm text-white/40 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* (d) Import mention */}
        <div class="text-center">
          <p class="text-lg font-display font-semibold text-white mb-2">
            Bring your existing history with you.
          </p>
          <p class="text-sm text-white/40">
            Trakt · Letterboxd · IMDb · TV Time · CSV
          </p>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. FAQ — Accordion
// ═══════════════════════════════════════════════════════════════════════════

const FAQ: Component = () => {
  const [openIndex, setOpenIndex] = createSignal<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(index);
    }
  };

  return (
    <section class={`${SECTION_PADDING}`}>
      <div class={`${CONTENT_MAX} max-w-3xl mx-auto`}>
        <h2 class={`${HEADLINE_CLASS} text-center`}>
          Frequently Asked Questions
        </h2>

        <div class="mt-10 space-y-3">
          <For each={FAQ_ITEMS}>
            {(item, i) => {
              const index = i();
              const isOpen = () => openIndex() === index;

              return (
                <div
                  class="rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Question button */}
                  <button
                    class="w-full flex items-center justify-between p-5 text-left"
                    onClick={() => toggle(index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    aria-expanded={isOpen()}
                    aria-controls={`faq-answer-${index}`}
                  >
                    <span class="text-sm md:text-base font-semibold text-white pr-4">
                      {item.q}
                    </span>
                    <span
                      class="material-symbols-outlined text-white/40 text-xl flex-shrink-0 transition-transform duration-300"
                      style={{
                        transform: isOpen() ? "rotate(180deg)" : "rotate(0deg)",
                        "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                      }}
                    >
                      expand_more
                    </span>
                  </button>

                  {/* Answer — smooth expand */}
                  <div
                    id={`faq-answer-${index}`}
                    class="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{
                      "max-height": isOpen() ? "300px" : "0",
                      opacity: isOpen() ? 1 : 0,
                    }}
                    role="region"
                    aria-hidden={!isOpen()}
                  >
                    <p class="px-5 pb-5 text-sm text-white/50 leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 9. FINAL CTA
// ═══════════════════════════════════════════════════════════════════════════

const FinalCTA: Component = () => {
  const { openAuthModal } = useAuthModal();

  return (
    <section class={`${SECTION_PADDING} text-center`}>
      <div class={`${CONTENT_MAX}`}>
        {/* Ambient glow */}
        <div
          class="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(212,175,55,0.06) 0%, transparent 70%)",
          }}
        />

        <div class="relative z-10">
          <h2 class="text-3xl md:text-5xl font-display font-bold text-white leading-tight mb-4">
            Your cinematic universe
            <br />
            <span class="text-gold">starts here.</span>
          </h2>
          <p class="text-base md:text-lg text-white/50 max-w-md mx-auto mb-8">
            Track what you love. Discover what comes next.
          </p>
          <GlassButton
            variant="primary"
            size="large"
            onClick={() => openAuthModal()}
          >
            Get Started Free
          </GlassButton>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 10. FOOTER
// ═══════════════════════════════════════════════════════════════════════════

const Footer: Component = () => {
  // Site settings — social URLs fetched from public endpoint on mount
  // TODO: Replace with fetch to /api/site-settings once the public endpoint exists.
  const [settings, setSettings] = createSignal<SiteSettings>(DEFAULT_SETTINGS);

  onMount(() => {
    // Attempt to fetch public site settings; fall back to defaults on error.
    if (typeof window !== "undefined") {
      fetch("/api/site-settings")
        .then((res) => {
          if (!res.ok) throw new Error("No public settings endpoint");
          return res.json();
        })
        .then((data: Partial<SiteSettings>) => {
          setSettings({
            facebookUrl: data.facebookUrl ?? "",
            instagramUrl: data.instagramUrl ?? "",
            twitterUrl: data.twitterUrl ?? "",
            discordUrl: data.discordUrl ?? "",
          });
        })
        .catch(() => {
          // Endpoint not available yet — keep defaults (empty strings)
        });
    }
  });

  const s = settings;

  return (
    <footer
      class="py-12"
      style={{ "border-top": "1px solid rgba(255,255,255,0.06)" }}
    >
      <div class={`${CONTENT_MAX}`}>
        {/* Top row: logo + tagline */}
        <div class="flex flex-col items-center text-center mb-8">
          {/* CineLog logo */}
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-gold text-xl" style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
              movie
            </span>
            <span class="text-base font-display font-bold text-white tracking-tight">
              CineLog
            </span>
          </div>
          <p class="text-sm text-white/40">Your cinematic universe, perfected.</p>
        </div>

        {/* Social icons — only rendered when URL is non-empty */}
        <div class="flex items-center justify-center gap-5 mb-8">
          <Show when={s().facebookUrl}>
            <a
              href={s().facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-white/40 hover:text-white transition-colors"
              aria-label="Facebook"
            >
              <FacebookIcon class="w-5 h-5" />
            </a>
          </Show>
          <Show when={s().instagramUrl}>
            <a
              href={s().instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-white/40 hover:text-white transition-colors"
              aria-label="Instagram"
            >
              <InstagramIcon class="w-5 h-5" />
            </a>
          </Show>
          <Show when={s().twitterUrl}>
            <a
              href={s().twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-white/40 hover:text-white transition-colors"
              aria-label="Twitter"
            >
              <TwitterIcon class="w-5 h-5" />
            </a>
          </Show>
          <Show when={s().discordUrl}>
            <a
              href={s().discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-white/40 hover:text-white transition-colors"
              aria-label="Discord"
            >
              <DiscordIcon class="w-5 h-5" />
            </a>
          </Show>
        </div>

        {/* Bottom row: Terms/Privacy links + copyright */}
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-white/30">
          <a href="/terms" class="hover:text-white/50 transition-colors">Terms</a>
          <span class="hidden sm:inline">·</span>
          <a href="/privacy" class="hover:text-white/50 transition-colors">Privacy</a>
          <span class="hidden sm:inline">·</span>
          <span>&copy; 2026 CineLog</span>
        </div>
      </div>
    </footer>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE — Root Component
// ═══════════════════════════════════════════════════════════════════════════

const LandingPage: Component = () => {
  return (
    <div class="min-h-screen" style={{ background: "#08080E" }}>
      <Header />
      <main>
        <Hero />
        <EverythingYouWatch />
        <Collections />
        <Track />
        <Discover />
        <MoreThanAWatchlist />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
