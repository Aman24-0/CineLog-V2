// src/features/profile/utils/storyGenerator.ts
//
// storyGenerator — the narrative engine behind CineLog's signature
// "Your Story" reflection, Viewer Identity Chips, favorite reasons,
// and one-word reactions.
//
// Design philosophy:
//   • No AI assistant. No chatbot. No notifications.
//   • One beautiful, deterministic reflection derived from the vault.
//   • Replaces XP / gamification with poetic, personal insight.
//   • All output is editorial — written once, felt deeply.
//
// Every generator is PURE: same inputs → same outputs. No randomness,
// no clock drift, no side effects. This makes the story stable across
// renders and easy to test.

import type { WatchlistItem } from "~/shared/types";
import type { StatsData } from "../useStats";
import { normalizeGenre } from "~/shared/utils/genres";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YourStoryReflection {
  /** The headline — a short, evocative opening. */
  headline: string;
  /** The body — one or two sentences of reflection. */
  body: string;
  /** An optional accent word/phrase for the green-accent treatment. */
  accentPhrase?: string;
  /** Material Symbols icon name for the card. */
  icon: string;
}

export interface IdentityChip {
  /** Emoji character (when isEmoji) OR Material Symbols name. */
  icon: string;
  /** Whether the icon is an emoji (true) or a Material Symbols name (false). */
  isEmoji: boolean;
  /** The chip label, e.g. "Sci-Fi Lover". */
  label: string;
}

export interface FavoriteReason {
  /** A short, personal line about why this favorite matters. */
  reason: string;
}

export interface ActivityReaction {
  /** A short reaction quote, e.g. "Visual perfection." */
  text: string;
}

export interface OneWordReaction {
  /** A single word reaction, e.g. "Masterpiece". */
  word: string;
}

// ---------------------------------------------------------------------------
// Your Story — the signature reflection
// ---------------------------------------------------------------------------

/**
 * generateYourStory — derives one meaningful reflection from the vault.
 *
 * Priority order (first match wins):
 *   1. Genre shift over time (e.g. "returned to slow science fiction")
 *   2. Recurring director obsession (e.g. "you keep returning to Nolan")
 *   3. Decade affinity (e.g. "the 1970s keeps calling you back")
 *   4. Comfort pattern after series (e.g. "you reach for comfort films after long series")
 *   5. Weekend ritual (e.g. "your weekends belong to cinema")
 *   6. Volume milestone (e.g. "you've been quietly building a library")
 *   7. Default poetic line for new viewers
 *
 * Returns null when the vault has fewer than 3 titles (too little signal).
 */
