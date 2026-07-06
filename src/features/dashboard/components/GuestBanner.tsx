// src/features/dashboard/components/GuestBanner.tsx
import { Button } from "~/shared/ui/primitives";

interface GuestBannerProps {
  onLogin: () => void;
}

export default function GuestBanner(props: GuestBannerProps) {
  return (
    <div class="guest-premium animate-fade-up">
      <div class="relative z-10">
        <p class="type-eyebrow mb-2">Preview Mode</p>
        <h3 class="type-display text-white mb-3" style={{ "font-size": "2rem" }}>
          Welcome to CineLog
        </h3>
        <p class="type-body-soft mb-5 max-w-sm" style={{ "line-height": "1.6" }}>
          Explore in preview mode. Sign in to build your personal cinematic universe, track progress, and get tailored recommendations.
        </p>
        <Button
          variant="primary"
          size="md"
          icon="login"
          onClick={() => props.onLogin()}
          aria-label="Start building your vault — sign in"
        >
          Start Building Vault
        </Button>
      </div>
    </div>
  );
}
