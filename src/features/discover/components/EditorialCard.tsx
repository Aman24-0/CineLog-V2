// src/features/discover/components/EditorialCard.tsx
import { Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import { GlassCard } from "~/shared/ui/glass";

interface EditorialCardProps {
  title: TMDBTitle;
  label: string;
  icon: string;
  copy: string;
  onDetails: (title: TMDBTitle) => void;
}

/**
 * EditorialCard — a premium recommendation card with editorial copy.
 *
 * Layout: large backdrop + gradient overlay + editorial copy + CTA.
 * Inserted between sections to break up repetitive carousels.
 */
const EditorialCard: Component<EditorialCardProps> = (props) => {
  return (
    <div class="editorial-card" onClick={() => props.onDetails(props.title)} role="button" tabindex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onDetails(props.title); } }}
      aria-label={`${props.label}: ${props.title.title || props.title.name || "Untitled"}`}
    >
      <Show when={props.title.backdrop_path}>
        <img
          src={tmdbImage(props.title.backdrop_path, "w780")}
          class="editorial-backdrop"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </Show>
      <div class="editorial-overlay" />
      <div class="editorial-content">
        <div class="editorial-label">
          <span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--p)" }} aria-hidden="true">
            {props.icon}
          </span>
          {props.label}
        </div>
        <p class="editorial-copy">{props.copy}</p>
        <p class="editorial-title">{props.title.title || props.title.name || "Untitled"}</p>
        <button class="btn-primary focus-ring editorial-cta" type="button"
          onClick={(e) => { e.stopPropagation(); props.onDetails(props.title); }}
          aria-label={`View details for ${props.title.title || props.title.name || "Untitled"}`}
        >
          View Details
        </button>
      </div>
    </div>
  );
};

export default EditorialCard;
