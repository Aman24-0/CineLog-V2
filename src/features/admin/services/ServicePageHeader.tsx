// src/features/admin/services/ServicePageHeader.tsx
//
// CineLog V2 — Service Hub Page Header (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Shared header for every /admin/services/<name> page. Renders:
//   • Material Symbol icon (top-left)
//   • Service name (h1)
//   • One-line description (subtitle)
//   • Live status pill (ok / degraded / down / unknown) fetched from
//     /api/admin/services/status on mount + every 60s.
//
// WHY A SHARED HEADER:
//   Each service page (TMDB / MDBList / AniList / Supabase / Resend /
//   Vercel / Web Push) shares the same chrome — icon, title, status
//   pill. Centralizing it means a status-pill visual tweak touches
//   exactly one file, and the per-service page can focus on
//   service-specific config / metrics.
//
// RESPONSIVE:
//   • Mobile  — icon + title stack above status; status pill wraps to
//               its own line below the subtitle.
//   • Desktop — icon + title + status pill on one row, subtitle on
//               the next row, full width.
//
// POLLING:
//   Polls /api/admin/services/status every 60s while the document is
//   visible. Pauses when document.hidden (same pattern as the
//   AdminDashboard stats poller). Pausing avoids wasted API calls on
//   background tabs.

import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  type Component,
  type JSX
} from "solid-js";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";

// ─── Types ───────────────────────────────────────────────────────

type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  latency_ms: number | null;
  detail?: string;
}

interface ServicesStatusResponse {
  services: ServiceHealth[];
  fetched_at: string;
}

// ─── Status → badge intent mapping ──────────────────────────────

const STATUS_INTENT: Record<
  ServiceStatus,
  "success" | "warning" | "danger" | "default"
> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
  unknown: "default"
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown"
};

const STATUS_ICON: Record<ServiceStatus, string> = {
  ok: "check_circle",
  degraded: "warning",
  down: "cancel",
  unknown: "help"
};

// ─── Component ──────────────────────────────────────────────────

interface ServicePageHeaderProps {
  /** Material Symbol icon name. */
  icon: string;
  /** Service name (e.g. "TMDB", "Supabase"). Must match the `service`
   *  field returned by /api/admin/services/status so we can find the
   *  matching health row. */
  name: string;
  /** One-line description shown below the title. */
  description: string;
  /** Optional right-aligned actions (e.g. a "Clean up expired" button). */
  actions?: JSX.Element;
}

const ServicePageHeader: Component<ServicePageHeaderProps> = (props) => {
  const [status, setStatus] = createSignal<ServiceHealth | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const fetchStatus = async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const resp = await fetch("/api/admin/services/status", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!resp.ok) return;
      const data = (await resp.json()) as ServicesStatusResponse;
      const match = data.services.find((s) => s.service === props.name);
      setStatus(match ?? null);
    } catch {
      // Network error — leave the previous status in place so the UI
      // doesn't flicker to "unknown" on a transient blip.
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    } else {
      if (!pollTimer) {
        void fetchStatus();
        pollTimer = setInterval(fetchStatus, 60_000);
      }
    }
  };

  onMount(() => {
    void fetchStatus();
    pollTimer = setInterval(fetchStatus, 60_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  const currentStatus = (): ServiceStatus => status()?.status ?? "unknown";

  return (
    <header
      class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      data-testid="service-page-header"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex items-center gap-3">
          <span
            class="material-symbols-outlined flex-shrink-0 text-2xl text-primary md:text-3xl"
            style={{
              "font-variation-settings":
                "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 32"
            }}
            aria-hidden="true"
          >
            {props.icon}
          </span>
          <h1 class="m-0 text-xl font-bold text-text-strong sm:text-2xl">
            {props.name}
          </h1>
          <Show when={status()}>
            <GlassBadge
              intent={STATUS_INTENT[currentStatus()]}
              icon={STATUS_ICON[currentStatus()]}
              label={STATUS_LABEL[currentStatus()]}
              size="compact"
              glass
              class="flex-shrink-0"
            />
          </Show>
        </div>
        <p class="m-0 max-w-2xl text-sm text-text-muted">
          {props.description}
        </p>
        <Show when={status()?.detail}>
          <p class="m-0 font-mono text-[11px] text-text-soft">
            {status()!.detail}
            <Show when={status()!.latency_ms !== null}>
              {" "}
              · {status()!.latency_ms}ms
            </Show>
          </p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex flex-shrink-0 items-center gap-2">{props.actions}</div>
      </Show>
    </header>
  );
};

export default ServicePageHeader;
