// src/routes/api/admin/database.ts
//
// CineLog V2 — Admin Database Inspector API
// ---------------------------------------------------------------------
// Lists all tables in the public schema with their row counts and RLS
// policies. Read-only — no mutations.
//
// Endpoints:
//   GET /api/admin/database                    — list all public tables
//   GET /api/admin/database?table=<name>       — RLS policies for one table
//   GET /api/admin/database?table=<name>&policies=1  — explicit policies-only
//
// STRICT USER-SIDE MAPPING:
//   Only the 27 tables that actually exist in public.* (per
//   src/lib/supabase/database.types.ts + the migrations) are inspected.
//   No dummy tables are invented. Row counts come from the live DB via
//   `supabase.from(table).select('*', { count: 'exact', head: true })`.
//
// RLS POLICIES:
//   PostgREST does NOT expose the `pg_policies` view by default. To
//   surface RLS policies without requiring a new migration, we keep a
//   static, hand-curated map of the policies that the migrations create.
//   This is acceptable because:
//     1. RLS policies are set by migrations (immutable between deploys).
//     2. The map is sourced verbatim from supabase/migrations/*.sql.
//     3. The UI clearly labels this as "From migrations" so the admin
//        knows it's not live DB introspection.
//   If a table has no entry in the map, the UI shows "No policies
//   documented" rather than fabricating data.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

interface TableInfo {
  name: string;
  row_count: number | null;
  /** Estimated on-disk size, if available. Null when RPC is missing. */
  size_bytes: number | null;
  size_pretty: string | null;
  /** True if RLS is enabled on the table (per migrations). */
  rls_enabled: boolean;
  /** Error fetching row count, if any. */
  error?: string;
}

