// src/features/profile/components/QuickLinks.tsx
//
// Sprint 2C — Redesigned QuickLinks.
// Settings rows have been moved to SettingsLinks.tsx.
// Only keeps: Statistics, History, Watchlist.
// Each row is more interactive with hover states and animated arrow.
// Watchlist row shows the story text as the description.

import { For, type Component } from "solid-js";
import { PremiumListItem } from "~/shared/ui/premium";

interface QuickLinkDef {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

interface QuickLinksProps {
  /** Dynamic story text for the Watchlist row description. */
  watchlistStory?: string;
}

/**
 * QuickLinks — interactive navigation rows for quick profile actions.
 *
 * Sprint 2C changes:
 *   • Removed Settings (now in SettingsLinks.tsx)
 *   • Added Watchlist as a new row with dynamic story text
 *   • Each row uses PremiumListItem with hover states and animated arrow
 */
const QuickLinks: Component<QuickLinksProps> = (props) => {
  const links = (): QuickLinkDef[] => [
    { href: "/profile/stats", label: "Statistics", desc: "Your watching insights", icon: "insights" },
    { href: "/profile/history", label: "History", desc: "Your watch log", icon: "history" },
    { href: "/watchlist", label: "Watchlist", desc: props.watchlistStory ?? "Your collection", icon: "video_library" },
  ];

  return (
    <div class="quick-links" role="list" aria-label="Quick actions">
      <For each={links()}>
        {(link) => (
          <a
            href={link.href}
            class="quick-link-row quick-link-row-interactive focus-ring"
            style={{ "text-decoration": "none" }}
            aria-label={`${link.label} — ${link.desc}`}
          >
            <PremiumListItem
              title={link.label}
              subtitle={link.desc}
              icon={link.icon}
              iconFill
              size="comfortable"
              variant="subtle"
              trailing={
                <span class="material-symbols-outlined quick-link-arrow" style={{ color: "var(--text-dim)", "font-size": "18px" }} aria-hidden="true">
                  arrow_forward
                </span>
              }
            />
          </a>
        )}
      </For>
    </div>
  );
};

export default QuickLinks;
