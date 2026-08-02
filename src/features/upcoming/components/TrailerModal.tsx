// src/features/upcoming/components/TrailerModal.tsx
//
// TrailerModal — a glass modal that embeds a YouTube trailer in an
// iframe. The trailer source URL is passed in as a prop (the parent
// page is responsible for fetching it from TMDB's /movie/{id}/videos
// or /tv/{id}/videos — we keep this component dumb so it can be reused
// from any surface).
//
// The iframe is wrapped in a 16:9 aspect-ratio box so it always sizes
// correctly regardless of viewport. ESC + backdrop tap close the modal
// (handled by GlassModal).

import { type Component, Show } from "solid-js";
import { GlassModal } from "~/shared/ui/glass";

interface TrailerModalProps {
  open: boolean;
  onClose: () => void;
  /** YouTube video ID (the `v=` param). */
  videoId: string | null;
  /** Optional title for the modal header. */
  title?: string;
}

const TrailerModal: Component<TrailerModalProps> = (props) => {
  return (
    <GlassModal
      open={props.open}
      onClose={props.onClose}
      size="lg"
      title={props.title ?? "Trailer"}
      icon="play_circle"
    >
      <div class="upcoming-trailer-wrap">
        <Show
          when={props.videoId}
          fallback={
            <div class="upcoming-trailer-empty">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "32px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                videocam_off
              </span>
              <p>No trailer available.</p>
            </div>
          }
        >
          <iframe
            class="upcoming-trailer-iframe"
            src={`https://www.youtube-nocookie.com/embed/${props.videoId}?autoplay=1&rel=0`}
            title={props.title ?? "Trailer"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
        </Show>
      </div>
    </GlassModal>
  );
};

export default TrailerModal;
