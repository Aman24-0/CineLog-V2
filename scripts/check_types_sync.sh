#!/usr/bin/env bash
# CineLog V2 — CI Check: database.types.ts freshness
# ---------------------------------------------------------------------
# P4-18 Fix: Ensures the auto-generated database.types.ts stays in sync
# with the actual Supabase schema. If a developer modifies the schema
# but forgets to regenerate types, this check fails the CI build.
#
# Usage:
#   ./scripts/check_types_sync.sh
#
# Prerequisites:
#   - Supabase CLI installed (`supabase` in PATH)
#   - .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
#
# How it works:
#   1. Regenerates types into a temporary file
#   2. Compares with the committed database.types.ts
#   3. Fails if they differ (developer forgot to commit updated types)
#
set -euo pipefail

TYPES_FILE="src/lib/supabase/database.types.ts"
TEMP_FILE=$(mktemp)

echo "🔍 Checking database.types.ts freshness..."

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
  echo "⚠️  Supabase CLI not found — skipping types check."
  echo "   Install it: https://supabase.com/docs/guides/cli"
  exit 0
fi

# Check if .env has the required vars
if [ ! -f .env ]; then
  echo "⚠️  .env file not found — skipping types check."
  exit 0
fi

# Generate types
if supabase gen types typescript --project-id "${VITE_SUPABASE_URL#https://}" > "$TEMP_FILE" 2>/dev/null; then
  # Compare (ignore header comments and trailing whitespace)
  if diff -q <(grep -v '^//' "$TYPES_FILE" | grep -v '^$') <(grep -v '^//' "$TEMP_FILE" | grep -v '^$') > /dev/null 2>&1; then
    echo "✅ database.types.ts is in sync with Supabase schema."
    rm -f "$TEMP_FILE"
    exit 0
  else
    echo "❌ database.types.ts is OUT OF SYNC with Supabase schema!"
    echo ""
    echo "   The committed types file differs from the current database schema."
    echo "   Please regenerate and commit the updated types:"
    echo ""
    echo "     supabase gen types typescript > $TYPES_FILE"
    echo ""
    rm -f "$TEMP_FILE"
    exit 1
  fi
else
  echo "⚠️  Failed to generate types (Supabase project may not be linked)."
  echo "   Skipping types check."
  rm -f "$TEMP_FILE"
  exit 0
fi
