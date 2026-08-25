// src/features/profile/components/QuickActionRow.tsx
//
// QuickActionRow — three labeled icon buttons that navigate to the
// existing full-page sections:
//   📅 Upcoming    → /profile/upcoming
//   ⚙️ Settings    → /settings
//   🗑️ Trash       → /profile/trash
//
// Spec: "Use useNavigate to route to respective pages." The row is
// intentionally minimal — the icons + labels match the existing
// ProfileNavigation component (which this redesign subsumes), so
// users who were used to the old layout can find the same actions.

import { For, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

interface QuickAction {
  href: string;
  label: string;
  icon: string;
}

const ACTIONS: QuickAction[] = [
  { href: "/profile/upcoming", label: "Upcoming", icon: "upcoming" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/profile/trash", label: "Trash", icon: "delete" }
];

const QuickActionRow: Component = () => {
  const navigate = useNavigate();

  return (
    <section class="profile-quick-action-row-v3" aria-label="Quick actions">
      <For each={ACTIONS}>
        {(action) => (
          <button
            type="button"
            class="profile-quick-action-row-v3-item focus-ring"
            onClick={() => navigate(action.href)}
            aria-label={action.label}
          >
            <span
              class="material-symbols-outlined profile-quick-action-row-v3-icon"
              aria-hidden="true"
            >
              {action.icon}
            </span>
            <span class="profile-quick-action-row-v3-label">
              {action.label}
            </span>
          </button>
        )}
      </For>
    </section>
  );
};

export default QuickActionRow;