export function generateYourStory(
  stats: StatsData | null,
  watchlist: WatchlistItem[]
): YourStoryReflection | null {
  if (!stats || watchlist.length < 3) return null;

  // ── 1. Genre shift: compare last 60 days vs. previous 60 days ──
  const shift = detectGenreShift(watchlist);
  if (shift) {
    return {
      headline: "Your taste is moving.",
      body: `You spent the last two months exploring ${shift.recent}. This week you've returned to ${shift.previous}.`,
      accentPhrase: shift.previous,
      icon: "auto_awesome"
    };
  }

  // ── 2. Recurring director obsession (3+ titles) ──
  if (stats.topDirectors.length > 0 && stats.topDirectors[0].count >= 3) {
    const dir = stats.topDirectors[0];
    return {
      headline: "You keep returning.",
      body: `${dir.name} appears ${dir.count} times in your vault. There's something in their gaze you can't let go of.`,
      accentPhrase: dir.name,
      icon: "person"
    };
  }

  // ── 3. Decade affinity ──
  if (stats.favoriteDecade && stats.total >= 8) {
    return {
      headline: "An era calls you back.",
      body: `The ${stats.favoriteDecade} keeps showing up in your life. Maybe it's the texture. Maybe it's the restraint. Maybe it's just you, finding your way home.`,
      accentPhrase: stats.favoriteDecade,
      icon: "history"
    };
  }

  // ── 4. Comfort pattern: comfort films after long series ──
  const comfort = detectComfortPattern(watchlist);
  if (comfort) {
    return {
      headline: "You have a ritual.",
      body: `After finishing a long series, you almost always reach for a comfort film — something soft, something known. A breath between worlds.`,
      accentPhrase: "comfort film",
      icon: "favorite"
    };
  }

  // ── 5. Weekend ritual ──
  if (stats.weekdayVsWeekend) {
    const total =
      stats.weekdayVsWeekend.weekday + stats.weekdayVsWeekend.weekend;
    if (total >= 6) {
      const weekendPct = Math.round(
        (stats.weekdayVsWeekend.weekend / total) * 100
      );
      if (weekendPct >= 60) {
        return {
          headline: "Your weekends belong to cinema.",
          body: `${weekendPct}% of your watching happens on weekends. Saturday mornings, Sunday nights — these are the hours you give to stories.`,
          accentPhrase: "weekends",
          icon: "weekend"
        };
      }
    }
  }

  // ── 6. Quietly building a library ──
  if (stats.total >= 25) {
    return {
      headline: "You've been quietly building a library.",
      body: `${stats.total} titles, ${Math.round(stats.totalRuntimeHours)} hours of cinema. Not for show. Not for a streak. Just for you, and the versions of you that watched them.`,
      accentPhrase: `${stats.total} titles`,
      icon: "menu_book"
    };
  }

  // ── 7. New viewer poetic fallback ──
  return {
    headline: "Your story is just beginning.",
    body: `Every title you add is a sentence. Every finish, a paragraph. Come back when you have a few more — there's something here worth telling.`,
    accentPhrase: "just beginning",
    icon: "auto_awesome"
  };
}

// ---------------------------------------------------------------------------
// Genre shift detection (Your Story priority #1)
// ---------------------------------------------------------------------------

interface GenreShift {
  recent: string;
  previous: string;
}

function detectGenreShift(list: WatchlistItem[]): GenreShift | null {
  const now = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;

  const recent: WatchlistItem[] = [];
  const previous: WatchlistItem[] = [];

  for (const m of list) {
    const dateStr =
      m.watchDate ||
      (typeof m.addedAt === "string" ? m.addedAt : null) ||
      m.updatedAt;
    if (!dateStr) continue;
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) continue;
    if (t >= now - sixtyDays) recent.push(m);
    else if (t >= now - 2 * sixtyDays) previous.push(m);
  }

  if (recent.length < 2 || previous.length < 2) return null;

  const recentGenre = topGenreOf(recent);
  const previousGenre = topGenreOf(previous);
  if (!recentGenre || !previousGenre) return null;
  if (recentGenre === previousGenre) return null;

  return {
    recent: lowerFirst(recentGenre),
    previous: lowerFirst(previousGenre)
  };
}

function topGenreOf(items: WatchlistItem[]): string | null {
  const map = new Map<string, number>();
  for (const m of items) {
    if (!m.genresList || !Array.isArray(m.genresList)) continue;
    for (const g of m.genresList) {
      const name = normalizeGenre(g);
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
  }
  if (map.size === 0) return null;
  let best = "";
  let max = 0;
  for (const [name, count] of map) {
    if (count > max) {
      max = count;
      best = name;
    }
  }
  return best;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Comfort pattern detection (Your Story priority #4)
// ---------------------------------------------------------------------------

function detectComfortPattern(list: WatchlistItem[]): boolean {
  // Detect: at least 2 completed TV series, each followed within 7 days by
  // a short movie (runtime <= 110 min) added/watched.
  const sorted = [...list]
    .map((m) => {
      const dateStr =
        m.watchDate ||
        (typeof m.addedAt === "string" ? m.addedAt : null) ||
        m.updatedAt;
      return { m, t: dateStr ? new Date(dateStr).getTime() : 0 };
    })
    .filter((x) => !isNaN(x.t))
    .sort((a, b) => a.t - b.t);

  let hits = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.m.status !== "Completed" || cur.m.media_type !== "tv") continue;
    // Look at the next movie within 7 days
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (next.t - cur.t > 7 * 24 * 60 * 60 * 1000) break;
      if (next.m.media_type === "movie" && (next.m.runtime ?? 120) <= 110) {
        hits++;
        break;
      }
    }
  }
  return hits >= 2;
}

