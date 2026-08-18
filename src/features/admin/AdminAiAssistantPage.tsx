// src/features/admin/AdminAiAssistantPage.tsx
//
// CineLog V2 — Admin AI Assistant Chat (Phase 16 Chunk 2)
// ---------------------------------------------------------------------
// A chat interface where the admin can ask questions about the system
// state. Each message is sent to POST /api/admin/ai/chat, which:
//   1. Verifies adminAssistantEnabled is on (via isAiFeatureEnabled).
//   2. Gathers live system context (user counts, vault stats, recent
//      audit log entries).
//   3. Calls Groq with a "sarcastic but helpful" system prompt that
//      includes the context.
//   4. Returns the reply.
//
// UI STRUCTURE:
//   ┌──────────────────────────────────────────────┐
//   │ Header: title + disabled-state banner        │
//   ├──────────────────────────────────────────────┤
//   │ Message list (scrollable)                    │
//   │  • user messages (right-aligned, primary)    │
//   │  • assistant messages (left-aligned, glass)  │
//   │  • error bubble (left, danger)               │
//   │  • typing indicator (3-dot animation)        │
//   ├──────────────────────────────────────────────┤
//   │ Input row: GlassInput + GlassButton (send)   │
//   └──────────────────────────────────────────────┘
//
// STATE:
//   - messages: ChatMessage[] — the conversation history (client-side
//     only; we don't persist to the DB. The audit log captures each
//     question server-side, so an admin can review usage there.)
//   - input: the current draft
//   - sending: boolean — disables the send button while waiting
//   - featureDisabled: boolean — set when the backend returns 403.
//     When true, the input + send button are disabled and a banner
//     explains how to re-enable.
//
// ERROR FALLBACK (Rule 3):
//   - 403 (feature disabled) → set featureDisabled=true, show banner.
//   - 429 (rate limit) → show the retry-after in an error bubble.
//   - 503 (Groq failure) → show a friendly error bubble with the hint.
//   - network error → generic error bubble.
//   In ALL error cases, the user's message stays in the list so they
//   can copy + retry after fixing the issue.
//
// SUGGESTED PROMPTS:
//   First-visit users see 3 suggestion chips ("How many users are
//   active today?", "What's the most recent admin action?", "Summarize
//   the system health"). Clicking one fills the input + sends. This
//   helps the admin discover what the assistant knows without typing.
//
// ACCESSIBILITY:
//   - The message list is an ARIA live region (role="log") so screen
//     readers announce new messages.
//   - The input has an associated label.
//   - Enter sends (Shift+Enter for newline — but we use a single-line
//     input for simplicity; multiline can come later).
//   - The send button has aria-label + disabled state.

import {
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
  createEffect,
  type Component
} from "solid-js";
import { GlassCard } from "~/shared/ui/glass/GlassCard";
import { GlassInput } from "~/shared/ui/glass/GlassInput";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";

// ─── Types ───────────────────────────────────────────────────────

interface ChatMessage {
  /** Local unique id for keyed rendering. */
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  /** ISO timestamp — shown in the message footer. */
  createdAt: string;
}

interface ChatApiResponse {
  reply: string;
  model: string;
  generatedAt: string;
}

interface ChatApiError {
  error: string;
  hint?: string;
}

// ─── Constants ───────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "How many users are active today?",
  "What's the most recent admin action?",
  "Summarize the current system health."
];

// ─── Component ───────────────────────────────────────────────────

