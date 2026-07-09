// src/features/details/components/DetailsRatings.tsx
import { Show, createMemo, type JSX } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { useAuth } from "~/shared/hooks/useAuth";
import type { TMDBDetails, OMDbRatings, WatchlistItem } from "~/shared/types";

interface DetailsRatingsProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
  baseItem: WatchlistItem | null;
}

/**
 * Three independent rating cards:
 *
 *   ⭐ IMDb         — from OMDb (props.omdb.imdb)        e.g. "8.4"
 *   🍅 Rotten T.    — from OMDb (props.omdb.rt)          e.g. "94%"
 *   👤 User Rating  — from baseItem.rating (Firestore)   e.g. "9.5 / Aman24"
 *                     "No User Rating" when not rated
 *
 * TMDB rating is NEVER shown as IMDb or Rotten Tomatoes — TMDB's vote_average
 * is intentionally omitted from this view to keep the three sources
 * independent and unambiguous.
 *
 * The username is taken from the signed-in Firebase user (useAuth). If the
 * user is signed in but has no displayName, we fall back to the email local
 * part. If signed out (guest preview), the username is "Guest".
 */
export default function DetailsRatings(props: DetailsRatingsProps) {
  const { user } = useAuth();

  const imdb = () => {
    const v = props.omdb?.imdb;
    if (!v || v === "-" || v === "N/A") return null;
    return v;
  };

  const rt = () => {
    const v = props.omdb?.rt;
    if (!v || v === "-" || v === "N/A") return null;
    return v;
  };

  const userRating = () => {
    const r = props.baseItem?.rating;
    if (typeof r !== "number" || r <= 0) return null;
    return r;
  };

  const username = createMemo(() => {
    const u = user();
    if (u?.displayName) return u.displayName;
    if (u?.email) return u.email.split("@")[0];
    return "Guest";
  });

  return (
    <div class="mt-4 animate-fade-in">
      <div class="grid grid-cols-3 gap-2 sm:gap-3 w-full">
        {/* IMDb */}
        <RatingCard
          icon={<span aria-hidden="true" style={{ "font-size": "14px", "line-height": 1 }}>⭐</span>}
          value={imdb() ?? "—"}
          label="IMDb"
          color="#f5c518"
          ariaLabel={`IMDb rating: ${imdb() ?? "not available"}`}
        />

        {/* Rotten Tomatoes */}
        <RatingCard
          icon={<span aria-hidden="true" style={{ "font-size": "14px", "line-height": 1 }}>🍅</span>}
          value={rt() ?? "—"}
          label="Rotten T."
          color="#ff7878"
          ariaLabel={`Rotten Tomatoes rating: ${rt() ?? "not available"}`}
        />

        {/* User Rating */}
        <RatingCard
          icon={
            <Icon
              name="person"
              fill
              style={{ "font-size": "14px", color: "var(--p)" }}
              aria-hidden="true"
            />
          }
          value={userRating() !== null ? userRating()!.toFixed(1) : "—"}
          label="User Rating"
          color="var(--p)"
          ariaLabel={
            userRating() !== null
              ? `Your rating: ${userRating()!.toFixed(1)} by ${username()}`
              : "No user rating"
          }
          footer={
            <Show
              when={userRating() !== null}
              fallback={
                <span class="type-caption" style={{ color: "var(--muted)" }}>
                  No User Rating
                </span>
              }
            >
              <span
                class="truncate"
                style={{
                  "font-size": "10px",
                  "font-weight": 700,
                  color: "var(--p)",
                  "max-width": "100%",
                  display: "inline-block"
                }}
              >
                {username()}
              </span>
            </Show>
          }
        />
      </div>
    </div>
  );
}

interface RatingCardProps {
  icon: JSX.Element;
  value: string;
  label: string;
  color: string;
  ariaLabel: string;
  footer?: JSX.Element;
}

function RatingCard(props: RatingCardProps) {
  return (
    <div
      class="bg-black/40 backdrop-blur-md border py-3 px-2 rounded-xl flex flex-col items-center justify-center text-center shadow-md min-w-0"
      style={{
        "border-color": "rgba(255,255,255,0.10)"
      }}
      role="img"
      aria-label={props.ariaLabel}
    >
      <div class="flex items-center gap-1 mb-1.5">
        {props.icon}
        <span
          class="type-metadata font-black"
          style={{ color: "#fff", "font-size": "14px" }}
        >
          {props.value}
        </span>
      </div>
      <span class="type-caption text-gray-500" style={{ "font-size": "9px" }}>
        {props.label}
      </span>
      <Show when={props.footer}>
        <div class="mt-1 w-full truncate text-center">{props.footer}</div>
      </Show>
    </div>
  );
}