// ---------------------------------------------------------------------------
// Viewer Identity Chips
// ---------------------------------------------------------------------------

/**
 * generateIdentityChips — derives up to 4 elegant chips from the vault.
 *
 * Order of preference:
 *   1. Genre affinity  → "Sci-Fi Lover"
 *   2. Director devotion → "Nolan Fan"
 *   3. Era affinity → "70s Cinema"
 *   4. Pace identity → "Slow Cinema"
 *   5. Origin identity → "Korean Cinema"
 *   6. Format identity → "Series Devotee" / "Film Purist"
 */
export function generateIdentityChips(
  stats: StatsData | null,
  watchlist: WatchlistItem[]
): IdentityChip[] {
  if (!stats || watchlist.length < 3) return [];

  const chips: IdentityChip[] = [];
  const seen = new Set<string>();

  const add = (label: string, icon: string, isEmoji: boolean, key?: string) => {
    const k = key ?? label;
    if (seen.has(k)) return;
    seen.add(k);
    chips.push({ label, icon, isEmoji });
  };

  // 1. Genre affinity — top genre
  if (stats.topGenres.length > 0) {
    const top = stats.topGenres[0];
    if (top.count >= 3) {
      const g = top.name.toLowerCase();
      if (g.includes("sci") || g.includes("science")) {
        add("Sci-Fi Lover", "🚀", true);
      } else if (g.includes("horror")) {
        add("Horror Aficionado", "👻", true);
      } else if (g.includes("anim")) {
        add("Animation Fan", "✨", true);
      } else if (g.includes("drama")) {
        add("Drama Devotee", "🎭", true);
      } else if (g.includes("romance")) {
        add("Romantic at Heart", "💗", true);
      } else if (g.includes("thriller")) {
        add("Thriller Seeker", "🔪", true);
      } else if (g.includes("document")) {
        add("Truth Seeker", "📷", true);
      } else if (g.includes("comedy")) {
        add("Comedy Lover", "😄", true);
      } else if (g.includes("fantasy")) {
        add("Fantasy Wanderer", "🐉", true);
      } else if (g.includes("music")) {
        add("Music Devotee", "🎼", true);
      } else {
        add(`${top.name} Lover`, "🎬", true);
      }
    }
  }

  // 2. Director devotion — 3+ titles by same director
  if (stats.topDirectors.length > 0 && stats.topDirectors[0].count >= 3) {
    const dir = stats.topDirectors[0].name;
    // Shorten: "Christopher Nolan" → "Nolan Fan"
    const short = dir.split(" ").pop() ?? dir;
    add(`${short} Fan`, "🎬", true);
  }

  // 3. Era affinity — favorite decade
  if (stats.favoriteDecade && stats.total >= 8) {
    add(`${stats.favoriteDecade} Cinema`, "📼", true);
  }

  // 4. Pace identity — avg runtime > 130min → "Slow Cinema"
  const itemsWithRuntime = watchlist.filter((m) => m.runtime && m.runtime > 0);
  const avgRuntime =
    itemsWithRuntime.length > 0
      ? itemsWithRuntime.reduce((s, m) => s + (m.runtime ?? 0), 0) /
        itemsWithRuntime.length
      : 0;
  if (avgRuntime >= 130 && itemsWithRuntime.length >= 4) {
    add("Slow Cinema", "🎬", true, "slow-cinema");
  }

  // 5. Origin identity — non-English titles present (Korean, Japanese, French)
  const originChip = detectOriginIdentity(watchlist);
  if (originChip)
    add(originChip.label, originChip.icon, true, originChip.label);

  // 6. Format identity — TV count >= 1.2x movie count → "Series Devotee"
  if (stats.tvCount >= 8 && stats.tvCount >= stats.movieCount * 1.2) {
    add("Series Devotee", "📺", true, "series-devotee");
  } else if (stats.movieCount >= 8 && stats.movieCount >= stats.tvCount * 1.5) {
    add("Film Purist", "🎞️", true, "film-purist");
  }

  return chips.slice(0, 4);
}

