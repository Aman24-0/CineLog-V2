/**
 * CineLog V2 — Collection Errors & Unsupported Feature Handling
 * ---------------------------------------------------------------------
 * Phase 8.1 — Production Polish
 *
 * Provides explicit, typed error handling for features that the
 * Supabase `collections` schema does not support. This replaces the
 * previous silent-ignore behavior with explicit, documented errors
 * and warnings.
 *
 * Three categories of unsupported features:
 *
 * 1. Smart Collection Rules
 *    The `collections` table has NO column for storing smart rules
 *    (no JSONB, no rules column). The Database Bible §04 defines
 *    `collection_type = "smart"` but does not define a rules column.
 *    Rules exist only in memory/client-side evaluation. Any attempt
 *    to persist rules throws {@link UnsupportedFeatureError}.
 *
 * 2. Entry media_type
 *    The `collection_entries` table has NO `media_type` column — it
 *    is on the `vault` row (FK). When reading entries, media_type
 *    must be resolved from the vault. If it cannot be resolved, the
 *    entry's `media_type` is left `undefined` (never defaulted to
 *    "movie"). See {@link UnresolvedMediaTypeError}.
 *
 * 3. Unsupported Collection Fields
 *    Fields like `emoji`, `isArchived` have no corresponding column
 *    in the `collections` table. Passing them to updateCollectionMeta
 *    produces an {@link UnsupportedFieldsWarning} listing the fields
 *    that were silently dropped — the supported fields are still
 *    persisted. The caller can inspect the warning to inform the user.
 */

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when an operation requires a feature the Supabase schema does
 * not support. The `feature` field identifies which capability is
 * missing, and `message` explains the limitation.
 *
 * Callers should catch this and surface a user-facing message (e.g.
 * "Smart collection rules cannot be saved in the current database
 * schema").
 */
export class UnsupportedFeatureError extends Error {
  readonly feature: string;
  readonly schemaLimitation: string;

  constructor(feature: string, schemaLimitation: string, message?: string) {
    super(message ?? `[${feature}] ${schemaLimitation}`);
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
    this.schemaLimitation = schemaLimitation;
  }
}

/**
 * Thrown when `media_type` cannot be resolved for a collection entry.
 * This happens when the vault item referenced by the entry no longer
 * exists (was deleted) or the vault lookup fails.
 *
 * The operation should be skipped — never default to "movie".
 */
export class UnresolvedMediaTypeError extends Error {
  readonly vaultId: string;

  constructor(vaultId: string) {
    super(
      `Cannot resolve media_type for vault item ${vaultId}. ` +
        "The vault item may have been deleted. Operation skipped — no default assumed."
    );
    this.name = "UnresolvedMediaTypeError";
    this.vaultId = vaultId;
  }
}

// ---------------------------------------------------------------------------
// Warning type (non-fatal — operation succeeds but some fields dropped)
// ---------------------------------------------------------------------------

/**
 * A warning returned when an operation succeeds but some fields were
 * not persisted because the schema doesn't support them.
 *
 * Unlike {@link UnsupportedFeatureError}, this does NOT throw — the
 * supported fields ARE persisted. The caller can inspect `droppedFields`
 * to inform the user that certain data was not saved.
 */
export interface UnsupportedFieldsWarning {
  /** Names of fields that were silently dropped (not persisted). */
  readonly droppedFields: string[];
  /** Human-readable explanation for each dropped field. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Feature support registry
// ---------------------------------------------------------------------------

/**
 * Documents which collection features are supported by the current
 * Supabase schema. This is the single source of truth for capability
 * checking — callers consult this before attempting an operation.
 */
export const COLLECTION_FEATURE_SUPPORT = {
  /** Smart collection rules (JSONB rules array) — NOT supported. */
  smartRules: {
    supported: false as const,
    limitation:
      "The collections table has no JSONB or rules column. " +
      "Smart collection rules are evaluated client-side only and cannot be persisted. " +
      "Database Bible §04 defines collection_type='smart' but does not define a rules column.",
  },
  /** Entry media_type — resolved from vault, not stored on collection_entries. */
  entryMediaType: {
    supported: false as const,
    limitation:
      "The collection_entries table has no media_type column. " +
      "media_type must be resolved from the vault row via FK. " +
      "If the vault item is deleted, media_type is unresolvable.",
  },
  /** Collection emoji — NOT supported (no column). */
  emoji: {
    supported: false as const,
    limitation: "The collections table has no emoji column.",
  },
  /** Collection archived flag — supported via `archived_at` column.
   *  NULL = active, ISO timestamp = archived. The dedicated
   *  archiveCollection / unarchiveCollection methods on the
   *  CollectionRepository are the preferred write path — they use
   *  locked predicates (only archive if not already archived, etc.).
   *  The updateCollectionMeta path can also clear/set archivedAt
   *  for legacy callers that still pass isArchived. */
  isArchived: {
    supported: true as const,
    mappedTo: "archived_at",
  },
  /** Collection accentColor — mapped to `color` column. */
  accentColor: {
    supported: true as const,
    mappedTo: "color",
  },
} as const;

/**
 * Check if a feature is supported and return a typed error if not.
 * Throws {@link UnsupportedFeatureError} if the feature is not supported.
 */
export function requireFeatureSupport(feature: keyof typeof COLLECTION_FEATURE_SUPPORT): void {
  const info = COLLECTION_FEATURE_SUPPORT[feature];
  if (!info.supported) {
    throw new UnsupportedFeatureError(feature, info.limitation);
  }
}

// ---------------------------------------------------------------------------
// Unsupported fields detection for updateCollectionMeta
// ---------------------------------------------------------------------------

/**
 * Input shape for collection metadata updates — includes both supported
 * and unsupported fields. The caller passes whatever the UI provides;
 * {@link detectUnsupportedMetaFields} separates them.
 */
export interface CollectionMetaInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  coverUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string;
  emoji?: string;
  isArchived?: boolean;
}

/**
 * Result of separating supported from unsupported metadata fields.
 * `supported` is what can be persisted; `dropped` lists what cannot.
 */
export interface SeparatedMetaFields {
  supported: {
    name?: string;
    description?: string | null;
    coverUrl?: string | null;
    bannerUrl?: string | null;
    color?: string | null;
    archivedAt?: string | null;
  };
  dropped: UnsupportedFieldsWarning | null;
}

/**
 * Separate supported collection metadata fields from unsupported ones.
 *
 * Supported fields are mapped to their Supabase column names.
 * `isArchived` is translated into `archivedAt` (NOW() / null) so
 * callers can persist it through the standard updateCollectionMeta
 * path. `emoji` remains unsupported and is collected into a warning
 * — it is NOT silently ignored.
 */
export function detectUnsupportedMetaFields(meta: CollectionMetaInput): SeparatedMetaFields {
  const droppedFields: string[] = [];

  if (meta.emoji !== undefined) {
    droppedFields.push("emoji");
    console.warn(`[updateCollectionMeta] "emoji" not supported: ${COLLECTION_FEATURE_SUPPORT.emoji.limitation}`);
  }

  // Translate isArchived → archivedAt (NOW() when archiving, null when unarchiving).
  // The dedicated archiveCollection/unarchiveCollection methods on
  // the repository are preferred (they use locked predicates), but
  // the meta path also supports it for callers that batch metadata
  // updates (e.g. FolderEditor's archive toggle).
  let archivedAt: string | null | undefined = undefined;
  if (meta.isArchived !== undefined) {
    archivedAt = meta.isArchived ? new Date().toISOString() : null;
  }

  return {
    supported: {
      name: meta.name,
      description: meta.description,
      coverUrl: meta.coverUrl,
      bannerUrl: meta.bannerUrl,
      color: meta.color ?? meta.accentColor ?? null,
      archivedAt,
    },
    dropped: droppedFields.length > 0
      ? { droppedFields, reason: "Fields have no corresponding column in the collections table." }
      : null,
  };
}
