// src/features/trash/components/TrashExpiryBadge.tsx
//
// TrashExpiryBadge — visual countdown badge for Trash cards.
//
// Phase 6 Part 3 — Task 2.
//
// Renders a colored pill that shows "Expires in X days" based on the
// `expiresAt` field of a trashed item. The badge's color intent varies
// by urgency:
//
//   • <=3 days  → "danger"  (red)   — about to be purged
//   • <=7 days  → "warning" (amber) — getting close
//   • <=14 days → "info"    (blue)  — comfortable
//   • >14 days  → "default" (gray)  — plenty of time
//   • expired   → "danger"  (red)   — "Expires today"
//
// The card already shows a textual "Auto-deletes in X days" line via
// the `trash-item-card-expiry` paragraph; this badge is a more
// prominent visual cue at the top-right of the card meta row, so the
// user can scan the trash list and instantly see which items need
// urgent attention.
//
// The badge is purely presentational — it reads `expiresAt` and
// derives the remaining time at render. It does NOT subscribe to a
// timer; the count will refresh on the next page load or trash-list
// refetch. This is sufficient because the trash list isn't typically
// kept open for long periods.

import { Component, createMemo } from "solid-js";

export type ExpiryIntent = "default" | "info" | "warning" | "danger";

export interface TrashExpiryBadgeProps {
  /** ISO timestamp when the item will be permanently purged. */
  expiresAt: string;
}

interface BadgeContent {
  label: string;
  intent: ExpiryIntent;
  icon: string;
}

function computeBadge(expiresAt: string): BadgeContent {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) {
    return { label: "Unknown", intent: "default", icon: "schedule" };
  }
  if (ms <= 0) {
    return { label: "Expires today", intent: "danger", icon: "priority_high" };
  }
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 3) {
    return {
      label: `${days} day${days === 1 ? "" : "s"} left`,
      intent: "danger",
      icon: "priority_high"
    };
  }
  if (days <= 7) {
    return {
      label: `${days} days left`,
      intent: "warning",
      icon: "schedule"
    };
  }
  if (days <= 14) {
    return {
      label: `${days} days left`,
      intent: "info",
      icon: "schedule"
    };
  }
  return {
    label: `${days} days left`,
    intent: "default",
    icon: "schedule"
  };
}

const INTENT_CLASS: Record<ExpiryIntent, string> = {
  default: "trash-expiry-badge trash-expiry-badge-default",
  info: "trash-expiry-badge trash-expiry-badge-info",
  warning: "trash-expiry-badge trash-expiry-badge-warning",
  danger: "trash-expiry-badge trash-expiry-badge-danger"
};

const TrashExpiryBadge: Component<TrashExpiryBadgeProps> = (props) => {
  const badge = createMemo(() => computeBadge(props.expiresAt));
  return (
    <span class={INTENT_CLASS[badge().intent]}>
      <span
        class="material-symbols-outlined trash-expiry-badge-icon"
        aria-hidden="true"
      >
        {badge().icon}
      </span>
      <span class="trash-expiry-badge-label">{badge().label}</span>
    </span>
  );
};

export default TrashExpiryBadge;
