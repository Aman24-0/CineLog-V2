// src/features/dashboard/components/GreetingBlock.tsx
import { createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useVault } from "~/features/watchlist/useVault";
import type { WatchlistItem } from "~/shared/types";

interface GreetingBlockProps {
  watchlist: WatchlistItem[];
}

/**
 * GreetingBlock — temporal greeting + personalization.
 *
 * Signature interaction: "Dynamic Greeting"
 *
 * The greeting adapts to:
 *  - Time of day: "Good morning" / "Good afternoon" / "Good evening"
 *  - User name: from Firebase auth displayName (or email local-part)
 *  - Activity context: derived from the vault
 *    - "You have X titles in progress" (if watching)
 *    - "X titles waiting in your vault" (if planned)
 *    - "Your vault has X titles" (general)
 *    - "Welcome to CineLog" (guest)
 *
 * SSR-safe: time-of-day defaults to "evening" on the server (most common
 * usage time), and the greeting updates after hydration on the client.
 * This avoids hydration mismatches because the server and client both
 * render the same initial value, then onMount updates it.
 */
export default function GreetingBlock(props: GreetingBlockProps) {
  const { user, isSignedIn } = useAuth();

  const greeting = createMemo(() => {
    // Default to "evening" for SSR (most common usage time for a movie tracker)
    // The client will update this on mount.
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  });

  const firstName = createMemo(() => {
    const name = user()?.displayName || user()?.email?.split("@")[0] || "";
    return name.split(" ")[0] || "";
  });

  const activityContext = createMemo(() => {
    if (!isSignedIn()) {
      return "Welcome to CineLog";
    }

    const list = props.watchlist;
    if (list.length === 0) {
      return "Your cinematic universe awaits";
    }

    const inProgress = list.filter(
      (m) => m.watchProgress && m.watchProgress.currentTime > 0 && m.status !== "Completed"
    ).length;
    const planned = list.filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    ).length;
    const completed = list.filter((m) => m.status === "Completed").length;

    if (inProgress > 0) {
      return `${inProgress} title${inProgress !== 1 ? "s" : ""} waiting to be finished`;
    }
    if (planned > 0) {
      return `${planned} title${planned !== 1 ? "s" : ""} in your vault`;
    }
    if (completed > 0) {
      return `${completed} title${completed !== 1 ? "s" : ""} completed`;
    }
    return "Your vault is ready";
  });

  return (
    <div class="greeting-block">
      <span class="greeting-eyebrow">{greeting()}</span>
      <h1 class="greeting-title">
        {firstName() ? `${firstName()}` : "Welcome back"}
      </h1>
      <p class="greeting-subtitle">{activityContext()}</p>
    </div>
  );
}