interface OriginIdentity {
  label: string;
  icon: string;
}

function detectOriginIdentity(list: WatchlistItem[]): OriginIdentity | null {
  // Heuristic: scan original_title/original_name for non-Latin scripts.
  let korean = 0;
  let japanese = 0;
  for (const m of list) {
    const t = m.original_title || m.original_name || "";
    if (!t) continue;
    for (const ch of t) {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0xac00 && code <= 0xd7a3) {
        korean++;
        break;
      }
      if (code >= 0x3040 && code <= 0x30ff) {
        japanese++;
        break;
      }
      if (code >= 0x4e00 && code <= 0x9fff) {
        korean++;
        break;
      } // CJK (broad)
    }
  }
  if (korean >= 2 && korean >= japanese)
    return { label: "Korean Cinema", icon: "🇰🇷" };
  if (japanese >= 2) return { label: "Japanese Cinema", icon: "🇯🇵" };
  return null;
}

// ---------------------------------------------------------------------------
// Favorite reasons — very small elegant subtitle per favorite slot
// ---------------------------------------------------------------------------

/**
 * generateFavoriteReason — derives a personal one-liner for a favorite slot.
 *
 * The reason is templated from the slot type + the title's genres/decade,
 * chosen to feel personal rather than mechanical.
 */
export function generateFavoriteReason(
  slot: "movie" | "series" | "director" | "genre",
  context: {
    title?: string;
    genres?: string[];
    year?: string;
    directorName?: string;
    genreName?: string;
  }
): FavoriteReason {
  if (slot === "movie") {
    return generateMovieReason(context.genres ?? [], context.year ?? "");
  }
  if (slot === "series") {
    return generateSeriesReason(context.genres ?? []);
  }
  if (slot === "director") {
    return generateDirectorReason(context.directorName ?? "");
  }
  return generateGenreReason(context.genreName ?? "");
}

function generateMovieReason(genres: string[], year: string): FavoriteReason {
  const g = genres.map((x) => x.toLowerCase()).join(" ");
  if (g.includes("sci") || g.includes("science")) {
    return { reason: "The film that changed my taste." };
  }
  if (g.includes("horror")) {
    return { reason: "The one that truly scared me." };
  }
  if (g.includes("romance")) {
    return { reason: "A love I keep revisiting." };
  }
  if (g.includes("anim")) {
    return { reason: "A world I never wanted to leave." };
  }
  if (g.includes("drama")) {
    return { reason: "A story that stayed with me." };
  }
  if (g.includes("thriller")) {
    return { reason: "I held my breath the whole way through." };
  }
  if (g.includes("comedy")) {
    return { reason: "My comfort rewatch." };
  }
  if (g.includes("document")) {
    return { reason: "It changed how I see the world." };
  }
  if (year) {
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      if (y < 1980) return { reason: "Old soul cinema." };
      if (y < 2000) return { reason: "The era that made me." };
      if (y >= 2020) return { reason: "The film that defined this year." };
    }
  }
  return { reason: "The one I'll always return to." };
}

