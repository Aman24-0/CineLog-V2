// src/features/admin/services/ServiceKeyStatus.tsx
//
// CineLog V2 — Service Key Status Pill (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// Tiny presentational component used by every Services Hub page to
// show whether an API key / access token env var is configured.
// We deliberately do NOT show the key itself (even masked) — the
// dashboard's job is "is it set?", not "what is it?". The admin
// rotates keys via the Vercel dashboard, not from the admin panel.

import { Show, type Component } from "solid-js";
import { GlassBadge } from "~/shared/ui/glass/GlassBadge";

interface ServiceKeyStatusProps {
  /** True if the env var is set + non-empty. */
  present: boolean;
  /** Label shown to the left of the badge (e.g. "TMDB_API_KEY"). */
  label: string;
  /** Optional monospace string shown beneath (e.g. "set in Vercel prod env"). */
  hint?: string;
}

const ServiceKeyStatus: Component<ServiceKeyStatusProps> = (props) => (
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <span class="font-mono text-xs text-text-secondary">{props.label}</span>
      <Show when={props.present} fallback={
        <GlassBadge intent="danger" icon="close" label="Missing" size="compact" />
      }>
        <GlassBadge intent="success" icon="check" label="Set" size="compact" />
      </Show>
    </div>
    <Show when={props.hint}>
      <span class="font-mono text-[11px] text-text-soft">{props.hint}</span>
    </Show>
  </div>
);

export default ServiceKeyStatus;