const AdminAiAssistantPage: Component = () => {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [featureDisabled, setFeatureDisabled] = createSignal(false);
  // Model selection: "" = use server default, otherwise a specific model id.
  const [selectedModel, setSelectedModel] = createSignal("");
  // Available models fetched from AI settings.
  const [availableModels, setAvailableModels] = createSignal<string[]>([]);
  const [defaultModel, setDefaultModel] = createSignal("");
  let scrollContainer: HTMLDivElement | undefined;

  // Generate a unique id for each message (crypto.randomUUID is
  // available in all modern browsers + Node 19+).
  const newId = (): string =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Auto-scroll to the bottom when a new message arrives.
  createEffect(() => {
    const list = messages();
    if (list.length > 0 && scrollContainer) {
      // Defer to the next microtask so the new message has rendered.
      queueMicrotask(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
    }
  });

  // ─── Fetch available models on mount ────────────────────────────
  onMount(async () => {
    try {
      const resp = await fetch("/api/admin/settings", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        const ai = data.settings?.ai_settings?.value;
        if (ai) {
          setAvailableModels(
            Array.isArray(ai.enabledModels) ? ai.enabledModels : []
          );
          setDefaultModel(
            typeof ai.defaultModel === "string" ? ai.defaultModel : ""
          );
        }
      }
    } catch {
      // Best-effort — model selector just stays empty.
    }
  });

  // ─── Send a message ─────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || sending() || featureDisabled()) return;

    // Add the user's message to the list immediately.
    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    const body: Record<string, string> = { message: trimmed };
    // Only send model override if user explicitly selected one.
    if (selectedModel()) {
      body.model = selectedModel();
    }

    try {
      const resp = await fetch("/api/admin/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const body = await resp.json().catch(() => ({}));

      // 403 → feature is disabled. Set the disabled flag + show an
      // error bubble explaining how to re-enable.
      if (resp.status === 403) {
        setFeatureDisabled(true);
        const errBody = body as ChatApiError;
        const errorMsg: ChatMessage = {
          id: newId(),
          role: "error",
          text: errBody.hint || errBody.error || "AI Assistant is disabled.",
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      // 429 → rate limit. Show the retry-after in the error bubble.
      if (resp.status === 429) {
        const errBody = body as { retryAfterSeconds?: number; error?: string };
        const secs = errBody.retryAfterSeconds ?? 60;
        const errorMsg: ChatMessage = {
          id: newId(),
          role: "error",
          text: `Rate limit hit. Try again in ${secs} second${secs === 1 ? "" : "s"}.`,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      // Any other non-2xx → generic error bubble with the hint.
      if (!resp.ok) {
        const errBody = body as ChatApiError;
        const errorMsg: ChatMessage = {
          id: newId(),
          role: "error",
          text: errBody.hint || errBody.error || `Request failed (HTTP ${resp.status}).`,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      // Success — add the assistant reply.
      const okBody = body as ChatApiResponse;
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: okBody.reply,
        createdAt: okBody.generatedAt || new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      // Network error — show a generic error bubble. The user's
      // message stays in the list so they can retry.
      const errorMsg: ChatMessage = {
        id: newId(),
        role: "error",
        text: "Network error — couldn't reach the server. Check your connection and try again.",
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  // ─── Enter-to-send (no shift+enter multiline — keep it simple) ──
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input());
    }
  };

  // ─── Suggestion chip click ──────────────────────────────────────
  const useSuggestion = (prompt: string) => {
    if (sending() || featureDisabled()) return;
    sendMessage(prompt);
  };

  // ─── Clear conversation ─────────────────────────────────────────
  const clearChat = () => {
    setMessages([]);
  };

  // ─── Retry re-checking the feature flag (after admin re-enables) ─
  // When the feature was disabled but the admin toggled it back on
  // in another tab, this button re-attempts the last message.
  const retryFeatureCheck = () => {
    setFeatureDisabled(false);
    // Re-send the last user message if there is one.
    const lastUser = [...messages()].reverse().find((m) => m.role === "user");
    if (lastUser) {
      // Remove any trailing error bubble so the retry feels clean.
      setMessages((prev) => {
        const copy = [...prev];
        while (copy.length > 0 && copy[copy.length - 1].role === "error") {
          copy.pop();
        }
        return copy;
      });
      sendMessage(lastUser.text);
    }
  };

  // Cleanup is handled by Solid automatically; no explicit onCleanup
  // needed since we have no timers/listeners.
  onMount(() => {
    // Focus the input on mount so the admin can start typing immediately.
    const inputEl = document.querySelector<HTMLInputElement>(
      ".ai-assistant-input input"
    );
    inputEl?.focus();
  });
  onCleanup(() => {});

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div class="admin-config-shell">
      <div class="admin-config-header">
        <div>
          <h2>AI Assistant</h2>
          <p>
            Ask questions about your CineLog instance — user counts,
            recent activity, system health. Powered by Groq
            configured via /admin/ai). The assistant has live read-only
            access to aggregate system state; it cannot see any user's
            private vault or ratings.
          </p>
        </div>
        <div class="admin-config-actions">
          <GlassButton
            variant="secondary"
            size="compact"
            icon="delete_sweep"
            onClick={clearChat}
            disabled={messages().length === 0 || sending()}
          >
            Clear
          </GlassButton>
        </div>
      </div>

      {/* Disabled banner — shown when the backend returns 403. */}
      <Show when={featureDisabled()}>
        <div
          class="admin-config-alert"
          role="alert"
          style={{ display: "flex", "align-items": "center", gap: "var(--sp-3)", "flex-wrap": "wrap" }}
        >
          <span style={{ flex: "1 1 240px" }}>
            <strong>AI Assistant is disabled.</strong> Enable the Master
            AI Switch + Admin Assistant toggle at{" "}
            <a href="/admin/ai" style={{ color: "inherit", "text-decoration": "underline" }}>
              /admin/ai
            </a>
            , then retry.
          </span>
          <GlassButton
            variant="secondary"
            size="compact"
            icon="refresh"
            onClick={retryFeatureCheck}
          >
            Retry
          </GlassButton>
        </div>
      </Show>

      {/* Chat container */}
      <GlassCard
        class="ai-assistant-card"
        padding="default"
        style={{
          display: "flex",
          "flex-direction": "column",
          height: "min(620px, calc(100vh - 280px))",
          "min-height": "380px",
          padding: "0",
          overflow: "hidden"
        }}
      >
        {/* Message list — scrollable */}
        <div
          ref={scrollContainer}
          class="ai-assistant-messages"
          role="log"
          aria-live="polite"
          aria-label="AI assistant conversation"
          style={{
            "flex": "1 1 auto",
            "overflow-y": "auto",
            "padding": "var(--sp-4)",
            "display": "flex",
            "flex-direction": "column",
            gap: "var(--sp-3)"
          }}
        >
          <Show
            when={messages().length > 0}
            fallback={
              <div
                style={{
                  "margin": "auto",
                  "text-align": "center",
                  "color": "var(--text-muted)",
                  "max-width": "420px"
                }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "3rem", "margin-bottom": "var(--sp-2)" }}
                  aria-hidden="true"
                >
                  smart_toy
                </span>
                <p style={{ margin: "0 0 var(--sp-4) 0", "line-height": "1.5" }}>
                  Ask me anything about your CineLog instance. Try one of
                  these to get started:
                </p>
                <div
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    gap: "var(--sp-2)",
                    "align-items": "stretch"
                  }}
                >
                  <For each={SUGGESTED_PROMPTS}>
                    {(prompt) => (
                      <button
                        type="button"
                        class="ai-assistant-suggestion"
                        onClick={() => useSuggestion(prompt)}
                        disabled={featureDisabled()}
                        style={{
                          "text-align": "left",
                          "padding": "var(--sp-2) var(--sp-3)",
                          "background": "var(--glass-bg)",
                          "border": "1px solid var(--hairline-2)",
                          "border-radius": "var(--radius-md)",
                          "color": "var(--text-secondary)",
                          "cursor": featureDisabled() ? "not-allowed" : "pointer",
                          "opacity": featureDisabled() ? "0.5" : "1",
                          "font-size": "0.875rem",
                          "transition": "border-color 0.15s ease, color 0.15s ease"
                        }}
                      >
                        {prompt}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            <For each={messages()}>
              {(msg) => (
                <div
                  class={`ai-assistant-message ai-assistant-message-${msg.role}`}
                  style={{
                    "display": "flex",
                    "flex-direction": "column",
                    "align-items": msg.role === "user" ? "flex-end" : "flex-start",
                    "max-width": "100%"
                  }}
                >
                  <div
                    class="ai-assistant-bubble"
                    style={{
                      "max-width": "85%",
                      "padding": "var(--sp-2) var(--sp-3)",
                      "border-radius": "var(--radius-md)",
                      "font-size": "0.875rem",
                      "line-height": "1.55",
                      "white-space": "pre-wrap",
                      "word-break": "break-word",
                      ...(msg.role === "user"
                        ? {
                            "background": "var(--accent, #00d9a3)",
                            "color": "var(--on-primary, #001a14)",
                            "border-bottom-right-radius": "4px"
                          }
                        : msg.role === "error"
                          ? {
                              "background": "rgba(239, 68, 68, 0.12)",
                              "color": "rgb(252, 165, 165)",
                              "border": "1px solid rgba(239, 68, 68, 0.3)",
                              "border-bottom-left-radius": "4px"
                            }
                          : {
                              "background": "var(--glass-bg-strong)",
                              "color": "var(--text)",
                              "border": "1px solid var(--hairline-2)",
                              "border-bottom-left-radius": "4px"
                            })
                    }}
                  >
                    {msg.text}
                  </div>
                  <div
                    style={{
                      "font-size": "0.6875rem",
                      "color": "var(--text-muted)",
                      "margin-top": "4px",
                      "padding": "0 4px"
                    }}
                  >
                    {msg.role === "user" ? "You" : msg.role === "error" ? "Error" : "Assistant"} ·{" "}
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </For>

            {/* Typing indicator — shown while waiting for the reply. */}
            <Show when={sending()}>
              <div
                class="ai-assistant-message ai-assistant-message-assistant"
                style={{
                  "display": "flex",
                  "flex-direction": "column",
                  "align-items": "flex-start"
                }}
                aria-label="Assistant is typing"
              >
                <div
                  class="ai-assistant-typing"
                  style={{
                    "display": "flex",
                    "gap": "4px",
                    "padding": "var(--sp-2) var(--sp-3)",
                    "background": "var(--glass-bg-strong)",
                    "border": "1px solid var(--hairline-2)",
                    "border-radius": "var(--radius-md)",
                    "border-bottom-left-radius": "4px"
                  }}
                >
                  <span class="ai-typing-dot" />
                  <span class="ai-typing-dot" />
                  <span class="ai-typing-dot" />
                </div>
              </div>
            </Show>
          </Show>
        </div>

        {/* Input row — pinned to the bottom of the card. */}
        <div
          class="ai-assistant-input"
          style={{
            "flex": "0 0 auto",
            "padding": "var(--sp-3) var(--sp-4)",
            "border-top": "1px solid var(--hairline)",
            "background": "var(--glass-bg)",
            "display": "flex",
            "gap": "var(--sp-2)",
            "align-items": "center"
          }}
        >
          {/* Model selector — only shown when multiple models are available */}
          <Show when={availableModels().length > 1}>
            <select
              value={selectedModel()}
              onChange={(e) => setSelectedModel(e.currentTarget.value)}
              disabled={featureDisabled() || sending()}
              aria-label="Select AI model"
              style={{
                padding: "var(--sp-2) var(--sp-2)",
                "border-radius": "var(--radius-md)",
                border: "1px solid var(--hairline)",
                background: "var(--glass-bg)",
                color: "var(--text)",
                "font-size": "0.75rem",
                "min-width": "100px",
                "flex-shrink": "0"
              }}
            >
              <option value="">Default</option>
              <For each={availableModels()}>
                {(m) => (
                  <option value={m}>
                    {m.split("/")[1] ?? m}
                  </option>
                )}
              </For>
            </select>
          </Show>
          <div style={{ flex: "1 1 auto" }}>
            <GlassInput
              placeholder={
                featureDisabled()
                  ? "AI Assistant is disabled — enable it at /admin/ai"
                  : "Ask about users, activity, system health…"
              }
              value={input()}
              disabled={featureDisabled() || sending()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              icon="chat"
              aria-label="Ask the AI assistant"
            />
          </div>
          <GlassButton
            variant="primary"
            size="default"
            icon="send"
            iconPosition="left"
            onClick={() => sendMessage(input())}
            disabled={input().trim().length === 0 || sending() || featureDisabled()}
            loading={sending()}
            aria-label="Send message"
          >
            Send
          </GlassButton>
        </div>
      </GlassCard>

      {/* Footer info card */}
      <GlassCard
        class="admin-config-card"
        padding="default"
        style={{ "margin-top": "var(--sp-4)" }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--sp-3)",
            "flex-wrap": "wrap"
          }}
        >
          <GlassBadge
        intent="info"
        label={`Groq · ${selectedModel() || defaultModel() || "default"}`}
        size="compact"
      />
          <span
            style={{
              "font-size": "0.8125rem",
              "color": "var(--text-muted)",
              "line-height": "1.5",
              flex: "1 1 280px"
            }}
          >
            Each question is audit-logged with your admin id. The
            assistant receives only <strong>aggregate</strong> system
            stats — never a user's private vault or ratings. If Groq
            hits its free-tier rate limit, you'll see a friendly error
            with a retry countdown.
          </span>
        </div>
      </GlassCard>

      {/* Typing-dot animation styles — scoped to this page via a
          style tag would be cleaner, but inline <style> is fine for
          a single-use animation. We emit it once at the bottom. */}
      <style>{`
        .ai-typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text-muted);
          animation: ai-typing-bounce 1.2s infinite ease-in-out;
        }
        .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes ai-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-typing-dot { animation: none !important; opacity: 0.7; }
        }
        .ai-assistant-suggestion:hover:not(:disabled) {
          border-color: var(--accent, #00d9a3) !important;
          color: var(--text) !important;
        }
      `}</style>
    </div>
  );
};

export default AdminAiAssistantPage;