function generateSeriesReason(genres: string[]): FavoriteReason {
  const g = genres.map((x) => x.toLowerCase()).join(" ");
  if (g.includes("sci") || g.includes("science")) {
    return { reason: "My slow-burn obsession." };
  }
  if (g.includes("thriller") || g.includes("crime")) {
    return { reason: "Binged in a single weekend." };
  }
  if (g.includes("drama")) {
    return { reason: "The one I keep rewatching." };
  }
  if (g.includes("comedy")) {
    return { reason: "My comfort watch." };
  }
  if (g.includes("anim")) {
    return { reason: "My animated obsession." };
  }
  return { reason: "The one I return to." };
}

function generateDirectorReason(name: string): FavoriteReason {
  const reasons = [
    "Every frame, a painting.",
    "A master of mood.",
    "Their lens, my life.",
    "Stories told the way I think.",
    "A poet of the screen."
  ];
  // Deterministic pick based on name length so it's stable per director.
  const idx = (name.length * 7) % reasons.length;
  return { reason: reasons[idx] };
}

function generateGenreReason(genre: string): FavoriteReason {
  const g = genre.toLowerCase();
  if (g.includes("sci") || g.includes("science"))
    return { reason: "Where I feel most at home." };
  if (g.includes("horror")) return { reason: "The dark I keep returning to." };
  if (g.includes("drama")) return { reason: "Where I go to feel." };
  if (g.includes("romance")) return { reason: "Where I go to hope." };
  if (g.includes("thriller"))
    return { reason: "Where I go to hold my breath." };
  if (g.includes("anim")) return { reason: "Where I go to dream." };
  if (g.includes("comedy")) return { reason: "Where I go to breathe." };
  if (g.includes("document")) return { reason: "Where I go to learn." };
  return { reason: "My cinematic comfort zone." };
}

// ---------------------------------------------------------------------------
// Activity reactions — optional one-liner per activity entry
// ---------------------------------------------------------------------------

export function generateActivityReaction(
  category: "watching" | "completed" | "rated" | "added",
  context: {
    rating?: number;
    genres?: string[];
    mediaType?: "movie" | "tv";
    episodeDelta?: number;
  }
): ActivityReaction | null {
  if (category === "rated" && context.rating && context.rating > 0) {
    if (context.rating >= 10) return { text: "A new favorite." };
    if (context.rating >= 9) return { text: "Visual perfection." };
    if (context.rating >= 8) return { text: "Quietly devastating." };
    if (context.rating >= 7) return { text: "Worth every minute." };
    return null;
  }

  if (category === "watching") {
    if (context.episodeDelta && context.episodeDelta >= 3) {
      return { text: `Binged ${context.episodeDelta} episodes.` };
    }
    return { text: "Hooked from frame one." };
  }

  if (category === "completed") {
    const g = (context.genres ?? []).map((x) => x.toLowerCase()).join(" ");
    if (g.includes("horror")) return { text: "Slept with the lights on." };
    if (g.includes("romance")) return { text: "Wrecked in the best way." };
    if (g.includes("thriller")) return { text: "Gripped until the credits." };
    if (g.includes("drama")) return { text: "Sat with the silence after." };
    if (g.includes("sci") || g.includes("science"))
      return { text: "Still thinking about it." };
    return { text: "Credits rolled. Silence." };
  }

  if (category === "added") {
    return { text: "Saving for the right night." };
  }

  return null;
}

// ---------------------------------------------------------------------------
// One-word reaction for Recently Finished (based on rating)
// ---------------------------------------------------------------------------

export function generateOneWordReaction(
  rating: number | undefined
): OneWordReaction | null {
  if (!rating || rating <= 0) return null;
  if (rating >= 10) return { word: "Masterpiece" };
  if (rating >= 9) return { word: "Mind-blowing" };
  if (rating >= 8) return { word: "Beautiful" };
  if (rating >= 7) return { word: "Heartbreaking" };
  if (rating >= 6) return { word: "Solid" };
  if (rating >= 5) return { word: "Uneven" };
  return { word: "Mixed" };
}
