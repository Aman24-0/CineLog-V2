export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action_type"];
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: unknown;
          metadata: Json;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["activity_action_type"];
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["activity_action_type"];
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      collection_entries: {
        Row: {
          collection_id: string;
          created_at: string;
          id: string;
          order_index: number;
          position: number;
          vault_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          id?: string;
          order_index?: number;
          position?: number;
          vault_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          id?: string;
          order_index?: number;
          position?: number;
          vault_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_entries_collection_fk";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_entries_vault_fk";
            columns: ["vault_id"];
            isOneToOne: false;
            referencedRelation: "vault";
            referencedColumns: ["id"];
          }
        ];
      };
      collections: {
        Row: {
          archived_at: string | null;
          banner_url: string | null;
          collection_type: Database["public"]["Enums"]["collection_type"];
          color: string | null;
          cover_url: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          name: string;
          /** Phase 4 Task 1: Smart collection rules (JSON-serialised SmartRule[]). NULL for non-smart collections. */
          rules: Json | null;
          sort_mode: Database["public"]["Enums"]["sort_mode_type"];
          updated_at: string;
          user_id: string | null;
          view_mode: Database["public"]["Enums"]["collection_view_type"];
        };
        Insert: {
          archived_at?: string | null;
          banner_url?: string | null;
          collection_type: Database["public"]["Enums"]["collection_type"];
          color?: string | null;
          cover_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          rules?: Json | null;
          sort_mode?: Database["public"]["Enums"]["sort_mode_type"];
          updated_at?: string;
          user_id?: string | null;
          view_mode?: Database["public"]["Enums"]["collection_view_type"];
        };
        Update: {
          archived_at?: string | null;
          banner_url?: string | null;
          collection_type?: Database["public"]["Enums"]["collection_type"];
          color?: string | null;
          cover_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          rules?: Json | null;
          sort_mode?: Database["public"]["Enums"]["sort_mode_type"];
          updated_at?: string;
          user_id?: string | null;
          view_mode?: Database["public"]["Enums"]["collection_view_type"];
        };
        Relationships: [
          {
            foreignKeyName: "collections_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      curated_universe_entries: {
        Row: {
          created_at: string;
          id: string;
          incident_year: number | null;
          /** Phase 9 Chunk 5a: key story beats for this entry (e.g. "First Infinity Stone"). */
          key_events: string[];
          /** Phase 9 Chunk 5a: marks a recommended starting point for new viewers. */
          is_entry_point: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          note: string | null;
          position: number;
          /** Phase 9 Chunk 5a: which sub-universe this entry belongs to (e.g. "Earth-616", "What If...?"). */
          sub_universe: string;
          /** Phase 9 Chunk 5a: where this entry fits in the story. */
          story_note: string | null;
          tmdb_id: number;
          universe_id: string;
          /** Phase 9 Chunk 5a: admin-defined viewing order within the universe. */
          viewing_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          incident_year?: number | null;
          key_events?: string[];
          is_entry_point?: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          note?: string | null;
          position?: number;
          sub_universe?: string;
          story_note?: string | null;
          tmdb_id: number;
          universe_id: string;
          viewing_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          incident_year?: number | null;
          key_events?: string[];
          is_entry_point?: boolean;
          media_type?: Database["public"]["Enums"]["media_type"];
          note?: string | null;
          position?: number;
          sub_universe?: string;
          story_note?: string | null;
          tmdb_id?: number;
          universe_id?: string;
          viewing_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "curated_universe_entries_universe_fk";
            columns: ["universe_id"];
            isOneToOne: false;
            referencedRelation: "curated_universes";
            referencedColumns: ["id"];
          }
        ];
      };
      curated_universes: {
        Row: {
          banner_url: string | null;
          color: string | null;
          /** Phase 9 Chunk 5a: optional accent color override for the universe hub. */
          color_theme: string | null;
          cover_url: string | null;
          created_at: string;
          default_view: Database["public"]["Enums"]["universe_default_view_type"];
          description: string | null;
          /** Phase 9 Chunk 5a: universe classification (cinematic_universe, franchise, anthology, shared_universe, multiverse). */
          franchise_type: string | null;
          id: string;
          /** Phase 9 Chunk 5a: rich text lore / background paragraph. */
          lore: string | null;
          name: string;
          slug: string;
          /** Phase 9 Chunk 5a: total number of entries (denormalized for fast display). */
          total_entries: number;
          updated_at: string;
          /** Phase 9 Chunk 5a: admin-written recommended viewing guide. */
          viewing_order_guide: string | null;
        };
        Insert: {
          banner_url?: string | null;
          color?: string | null;
          color_theme?: string | null;
          cover_url?: string | null;
          created_at?: string;
          default_view?: Database["public"]["Enums"]["universe_default_view_type"];
          description?: string | null;
          franchise_type?: string | null;
          id?: string;
          lore?: string | null;
          name: string;
          slug: string;
          total_entries?: number;
          updated_at?: string;
          viewing_order_guide?: string | null;
        };
        Update: {
          banner_url?: string | null;
          color?: string | null;
          color_theme?: string | null;
          cover_url?: string | null;
          created_at?: string;
          default_view?: Database["public"]["Enums"]["universe_default_view_type"];
          description?: string | null;
          franchise_type?: string | null;
          id?: string;
          lore?: string | null;
          name?: string;
          slug?: string;
          total_entries?: number;
          updated_at?: string;
          viewing_order_guide?: string | null;
        };
        Relationships: [];
      };
      universe_phases: {
        Row: {
          id: string;
          universe_id: string;
          label: string;
          description: string | null;
          before_entry_id: string | null;
          /** Phase 4 Task 5: Kind of identifier in before_entry_id — 'uuid' | 'tmdb_id' | NULL (when before_entry_id is NULL). */
          before_entry_kind: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
          /** Phase 9 Chunk 5a: phase cover image URL. */
          cover_url: string | null;
          /** Phase 9 Chunk 5a: phase-specific lore / backstory. */
          lore: string | null;
          /** Phase 9 Chunk 5a: sub-universe label (e.g. "Earth-616", "What If...?", "TV Series"). Defaults to 'main'. */
          sub_universe: string;
          /** Phase 9 Chunk 5a: order in which to watch the phases. */
          viewing_order: number;
        };
        Insert: {
          id?: string;
          universe_id: string;
          label: string;
          description?: string | null;
          before_entry_id?: string | null;
          before_entry_kind?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
          cover_url?: string | null;
          lore?: string | null;
          sub_universe?: string;
          viewing_order?: number;
        };
        Update: {
          id?: string;
          universe_id?: string;
          label?: string;
          description?: string | null;
          before_entry_id?: string | null;
          before_entry_kind?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
          cover_url?: string | null;
          lore?: string | null;
          sub_universe?: string;
          viewing_order?: number;
        };
        Relationships: [];
      };
      episode_progress: {
        Row: {
          created_at: string;
          episode_number: number;
          id: string;
          is_completed: boolean;
          progress_minutes: number;
          /** Phase 6 Task 2: per-episode rating (1-10 or 1-5, app-validated). NULL = no rating. */
          rating: number | null;
          season_number: number;
          updated_at: string;
          vault_id: string;
          watched_at: string | null;
        };
        Insert: {
          created_at?: string;
          episode_number: number;
          id?: string;
          is_completed?: boolean;
          progress_minutes?: number;
          rating?: number | null;
          season_number: number;
          updated_at?: string;
          vault_id: string;
          watched_at?: string | null;
        };
        Update: {
          created_at?: string;
          episode_number?: number;
          id?: string;
          is_completed?: boolean;
          progress_minutes?: number;
          rating?: number | null;
          season_number?: number;
          updated_at?: string;
          vault_id?: string;
          watched_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "episode_progress_vault_fk";
            columns: ["vault_id"];
            isOneToOne: false;
            referencedRelation: "vault";
            referencedColumns: ["id"];
          }
        ];
      };
      external_ids: {
        Row: {
          created_at: string;
          external_id: string;
          id: string;
          provider: Database["public"]["Enums"]["external_provider_type"];
          updated_at: string;
          vault_id: string;
        };
        Insert: {
          created_at?: string;
          external_id: string;
          id?: string;
          provider: Database["public"]["Enums"]["external_provider_type"];
          updated_at?: string;
          vault_id: string;
        };
        Update: {
          created_at?: string;
          external_id?: string;
          id?: string;
          provider?: Database["public"]["Enums"]["external_provider_type"];
          updated_at?: string;
          vault_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "external_ids_vault_fk";
            columns: ["vault_id"];
            isOneToOne: false;
            referencedRelation: "vault";
            referencedColumns: ["id"];
          }
        ];
      };
      import_export_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          failed_records: number;
          file_size_bytes: number | null;
          file_url: string | null;
          format: Database["public"]["Enums"]["import_export_format"];
          id: string;
          job_type: Database["public"]["Enums"]["import_export_job_type"];
          processed_records: number;
          source: Database["public"]["Enums"]["import_export_source"] | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["import_export_status"];
          total_records: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          failed_records?: number;
          file_size_bytes?: number | null;
          file_url?: string | null;
          format?: Database["public"]["Enums"]["import_export_format"];
          id?: string;
          job_type: Database["public"]["Enums"]["import_export_job_type"];
          processed_records?: number;
          source?: Database["public"]["Enums"]["import_export_source"] | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["import_export_status"];
          total_records?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          failed_records?: number;
          file_size_bytes?: number | null;
          file_url?: string | null;
          format?: Database["public"]["Enums"]["import_export_format"];
          id?: string;
          job_type?: Database["public"]["Enums"]["import_export_job_type"];
          processed_records?: number;
          source?: Database["public"]["Enums"]["import_export_source"] | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["import_export_status"];
          total_records?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_export_jobs_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          admin_disabled_at: string | null;
          avatar_url: string | null;
          banner_override_path: string | null;
          banner_type: string;
          banner_url: string | null;
          bio: string | null;
          country: string;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          display_name_initialized: boolean;
          favorite_director_id: string | null;
          favorite_genre: string | null;
          favorite_movie_id: string | null;
          favorite_series_id: string | null;
          id: string;
          is_admin: boolean;
          language_code: string;
          scheduled_deletion_at: string | null;
          timezone: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          admin_disabled_at?: string | null;
          avatar_url?: string | null;
          banner_override_path?: string | null;
          banner_type?: string;
          banner_url?: string | null;
          bio?: string | null;
          country: string;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          display_name_initialized?: boolean;
          favorite_director_id?: string | null;
          favorite_genre?: string | null;
          favorite_movie_id?: string | null;
          favorite_series_id?: string | null;
          id: string;
          is_admin?: boolean;
          language_code?: string;
          scheduled_deletion_at?: string | null;
          timezone?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          admin_disabled_at?: string | null;
          avatar_url?: string | null;
          banner_override_path?: string | null;
          banner_type?: string;
          banner_url?: string | null;
          bio?: string | null;
          country?: string;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          display_name_initialized?: boolean;
          favorite_director_id?: string | null;
          favorite_genre?: string | null;
          favorite_movie_id?: string | null;
          favorite_series_id?: string | null;
          id?: string;
          is_admin?: boolean;
          language_code?: string;
          scheduled_deletion_at?: string | null;
          timezone?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      tmdb_cache: {
        Row: {
          created_at: string;
          data: Json;
          expires_at: string;
          fetched_at: string;
          id: string;
          media_type: Database["public"]["Enums"]["media_type"];
          tmdb_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          data: Json;
          expires_at: string;
          fetched_at?: string;
          id?: string;
          media_type: Database["public"]["Enums"]["media_type"];
          tmdb_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          expires_at?: string;
          fetched_at?: string;
          id?: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          tmdb_id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      // ── Audio-language cache (added by 20260816_audio_languages_cache.sql) ──
      // Stores per-title dubbed-audio language information. Composite key
      // (media_type, tmdb_id). `data` is the full AudioLanguageResult JSON.
      // Reads are world-readable (RLS policy); writes go through the
      // service role.
      audio_languages_cache: {
        Row: {
          id: string;
          media_type: string; // "movie" | "tv" (text check constraint)
          tmdb_id: number;
          data: Json;
          expires_at: string;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          media_type: string;
          tmdb_id: number;
          data: Json;
          expires_at: string;
          fetched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          media_type?: string;
          tmdb_id?: number;
          data?: Json;
          expires_at?: string;
          fetched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      login_history: {
        Row: {
          id: string;
          user_id: string;
          ip_address: string | null;
          user_agent: string | null;
          login_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ip_address?: string | null;
          user_agent?: string | null;
          login_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          login_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "login_history_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_preferences: {
        Row: {
          accent_color: string;
          adult_content: Database["public"]["Enums"]["adult_content_type"];
          collection_view: Database["public"]["Enums"]["collection_view_type"];
          country: string;
          created_at: string;
          default_sort: Database["public"]["Enums"]["sort_mode_type"];
          density: Database["public"]["Enums"]["density_type"];
          discover_view: Database["public"]["Enums"]["discover_view_type"];
          id: string;
          language_code: string;
          prefs_json: Json | null;
          preferred_content: Database["public"]["Enums"]["preferred_content_type"];
          spoiler_level: Database["public"]["Enums"]["spoiler_level_type"];
          theme: Database["public"]["Enums"]["theme_type"];
          timezone: string;
          updated_at: string;
          user_id: string;
          vault_view: Database["public"]["Enums"]["vault_view_type"];
          weekly_recap_last_sent: string | null;
        };
        Insert: {
          accent_color?: string;
          adult_content?: Database["public"]["Enums"]["adult_content_type"];
          collection_view?: Database["public"]["Enums"]["collection_view_type"];
          country?: string;
          created_at?: string;
          default_sort?: Database["public"]["Enums"]["sort_mode_type"];
          density?: Database["public"]["Enums"]["density_type"];
          discover_view?: Database["public"]["Enums"]["discover_view_type"];
          id?: string;
          language_code?: string;
          prefs_json?: Json | null;
          preferred_content?: Database["public"]["Enums"]["preferred_content_type"];
          spoiler_level?: Database["public"]["Enums"]["spoiler_level_type"];
          theme?: Database["public"]["Enums"]["theme_type"];
          timezone?: string;
          updated_at?: string;
          user_id: string;
          vault_view?: Database["public"]["Enums"]["vault_view_type"];
          weekly_recap_last_sent?: string | null;
        };
        Update: {
          accent_color?: string;
          adult_content?: Database["public"]["Enums"]["adult_content_type"];
          collection_view?: Database["public"]["Enums"]["collection_view_type"];
          country?: string;
          created_at?: string;
          default_sort?: Database["public"]["Enums"]["sort_mode_type"];
          density?: Database["public"]["Enums"]["density_type"];
          discover_view?: Database["public"]["Enums"]["discover_view_type"];
          id?: string;
          language_code?: string;
          prefs_json?: Json | null;
          preferred_content?: Database["public"]["Enums"]["preferred_content_type"];
          spoiler_level?: Database["public"]["Enums"]["spoiler_level_type"];
          theme?: Database["public"]["Enums"]["theme_type"];
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          vault_view?: Database["public"]["Enums"]["vault_view_type"];
          weekly_recap_last_sent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_fk";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_presets: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          filters: Json;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_presets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      universe_viewing_order_entries: {
        Row: {
          id: string;
          order_id: string;
          entry_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          entry_id: string;
          position: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          entry_id?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "universe_viewing_order_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "universe_viewing_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "universe_viewing_order_entries_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "curated_universe_entries";
            referencedColumns: ["id"];
          }
        ];
      };
      universe_viewing_orders: {
        Row: {
          id: string;
          universe_id: string;
          name: string;
          description: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          universe_id: string;
          name: string;
          description?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          universe_id?: string;
          name?: string;
          description?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "universe_viewing_orders_universe_id_fkey";
            columns: ["universe_id"];
            isOneToOne: false;
            referencedRelation: "curated_universes";
            referencedColumns: ["id"];
          }
        ];
      };
      user_universe_subscriptions: {
        Row: {
          created_at: string;
          custom_banner: string | null;
          custom_color: string | null;
          custom_cover: string | null;
          custom_sort: string | null;
          id: string;
          /** Phase 4 Task 2: TRUE when the user has hidden this universe (subscription retained, hidden from default lists). */
          is_hidden: boolean;
          is_pinned: boolean;
          universe_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          custom_banner?: string | null;
          custom_color?: string | null;
          custom_cover?: string | null;
          custom_sort?: string | null;
          id?: string;
          is_hidden?: boolean;
          is_pinned?: boolean;
          universe_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          custom_banner?: string | null;
          custom_color?: string | null;
          custom_cover?: string | null;
          custom_sort?: string | null;
          id?: string;
          is_hidden?: boolean;
          is_pinned?: boolean;
          universe_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_universe_subscriptions_universe_fk";
            columns: ["universe_id"];
            isOneToOne: false;
            referencedRelation: "curated_universes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_universe_subscriptions_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── AniList Integration (Phase 0) ─────────────────────────────
      // Maps TMDB ids to AniList ids so the app can enrich anime
      // titles with characters, voice actors, relations, airing
      // schedule, etc. Public read, service-role-only writes.
      anime_mappings: {
        Row: {
          id: string;
          tmdb_id: number;
          tmdb_type: "movie" | "tv";
          anilist_id: number;
          anilist_type: "ANIME" | "MANGA";
          title: string | null;
          match_confidence: "high" | "medium" | "low" | "manual";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tmdb_id: number;
          tmdb_type?: "movie" | "tv";
          anilist_id: number;
          anilist_type?: "ANIME" | "MANGA";
          title?: string | null;
          match_confidence?: "high" | "medium" | "low" | "manual";
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tmdb_id?: number;
          tmdb_type?: "movie" | "tv";
          anilist_id?: number;
          anilist_type?: "ANIME" | "MANGA";
          title?: string | null;
          match_confidence?: "high" | "medium" | "low" | "manual";
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // ─── App Config (admin Phase 1) ────────────────────────────────
      // Generic key/value table used for site-wide settings, feature
      // flags, homepage config, anime settings, etc.
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "app_config_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      vault: {
        Row: {
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_favorite: boolean;
          is_pinned: boolean;
          last_activity_at: string | null;
          media_type: Database["public"]["Enums"]["media_type"];
          notes: string | null;
          progress_minutes: number | null;
          rating: number | null;
          rewatch_count: number;
          rewatch_dates: string[] | null;
          season_dates: Json | null;
          season_rewatch_count: number;
          season_rewatch_dates: Json | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["vault_status_type"];
          tag: string | null;
          tmdb_id: number;
          updated_at: string;
          user_id: string;
          watched_on: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_favorite?: boolean;
          is_pinned?: boolean;
          last_activity_at?: string | null;
          media_type: Database["public"]["Enums"]["media_type"];
          notes?: string | null;
          progress_minutes?: number | null;
          rating?: number | null;
          rewatch_count?: number;
          rewatch_dates?: string[] | null;
          season_dates?: Json | null;
          season_rewatch_count?: number;
          season_rewatch_dates?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["vault_status_type"];
          tag?: string | null;
          tmdb_id: number;
          updated_at?: string;
          user_id: string;
          watched_on?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_favorite?: boolean;
          is_pinned?: boolean;
          last_activity_at?: string | null;
          media_type?: Database["public"]["Enums"]["media_type"];
          notes?: string | null;
          progress_minutes?: number | null;
          rating?: number | null;
          rewatch_count?: number;
          rewatch_dates?: string[] | null;
          season_dates?: Json | null;
          season_rewatch_count?: number;
          season_rewatch_dates?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["vault_status_type"];
          tag?: string | null;
          tmdb_id?: number;
          updated_at?: string;
          user_id?: string;
          watched_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vault_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: admin_actions audit log (admin Phase 1) ──────────────
      // Append-only audit log of admin operations. RLS allows admins
      // to SELECT and any authenticated user to INSERT (server-side
      // logging via service_role). No UPDATE or DELETE policy →
      // append-only is enforced at the database level.
      admin_actions: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: 2FA secrets (Phase 6 Part 3 — Task 4) ─────────────────
      // Per-admin TOTP secret for 2FA enrollment. Secret is AES-encrypted
      // server-side; only the encrypted ciphertext is stored here.
      admin_2fa_secrets: {
        Row: {
          admin_id: string;
          secret_cipher: string;
          enabled_at: string | null;
          backup_codes_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          admin_id: string;
          secret_cipher: string;
          enabled_at?: string | null;
          backup_codes_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          admin_id?: string;
          secret_cipher?: string;
          enabled_at?: string | null;
          backup_codes_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_2fa_secrets_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: announcements (admin Phase 2) ────────────────────────
      // Banner/toast/modal notices shown to all users.
      announcements: {
        Row: {
          id: string;
          type: Database["public"]["Enums"]["announcement_type"];
          severity: Database["public"]["Enums"]["announcement_severity"];
          title: string;
          body: string | null;
          cta_label: string | null;
          cta_href: string | null;
          is_dismissible: boolean;
          is_active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          target_audience: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          type?: Database["public"]["Enums"]["announcement_type"];
          severity?: Database["public"]["Enums"]["announcement_severity"];
          title: string;
          body?: string | null;
          cta_label?: string | null;
          cta_href?: string | null;
          is_dismissible?: boolean;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          target_audience?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          type?: Database["public"]["Enums"]["announcement_type"];
          severity?: Database["public"]["Enums"]["announcement_severity"];
          title?: string;
          body?: string | null;
          cta_label?: string | null;
          cta_href?: string | null;
          is_dismissible?: boolean;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          target_audience?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: announcement_dismissals (Phase 9 Chunk 4 —
      // Communication Hub) ─────────────────────────────────────────────
      // Bug #13 (Phase 13 Chunk 3): This table existed in the DB (see
      // supabase/migrations/20260811_add_announcement_dismissals.sql)
      // but its type was missing from database.types.ts, so the
      // generated Supabase client had no typed access to it. The
      // admin Communication Hub aggregates dismissals via a raw SQL
      // count, but any future typed client query would have failed
      // to compile.
      //
      // Schema:
      //   • announcement_id  — FK to announcements(id), CASCADE on delete
      //   • profile_id       — FK to profiles(id), SET NULL on delete,
      //                         NULL for anonymous guests
      //   • guest_hash       — sha256(IP + User-Agent) for guest dedup,
      //                         NULL for authenticated users
      //   • dismissed_at     — timestamptz, defaults to now()
      // A CHECK constraint enforces that exactly one of (profile_id,
      // guest_hash) is non-null — a dismissal is either by a known user
      // OR a guest, never both, never neither. The constraint is not
      // reflected in the type (it's a runtime DB enforcement), but
      // callers must respect it when constructing Insert payloads.
      announcement_dismissals: {
        Row: {
          id: string;
          announcement_id: string;
          profile_id: string | null;
          guest_hash: string | null;
          dismissed_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          profile_id?: string | null;
          guest_hash?: string | null;
          dismissed_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          profile_id?: string | null;
          guest_hash?: string | null;
          dismissed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcement_dismissals_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: featured_content (admin Phase 2) ─────────────────────
      // Admin-curated hero/spotlight/rail/pinned/editor_pick slots.
      featured_content: {
        Row: {
          id: string;
          slot: Database["public"]["Enums"]["featured_slot"];
          tmdb_id: number;
          media_type: Database["public"]["Enums"]["media_type"];
          title_override: string | null;
          note: string | null;
          tagline: string | null;
          position: number;
          is_active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          slot: Database["public"]["Enums"]["featured_slot"];
          tmdb_id: number;
          media_type: Database["public"]["Enums"]["media_type"];
          title_override?: string | null;
          note?: string | null;
          tagline?: string | null;
          position?: number;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          slot?: Database["public"]["Enums"]["featured_slot"];
          tmdb_id?: number;
          media_type?: Database["public"]["Enums"]["media_type"];
          title_override?: string | null;
          note?: string | null;
          tagline?: string | null;
          position?: number;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "featured_content_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Admin: maintenance_runs (admin Phase 3) ─────────────────────
      // Audit table for maintenance operations invoked from the admin UI.
      maintenance_runs: {
        Row: {
          id: string;
          admin_id: string | null;
          operation: string;
          status: string;
          rows_affected: number;
          details: Json;
          error: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          operation: string;
          status: string;
          rows_affected?: number;
          details?: Json;
          error?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          operation?: string;
          status?: string;
          rows_affected?: number;
          details?: Json;
          error?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_runs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Notifications (Upcoming Page redesign) ──────────────────────
      // In-app notification feed (reminders, watchlist_added, etc.).
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string | null;
          type: string;
          related_title_id: string | null;
          related_title_type: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          read_at: string | null;
          created_at: string;
          is_read: boolean;
          snoozed_until: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message?: string | null;
          type: string;
          related_title_id?: string | null;
          related_title_type?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          read_at?: string | null;
          created_at?: string;
          is_read?: boolean;
          snoozed_until?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string | null;
          type?: string;
          related_title_id?: string | null;
          related_title_type?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          read_at?: string | null;
          created_at?: string;
          is_read?: boolean;
          snoozed_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── User reminders (Upcoming Page redesign) ─────────────────────
      // Per-user "Remind Me" subscriptions for upcoming titles.
      user_reminders: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: string;
          title_type: string;
          title_name: string;
          poster_path: string | null;
          release_date: string;
          is_scheduled: boolean;
          notification_sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: string;
          title_type: string;
          title_name?: string;
          poster_path?: string | null;
          release_date: string;
          is_scheduled?: boolean;
          notification_sent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: string;
          title_type?: string;
          title_name?: string;
          poster_path?: string | null;
          release_date?: string;
          is_scheduled?: boolean;
          notification_sent?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_reminders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Push subscriptions (Phase 2 — Web Push) ─────────────────────
      // Per-user Web Push subscriptions (one row per browser/device).
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          keys?: Json;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ─── Rate limit buckets (Phase 1 — DB-backed rate limiting) ──────
      // Service-role-only table used by /api routes for persistent
      // rate limiting. RLS blocks anon/authenticated entirely;
      // service_role bypasses RLS.
      rate_limit_buckets: {
        Row: {
          bucket: string;
          key: string;
          count: number;
          window_start: string;
          locked_until: string | null;
          last_updated: string;
        };
        Insert: {
          bucket: string;
          key: string;
          count?: number;
          window_start?: string;
          locked_until?: string | null;
          last_updated?: string;
        };
        Update: {
          bucket?: string;
          key?: string;
          count?: number;
          window_start?: string;
          locked_until?: string | null;
          last_updated?: string;
        };
        Relationships: [];
      };
      // ─── Phase 12 Chunk 2 — OAuth tokens for third-party providers ──
      // Stores per-user OAuth access + refresh tokens for providers
      // like Trakt. RLS is owner-only — the browser NEVER sees the
      // token values; only the server (via the service-role client)
      // reads them when proxying API calls. UNIQUE (user_id, provider)
      // is enforced at the DB level so re-connecting upserts.
      user_integrations: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          access_token: string;
          refresh_token: string | null;
          provider_user_id: string | null;
          provider_email: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          access_token: string;
          refresh_token?: string | null;
          provider_user_id?: string | null;
          provider_email?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          access_token?: string;
          refresh_token?: string | null;
          provider_user_id?: string | null;
          provider_email?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_integrations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      // ── get_user_email (admin Phase 4) ──────────────────────────
      // SECURITY DEFINER function that returns the email for a single
      // user_id from auth.users. Callable by service_role (bypasses
      // the internal admin check) and authenticated (subject to the
      // internal admin check — returns NULL for non-admin callers).
      get_user_email: {
        Args: { user_id: string };
        Returns: string | null;
      };
      // ── Rate limit helpers (Phase 1) ────────────────────────────
      // Atomic increment-and-get for rate limit enforcement.
      // Returns JSONB { allowed, count, retry_after_ms }.
      bump_rate_limit: {
        Args: {
          p_bucket: string;
          p_key: string;
          p_window_ms: number;
          p_lockout_ms?: number;
          p_max?: number;
        };
        Returns: Json;
      };
      // Clears a rate limit row (called on successful auth, etc.).
      reset_rate_limit: {
        Args: { p_bucket: string; p_key: string };
        Returns: void;
      };
      // Returns true if the key is currently hard-locked.
      is_rate_limited: {
        Args: { p_bucket: string; p_key: string };
        Returns: boolean;
      };
    };
    Enums: {
      activity_action_type:
        | "vault_created"
        | "vault_updated"
        | "vault_deleted"
        | "vault_restored"
        | "vault_status_changed"
        | "vault_rated"
        | "vault_favorited"
        | "vault_unfavorited"
        | "collection_created"
        | "collection_updated"
        | "collection_deleted"
        | "episode_progress_updated"
        | "universe_subscribed"
        | "universe_unsubscribed"
        | "profile_updated"
        | "preferences_updated"
        | "import_started"
        | "import_completed"
        | "import_failed"
        | "export_started"
        | "export_completed"
        | "export_failed";
      adult_content_type: "hide" | "show";
      announcement_severity: "info" | "success" | "warning" | "error";
      announcement_type: "banner" | "toast" | "modal";
      collection_type: "user" | "curated" | "smart";
      collection_view_type: "grid" | "carousel" | "timeline" | "list";
      density_type: "comfortable" | "compact";
      discover_view_type: "grid" | "list";
      external_provider_type:
        "imdb" | "trakt" | "anilist" | "myanimelist" | "tvdb" | "tvmaze";
      featured_slot: "hero" | "spotlight" | "rail" | "pinned" | "editor_pick";
      import_export_format: "json" | "csv";
      import_export_job_type: "import" | "export";
      import_export_source:
        | "imdb"
        | "letterboxd"
        | "trakt"
        | "anilist"
        | "myanimelist"
        | "simkl"
        | "json"
        | "csv"
        | "cinelog_backup";
      import_export_status:
        "pending" | "processing" | "completed" | "failed" | "cancelled";
      media_type: "movie" | "tv";
      preferred_content_type: "movies" | "tv" | "anime" | "all";
      sort_mode_type:
        "manual" | "rating" | "year" | "title" | "date_added" | "last_updated";
      spoiler_level_type: "hide" | "warn" | "show";
      theme_type: "system" | "light" | "dark";
      universe_default_view_type:
        "timeline" | "release" | "story" | "franchise";
      vault_status_type:
        "planned" | "watching" | "completed" | "on_hold" | "dropped";
      vault_view_type: "carousel" | "grid" | "list";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_action_type: [
        "vault_created",
        "vault_updated",
        "vault_deleted",
        "vault_restored",
        "vault_status_changed",
        "vault_rated",
        "vault_favorited",
        "vault_unfavorited",
        "collection_created",
        "collection_updated",
        "collection_deleted",
        "episode_progress_updated",
        "universe_subscribed",
        "universe_unsubscribed",
        "profile_updated",
        "preferences_updated",
        "import_started",
        "import_completed",
        "import_failed",
        "export_started",
        "export_completed",
        "export_failed"
      ],
      adult_content_type: ["hide", "show"],
      announcement_severity: ["info", "success", "warning", "error"],
      announcement_type: ["banner", "toast", "modal"],
      collection_type: ["user", "curated", "smart"],
      collection_view_type: ["grid", "carousel", "timeline", "list"],
      density_type: ["comfortable", "compact"],
      discover_view_type: ["grid", "list"],
      external_provider_type: [
        "imdb",
        "trakt",
        "anilist",
        "myanimelist",
        "tvdb",
        "tvmaze"
      ],
      featured_slot: ["hero", "spotlight", "rail", "pinned", "editor_pick"],
      import_export_format: ["json", "csv"],
      import_export_job_type: ["import", "export"],
      import_export_source: [
        "imdb",
        "letterboxd",
        "trakt",
        "anilist",
        "myanimelist",
        "simkl",
        "json",
        "csv",
        "cinelog_backup"
      ],
      import_export_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled"
      ],
      media_type: ["movie", "tv"],
      preferred_content_type: ["movies", "tv", "anime", "all"],
      sort_mode_type: [
        "manual",
        "rating",
        "year",
        "title",
        "date_added",
        "last_updated"
      ],
      spoiler_level_type: ["hide", "warn", "show"],
      theme_type: ["system", "light", "dark"],
      universe_default_view_type: ["timeline", "release", "story", "franchise"],
      vault_status_type: [
        "planned",
        "watching",
        "completed",
        "on_hold",
        "dropped"
      ],
      vault_view_type: ["carousel", "grid", "list"]
    }
  }
} as const;
