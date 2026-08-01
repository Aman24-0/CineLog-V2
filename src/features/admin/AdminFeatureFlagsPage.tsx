// src/features/admin/AdminFeatureFlagsPage.tsx
//
// CineLog V2 — Admin Feature Flags Page Component
// ---------------------------------------------------------------------
// UI:
//   - List of all feature flags, each as a toggle card
//   - Each card shows: flag name, description, current value
//   - Toggle switches call PUT /api/admin/feature-flags
//   - Optimistic UI (toggle immediately, revert on error)
//
// FLAG METADATA (descriptions):
//   Imported from src/core/feature-flags/defaults.ts — the single source
//   of truth shared with the admin API. To add a new flag, add it there
//   AND in the migration seed.

import { createSignal, Show, For, onMount, type Component } from "solid-js";
import {
  FEATURE_FLAG_METADATA,
  type FlagMeta
} from "~/core/feature-flags/defaults";

const FLAG_METADATA: readonly FlagMeta[] = FEATURE_FLAG_METADATA;

const AdminFeatureFlagsPage: Component = () => {
  const [flags, setFlags] = createSignal<Record<string, boolean>>({});
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal<Record<string, boolean>>({});
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const fetchFlags = async () => {
    try {
      const resp = await fetch("/api/admin/feature-flags", {
        credentials: "include"
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { flags: Record<string, boolean> };
      setFlags(data.flags);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchFlags);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const toggleFlag = async (name: string, newValue: boolean) => {
    // Optimistic update
    const oldValue = flags()[name];
    setFlags({ ...flags(), [name]: newValue });
    setSaving({ ...saving(), [name]: true });

    try {
      const resp = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: { [name]: newValue } })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.error) {
        // Revert on error
        setFlags({ ...flags(), [name]: oldValue });
        showToast(body.error || "Failed to update flag", "error");
      } else {
        showToast(`'${name}' is now ${newValue ? "ON" : "OFF"}`, "success");
        // Update with the canonical response
        if (body.flags) setFlags(body.flags);
      }
    } catch {
      // Revert on network error
      setFlags({ ...flags(), [name]: oldValue });
      showToast("Network error", "error");
    } finally {
      setSaving({ ...saving(), [name]: false });
    }
  };

  return (
    <div>
      <div style={{ "margin-bottom": "var(--sp-6)" }}>
        <h2
          style={{
            "font-size": "1.5rem",
            "font-weight": "700",
            margin: "0 0 var(--sp-1) 0",
            color: "var(--text)"
          }}
        >
          Feature Flags
        </h2>
        <p
          style={{
            "font-size": "0.875rem",
            color: "var(--text-muted)",
            margin: 0
          }}
        >
          Toggle features on/off without redeploying. Changes take effect
          immediately for all users.
        </p>
      </div>

      <Show when={error()}>
        <div
          role="alert"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-4)",
            "margin-bottom": "var(--sp-4)",
            "font-size": "0.875rem",
            color: "rgb(252, 165, 165)"
          }}
        >
          Failed to load flags: {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-3)"
          }}
        >
          <For each={Array.from({ length: 6 })}>
            {() => (
              <div
                style={{
                  background: "var(--tier-1)",
                  border: "1px solid var(--hairline)",
                  "border-radius": "var(--radius-lg)",
                  padding: "var(--sp-5)",
                  height: "80px",
                  animation: "pulse 1.5s ease-in-out infinite"
                }}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={!loading()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-3)"
          }}
        >
          <For each={FLAG_METADATA}>
            {(flag) => {
              const value = () => flags()[flag.name] ?? flag.default_value;
              const isSaving = () => saving()[flag.name] === true;
              return (
                <div
                  style={{
                    background: "var(--tier-1)",
                    border: "1px solid var(--hairline)",
                    "border-radius": "var(--radius-lg)",
                    padding: "var(--sp-5)",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    gap: "var(--sp-4)",
                    transition: "border-color 0.15s ease"
                  }}
                >
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--sp-3)",
                        "margin-bottom": "var(--sp-1)"
                      }}
                    >
                      <span
                        style={{ "font-size": "1.25rem", "line-height": "1" }}
                      >
                        {flag.icon}
                      </span>
                      <h3
                        style={{
                          "font-size": "1rem",
                          "font-weight": "600",
                          margin: 0,
                          color: "var(--text)",
                          "font-family": "monospace"
                        }}
                      >
                        {flag.name}
                      </h3>
                      <Show when={value() !== flag.default_value}>
                        <span
                          style={{
                            background: "rgba(99, 102, 241, 0.15)",
                            color: "rgb(165, 180, 252)",
                            "font-size": "0.6875rem",
                            "font-weight": "600",
                            padding: "1px 6px",
                            "border-radius": "var(--radius-sm)",
                            "text-transform": "uppercase",
                            "letter-spacing": "0.05em"
                          }}
                        >
                          Modified
                        </span>
                      </Show>
                    </div>
                    <p
                      style={{
                        "font-size": "0.8125rem",
                        color: "var(--text-secondary)",
                        margin: "0 0 var(--sp-1) 0"
                      }}
                    >
                      {flag.description}
                    </p>
                    <p
                      style={{
                        "font-size": "0.75rem",
                        color: "var(--text-muted)",
                        margin: 0
                      }}
                    >
                      Enforced in:{" "}
                      <code style={{ color: "var(--text-secondary)" }}>
                        {flag.enforced_in}
                      </code>
                    </p>
                  </div>

                  {/* Toggle */}
                  <button
                    role="switch"
                    aria-checked={value()}
                    aria-label={`Toggle ${flag.name}`}
                    disabled={isSaving()}
                    onClick={() => toggleFlag(flag.name, !value())}
                    style={{
                      "flex-shrink": 0,
                      width: "48px",
                      height: "28px",
                      "border-radius": "14px",
                      background: value() ? "var(--p)" : "var(--tier-3)",
                      border:
                        "1px solid " +
                        (value() ? "var(--p)" : "var(--hairline-2)"),
                      position: "relative",
                      cursor: isSaving() ? "wait" : "pointer",
                      transition:
                        "background 0.15s ease, border-color 0.15s ease",
                      padding: 0
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "3px",
                        left: value() ? "22px" : "3px",
                        width: "20px",
                        height: "20px",
                        "border-radius": "50%",
                        background: "white",
                        "box-shadow": "0 1px 3px rgba(0,0,0,0.3)",
                        transition: "left 0.15s ease"
                      }}
                    />
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <div
        style={{
          "margin-top": "var(--sp-6)",
          padding: "var(--sp-4)",
          background: "var(--tier-2)",
          border: "1px solid var(--hairline)",
          "border-radius": "var(--radius-md)",
          "font-size": "0.8125rem",
          color: "var(--text-muted)"
        }}
      >
        <strong style={{ color: "var(--text-secondary)" }}>Note:</strong>{" "}
        Feature flag changes take effect within 60 seconds for active users
        (when their client re-fetches flags). New page loads reflect changes
        immediately.
      </div>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div
            style={{
              position: "fixed",
              bottom: "var(--sp-6)",
              right: "var(--sp-6)",
              background:
                t().type === "success"
                  ? "rgb(34, 197, 94)"
                  : "rgb(239, 68, 68)",
              color: "white",
              padding: "var(--sp-3) var(--sp-5)",
              "border-radius": "var(--radius-md)",
              "box-shadow": "var(--shadow-xl)",
              "z-index": 1100,
              "font-size": "0.875rem",
              "font-weight": "500"
            }}
          >
            {t().msg}
          </div>
        )}
      </Show>
    </div>
  );
};

export default AdminFeatureFlagsPage;
