// src/features/profile/useUsernameCheck.ts
//
// useUsernameCheck — live, debounced username availability checker.
//
// Used by the Profile edit form to show real-time validation while the
// user types their desired username. Debounces at 400ms to avoid
// spamming Supabase with queries on every keystroke.
//
// Architecture:
//   ProfileEditForm → useUsernameCheck → validateUsername (local, instant)
//                                        → checkUsernameAvailability (Supabase, debounced)
//
// The hook returns a reactive state machine:
//   idle → checking → available | taken | reserved | invalid

import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import {
  validateUsername,
  sanitizeUsername,
} from "~/shared/utils/username";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsernameCheckState = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

export interface UsernameCheckResult {
  state: Accessor<UsernameCheckState>;
  message: Accessor<string>;
  sanitized: Accessor<string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useUsernameCheck — debounced live username availability checker.
 *
 * @param input Accessor for the raw username input string
 * @param currentUsername The user's current username (excluded from availability check)
 * @param userId The user's ID (for the excludeUserId parameter)
 * @returns { state, message, sanitized }
 */
export function useUsernameCheck(
  input: Accessor<string>,
  currentUsername: Accessor<string>,
  userId: Accessor<string | null>,
): UsernameCheckResult {
  const [state, setState] = createSignal<UsernameCheckState>("idle");
  const [message, setMessage] = createSignal("");
  const [sanitized, setSanitized] = createSignal("");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced check function
  const check = async (username: string, excludeId: string) => {
    if (isServer) return;

    try {
      const { getBrowserClient } = await import("~/lib/supabase/browser");
      const { checkUsernameAvailability } = await import("~/lib/supabase/repositories");
      const client = getBrowserClient();

      const { available, error } = await checkUsernameAvailability(client, username, excludeId);

      if (error) {
        setState("invalid");
        setMessage("Couldn't check availability. Try again.");
        return;
      }

      if (available) {
        setState("available");
        setMessage("Available ✓");
      } else {
        setState("taken");
        setMessage("Already taken");
      }
    } catch (err) {
      console.error("[useUsernameCheck] Availability check failed:", err);
      setState("invalid");
      setMessage("Couldn't check availability. Try again.");
    }
  };

  createEffect(() => {
    const raw = input();
    const current = currentUsername();
    const uid = userId();

    // Clear any pending debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Empty input → idle
    if (!raw || raw.trim().length === 0) {
      setState("idle");
      setMessage("");
      setSanitized("");
      return;
    }

    // Sanitize first (instant, local)
    const clean = sanitizeUsername(raw);
    setSanitized(clean);

    // Validate format (instant, local)
    const validation = validateUsername(clean);

    if (!validation.valid) {
      setState(validation.status === "reserved" ? "reserved" : "invalid");
      setMessage(validation.message);
      return;
    }

    // If the sanitized username equals the current username, it's available
    // (the user is keeping their own name)
    if (clean === sanitizeUsername(current)) {
      setState("available");
      setMessage("That's your current username ✓");
      return;
    }

    // Valid format + not current username → check database (debounced)
    setState("checking");
    setMessage("Checking...");

    debounceTimer = setTimeout(() => {
      void check(clean, uid ?? "");
    }, 400);
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return { state, message, sanitized };
}
