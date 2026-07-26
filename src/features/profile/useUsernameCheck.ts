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
//
// USAGE:
//   The hook supports TWO call styles:
//     1. Fully self-contained (no args): the caller drives it via the
//        returned `check(username, currentUsername, userId)` and `reset()`
//        methods. This is the call style ProfilePage uses.
//     2. Reactive (3 args): pass reactive accessors and the hook wires
//        up its own createEffect that re-runs whenever any input changes.
//        This is the call style used by tests and inline editors.

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
  /**
   * Imperatively trigger a username availability check.
   * Used by callers that manage their own input state (e.g. ProfilePage's
   * edit mode), where passing reactive accessors up-front isn't practical.
   */
  check: (username: string, currentUsername?: string, userId?: string | null) => void;
  /**
   * Reset the checker back to the idle state. Called when the user
   * cancels the edit form so stale "taken" / "available" labels don't
   * linger on the next edit session.
   */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useUsernameCheck — debounced live username availability checker.
 *
 * @param input (optional) Accessor for the raw username input string
 * @param currentUsername (optional) Accessor for the user's current username (excluded from availability check)
 * @param userId (optional) Accessor for the user's ID (for the excludeUserId parameter)
 * @returns { state, message, sanitized, check, reset }
 */
export function useUsernameCheck(
  input?: Accessor<string>,
  currentUsername?: Accessor<string>,
  userId?: Accessor<string | null>,
): UsernameCheckResult {
  const [state, setState] = createSignal<UsernameCheckState>("idle");
  const [message, setMessage] = createSignal("");
  const [sanitized, setSanitized] = createSignal("");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced check function — used by both the reactive createEffect
  // (when called with accessors) and the imperative `check()` method.
  const runCheck = async (username: string, current: string, excludeId: string) => {
    if (isServer) return;

    // Empty input → idle
    if (!username || username.trim().length === 0) {
      setState("idle");
      setMessage("");
      setSanitized("");
      return;
    }

    // Sanitize first (instant, local)
    const clean = sanitizeUsername(username);
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

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const { getBrowserClient } = await import("~/lib/supabase/browser");
        const { checkUsernameAvailability } = await import("~/lib/supabase/repositories");
        const client = getBrowserClient();

        const { available, error } = await checkUsernameAvailability(client, clean, excludeId);

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
    }, 400);
  };

  // Reactive mode — only wire up the effect when all three accessors are
  // provided. This preserves the original behaviour for callers that pass
  // accessors, while letting ProfilePage use the no-args imperative API.
  createEffect(() => {
    if (!input || !currentUsername || !userId) return;

    const raw = input();
    const current = currentUsername();
    const id = userId();

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    void runCheck(raw, current, id ?? "");
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return {
    state,
    message,
    sanitized,
    check: (username: string, current: string = "", id: string | null = null) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void runCheck(username, current, id ?? "");
    },
    reset: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      setState("idle");
      setMessage("");
      setSanitized("");
    },
  };
}