interface RlsPolicy {
  name: string;
  command: string; // SELECT, INSERT, UPDATE, DELETE, ALL
  roles: string[]; // e.g. ["authenticated"], ["anon"], ["public"]
  using: string; // USING expression
  check: string; // WITH CHECK expression
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// The 30 tables in public.* (sourced from database.types.ts and
// supabase/migrations/*.sql).
//
// Bug #13 (Phase 13 Chunk 3): Three tables were missing from this
// list — `admin_2fa_secrets` (Phase 13 Chunk 2 security hardening),
// `announcement_dismissals` (Phase 9 Chunk 4 Communication Hub), and
// `user_integrations` (Phase 12 Trakt sync). They existed in the DB
// and had RLS enabled, but were invisible in the Admin DB Inspector.
// Each entry is annotated with whether RLS is enabled, based on a
// reading of supabase/migrations/*.sql. Tables without explicit RLS
// enablement in migrations are marked rls_enabled: false.
const PUBLIC_TABLES: Array<{ name: string; rls_enabled: boolean }> = [
  { name: "activity_log", rls_enabled: true },
  { name: "admin_2fa_secrets", rls_enabled: true },
  { name: "admin_actions", rls_enabled: true },
  { name: "anime_mappings", rls_enabled: true },
  { name: "announcement_dismissals", rls_enabled: true },
  { name: "announcements", rls_enabled: true },
  { name: "app_config", rls_enabled: true },
  { name: "collection_entries", rls_enabled: true },
  { name: "collections", rls_enabled: true },
  { name: "curated_universe_entries", rls_enabled: true },
  { name: "curated_universes", rls_enabled: true },
  { name: "episode_progress", rls_enabled: true },
  { name: "external_ids", rls_enabled: true },
  { name: "featured_content", rls_enabled: true },
  { name: "import_export_jobs", rls_enabled: true },
  { name: "login_history", rls_enabled: true },
  { name: "maintenance_runs", rls_enabled: true },
  { name: "notifications", rls_enabled: true },
  { name: "profiles", rls_enabled: true },
  { name: "push_subscriptions", rls_enabled: true },
  { name: "rate_limit_buckets", rls_enabled: false },
  { name: "tmdb_cache", rls_enabled: true },
  { name: "universe_phases", rls_enabled: true },
  { name: "universe_viewing_order_entries", rls_enabled: true },
  { name: "universe_viewing_orders", rls_enabled: true },
  { name: "user_integrations", rls_enabled: true },
  { name: "user_preferences", rls_enabled: true },
  { name: "user_presets", rls_enabled: true },
  { name: "user_reminders", rls_enabled: true },
  { name: "user_universe_subscriptions", rls_enabled: true },
  { name: "vault", rls_enabled: true }
];

// Hand-curated RLS policy map, sourced from supabase/migrations/*.sql.
// Only tables that have explicit CREATE POLICY statements in migrations
// are listed. Tables without entries return an empty array (the UI
// shows "No policies documented").
//
// This is NOT live DB introspection — it's a static reflection of the
// migration history. To regenerate, grep migrations for CREATE POLICY.
const RLS_POLICIES: Record<string, RlsPolicy[]> = {
  profiles: [
    {
      name: "Profiles are viewable by everyone",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    },
    {
      name: "Users can insert their own profile",
      command: "INSERT",
      roles: ["authenticated"],
      using: "auth.uid() = id",
      check: "auth.uid() = id"
    },
    {
      name: "Users can update own profile",
      command: "UPDATE",
      roles: ["authenticated"],
      using: "auth.uid() = id",
      check: "auth.uid() = id"
    }
  ],
  vault: [
    {
      name: "Users can CRUD their own vault entries",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  collections: [
    {
      name: "Users can CRUD their own collections",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  collection_entries: [
    {
      name: "Users can CRUD entries in their own collections",
      command: "ALL",
      roles: ["authenticated"],
      using: "collection_id IN (SELECT id FROM collections WHERE user_id = auth.uid())",
      check: "collection_id IN (SELECT id FROM collections WHERE user_id = auth.uid())"
    }
  ],
  activity_log: [
    {
      name: "Users can insert their own activity log",
      command: "INSERT",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    },
    {
      name: "Users can select their own activity log",
      command: "SELECT",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: ""
    }
  ],
  tmdb_cache: [
    {
      name: "Anyone can read TMDB cache",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  user_preferences: [
    {
      name: "Users can CRUD their own preferences",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  user_presets: [
    {
      name: "Users can CRUD their own presets",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  admin_actions: [
    {
      name: "Admins can read audit log",
      command: "SELECT",
      roles: ["authenticated"],
      using: "EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true AND p.admin_disabled_at IS NULL)",
      check: ""
    }
  ],
  announcements: [
    {
      name: "Anyone can read announcements",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "is_published = true AND (scheduled_at IS NULL OR scheduled_at <= now())",
      check: ""
    }
  ],
  episode_progress: [
    {
      name: "Users can CRUD their own episode progress",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  notifications: [
    {
      name: "Users can CRUD their own notifications",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  login_history: [
    {
      name: "Users can read their own login history",
      command: "SELECT",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: ""
    },
    {
      name: "Users can insert their own login history",
      command: "INSERT",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  push_subscriptions: [
    {
      name: "Users can CRUD their own push subscriptions",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  user_reminders: [
    {
      name: "Users can CRUD their own reminders",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  curated_universes: [
    {
      name: "Anyone can read curated universes",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "is_hidden = false",
      check: ""
    }
  ],
  curated_universe_entries: [
    {
      name: "Anyone can read curated universe entries",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  universe_phases: [
    {
      name: "Anyone can read universe phases",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  universe_viewing_orders: [
    {
      name: "Anyone can read viewing orders",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  universe_viewing_order_entries: [
    {
      name: "Anyone can read viewing order entries",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  user_universe_subscriptions: [
    {
      name: "Users can CRUD their own subscriptions",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  external_ids: [
    {
      name: "Anyone can read external IDs",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  featured_content: [
    {
      name: "Anyone can read featured content",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "is_active = true",
      check: ""
    }
  ],
  import_export_jobs: [
    {
      name: "Users can CRUD their own import/export jobs",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.uid() = user_id",
      check: "auth.uid() = user_id"
    }
  ],
  maintenance_runs: [
    {
      name: "Admins can read maintenance runs",
      command: "SELECT",
      roles: ["authenticated"],
      using: "EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true AND p.admin_disabled_at IS NULL)",
      check: ""
    }
  ],
  anime_mappings: [
    {
      name: "Anyone can read anime mappings",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ],
  app_config: [
    {
      name: "Anyone can read app_config",
      command: "SELECT",
      roles: ["anon", "authenticated"],
      using: "true",
      check: ""
    }
  ]
};

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const tableFilter = url.searchParams.get("table")?.trim();
    const policiesOnly = url.searchParams.get("policies") === "1";

    // Single-table policy lookup
    if (tableFilter && policiesOnly) {
      const policies = RLS_POLICIES[tableFilter] ?? [];
      return jsonResponse({
        table: tableFilter,
        rls_enabled: PUBLIC_TABLES.find((t) => t.name === tableFilter)?.rls_enabled ?? false,
        policies,
        source: "migrations"
      });
    }

    const supabase = createAdminClient();

    // Fetch row counts for every table in parallel. We use head:true so
    // no rows are actually returned — only the count.
    const tables = tableFilter
      ? PUBLIC_TABLES.filter((t) => t.name === tableFilter)
      : PUBLIC_TABLES;

    const results = await Promise.all(
      tables.map(async (t): Promise<TableInfo> => {
        try {
          const { count, error } = await supabase
            .from(t.name)
            .select("*", { count: "exact", head: true });
          if (error) {
            return {
              name: t.name,
              row_count: null,
              size_bytes: null,
              size_pretty: null,
              rls_enabled: t.rls_enabled,
              error: error.message
            };
          }
          return {
            name: t.name,
            row_count: count ?? 0,
            // On-disk size requires pg_total_relation_size() which isn't
            // exposed via PostgREST. We surface null rather than fabricate.
            size_bytes: null,
            size_pretty: null,
            rls_enabled: t.rls_enabled
          };
        } catch (err) {
          return {
            name: t.name,
            row_count: null,
            size_bytes: null,
            size_pretty: null,
            rls_enabled: t.rls_enabled,
            error: err instanceof Error ? err.message : "Unknown error"
          };
        }
      })
    );

    // Annotate each table with its policy count (from the static map)
    // so the UI can show a badge without a second round-trip.
    const annotated = results.map((t) => ({
      ...t,
      policy_count: RLS_POLICIES[t.name]?.length ?? 0
    }));

    return jsonResponse({
      tables: annotated,
      total_tables: annotated.length,
      size_note:
        "On-disk size requires pg_total_relation_size() which is not exposed via PostgREST. Use the Supabase dashboard for disk-size breakdowns.",
      policies_source: "migrations"
    });
  } catch (err) {
    console.error("[admin/database] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
