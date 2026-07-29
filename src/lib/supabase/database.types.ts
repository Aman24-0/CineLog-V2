export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action_type"]
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action_type"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action_type"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_entries: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          order_index: number
          position: number
          vault_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          order_index?: number
          position?: number
          vault_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          order_index?: number
          position?: number
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_collection_fk"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_vault_fk"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          archived_at: string | null
          banner_url: string | null
          collection_type: Database["public"]["Enums"]["collection_type"]
          color: string | null
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          sort_mode: Database["public"]["Enums"]["sort_mode_type"]
          updated_at: string
          user_id: string | null
          view_mode: Database["public"]["Enums"]["collection_view_type"]
        }
        Insert: {
          archived_at?: string | null
          banner_url?: string | null
          collection_type: Database["public"]["Enums"]["collection_type"]
          color?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_mode?: Database["public"]["Enums"]["sort_mode_type"]
          updated_at?: string
          user_id?: string | null
          view_mode?: Database["public"]["Enums"]["collection_view_type"]
        }
        Update: {
          archived_at?: string | null
          banner_url?: string | null
          collection_type?: Database["public"]["Enums"]["collection_type"]
          color?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_mode?: Database["public"]["Enums"]["sort_mode_type"]
          updated_at?: string
          user_id?: string | null
          view_mode?: Database["public"]["Enums"]["collection_view_type"]
        }
        Relationships: [
          {
            foreignKeyName: "collections_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_universe_entries: {
        Row: {
          created_at: string
          id: string
          incident_year: number | null
          media_type: Database["public"]["Enums"]["media_type"]
          note: string | null
          position: number
          release_position: number
          story_position: number
          timeline_position: number
          tmdb_id: number
          universe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_year?: number | null
          media_type: Database["public"]["Enums"]["media_type"]
          note?: string | null
          position?: number
          release_position?: number
          story_position?: number
          timeline_position?: number
          tmdb_id: number
          universe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_year?: number | null
          media_type?: Database["public"]["Enums"]["media_type"]
          note?: string | null
          position?: number
          release_position?: number
          story_position?: number
          timeline_position?: number
          tmdb_id?: number
          universe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curated_universe_entries_universe_fk"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "curated_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_universes: {
        Row: {
          banner_url: string | null
          color: string | null
          cover_url: string | null
          created_at: string
          default_view: Database["public"]["Enums"]["universe_default_view_type"]
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          default_view?: Database["public"]["Enums"]["universe_default_view_type"]
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          default_view?: Database["public"]["Enums"]["universe_default_view_type"]
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      universe_phases: {
        Row: {
          id: string
          universe_id: string
          label: string
          description: string | null
          before_entry_id: string | null
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          universe_id: string
          label: string
          description?: string | null
          before_entry_id?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          universe_id?: string
          label?: string
          description?: string | null
          before_entry_id?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      episode_progress: {
        Row: {
          created_at: string
          episode_number: number
          id: string
          is_completed: boolean
          progress_minutes: number
          season_number: number
          updated_at: string
          vault_id: string
          watched_at: string | null
        }
        Insert: {
          created_at?: string
          episode_number: number
          id?: string
          is_completed?: boolean
          progress_minutes?: number
          season_number: number
          updated_at?: string
          vault_id: string
          watched_at?: string | null
        }
        Update: {
          created_at?: string
          episode_number?: number
          id?: string
          is_completed?: boolean
          progress_minutes?: number
          season_number?: number
          updated_at?: string
          vault_id?: string
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_progress_vault_fk"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      external_ids: {
        Row: {
          created_at: string
          external_id: string
          id: string
          provider: Database["public"]["Enums"]["external_provider_type"]
          updated_at: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          provider: Database["public"]["Enums"]["external_provider_type"]
          updated_at?: string
          vault_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          provider?: Database["public"]["Enums"]["external_provider_type"]
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_ids_vault_fk"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      import_export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_records: number
          file_size_bytes: number | null
          file_url: string | null
          format: Database["public"]["Enums"]["import_export_format"]
          id: string
          job_type: Database["public"]["Enums"]["import_export_job_type"]
          processed_records: number
          source: Database["public"]["Enums"]["import_export_source"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["import_export_status"]
          total_records: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_records?: number
          file_size_bytes?: number | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["import_export_format"]
          id?: string
          job_type: Database["public"]["Enums"]["import_export_job_type"]
          processed_records?: number
          source?: Database["public"]["Enums"]["import_export_source"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_export_status"]
          total_records?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_records?: number
          file_size_bytes?: number | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["import_export_format"]
          id?: string
          job_type?: Database["public"]["Enums"]["import_export_job_type"]
          processed_records?: number
          source?: Database["public"]["Enums"]["import_export_source"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_export_status"]
          total_records?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_jobs_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_override_path: string | null
          banner_type: string
          banner_url: string | null
          bio: string | null
          country: string
          created_at: string
          deleted_at: string | null
          display_name: string
          display_name_initialized: boolean
          favorite_director_id: string | null
          favorite_genre: string | null
          favorite_movie_id: string | null
          favorite_series_id: string | null
          id: string
          is_public: boolean
          language_code: string
          scheduled_deletion_at: string | null
          social_links: Json
          timezone: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          banner_override_path?: string | null
          banner_type?: string
          banner_url?: string | null
          bio?: string | null
          country: string
          created_at?: string
          deleted_at?: string | null
          display_name: string
          display_name_initialized?: boolean
          favorite_director_id?: string | null
          favorite_genre?: string | null
          favorite_movie_id?: string | null
          favorite_series_id?: string | null
          id: string
          is_public?: boolean
          language_code?: string
          scheduled_deletion_at?: string | null
          social_links?: Json
          timezone?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          banner_override_path?: string | null
          banner_type?: string
          banner_url?: string | null
          bio?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          display_name_initialized?: boolean
          favorite_director_id?: string | null
          favorite_genre?: string | null
          favorite_movie_id?: string | null
          favorite_series_id?: string | null
          id?: string
          is_public?: boolean
          language_code?: string
          scheduled_deletion_at?: string | null
          social_links?: Json
          timezone?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          id: string
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          id?: string
          follower_id: string
          following_id: string
          created_at?: string
        }
        Update: {
          id?: string
          follower_id?: string
          following_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tmdb_cache: {
        Row: {
          created_at: string
          data: Json
          expires_at: string
          fetched_at: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          tmdb_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          expires_at: string
          fetched_at?: string
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          tmdb_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          expires_at?: string
          fetched_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          tmdb_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          accent_color: string
          adult_content: Database["public"]["Enums"]["adult_content_type"]
          collection_view: Database["public"]["Enums"]["collection_view_type"]
          country: string
          created_at: string
          default_sort: Database["public"]["Enums"]["sort_mode_type"]
          density: Database["public"]["Enums"]["density_type"]
          discover_view: Database["public"]["Enums"]["discover_view_type"]
          id: string
          language_code: string
          preferred_content: Database["public"]["Enums"]["preferred_content_type"]
          spoiler_level: Database["public"]["Enums"]["spoiler_level_type"]
          theme: Database["public"]["Enums"]["theme_type"]
          timezone: string
          updated_at: string
          user_id: string
          vault_view: Database["public"]["Enums"]["vault_view_type"]
        }
        Insert: {
          accent_color?: string
          adult_content?: Database["public"]["Enums"]["adult_content_type"]
          collection_view?: Database["public"]["Enums"]["collection_view_type"]
          country?: string
          created_at?: string
          default_sort?: Database["public"]["Enums"]["sort_mode_type"]
          density?: Database["public"]["Enums"]["density_type"]
          discover_view?: Database["public"]["Enums"]["discover_view_type"]
          id?: string
          language_code?: string
          preferred_content?: Database["public"]["Enums"]["preferred_content_type"]
          spoiler_level?: Database["public"]["Enums"]["spoiler_level_type"]
          theme?: Database["public"]["Enums"]["theme_type"]
          timezone?: string
          updated_at?: string
          user_id: string
          vault_view?: Database["public"]["Enums"]["vault_view_type"]
        }
        Update: {
          accent_color?: string
          adult_content?: Database["public"]["Enums"]["adult_content_type"]
          collection_view?: Database["public"]["Enums"]["collection_view_type"]
          country?: string
          created_at?: string
          default_sort?: Database["public"]["Enums"]["sort_mode_type"]
          density?: Database["public"]["Enums"]["density_type"]
          discover_view?: Database["public"]["Enums"]["discover_view_type"]
          id?: string
          language_code?: string
          preferred_content?: Database["public"]["Enums"]["preferred_content_type"]
          spoiler_level?: Database["public"]["Enums"]["spoiler_level_type"]
          theme?: Database["public"]["Enums"]["theme_type"]
          timezone?: string
          updated_at?: string
          user_id?: string
          vault_view?: Database["public"]["Enums"]["vault_view_type"]
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_universe_subscriptions: {
        Row: {
          created_at: string
          custom_banner: string | null
          custom_color: string | null
          custom_cover: string | null
          custom_sort: string | null
          id: string
          is_pinned: boolean
          universe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_banner?: string | null
          custom_color?: string | null
          custom_cover?: string | null
          custom_sort?: string | null
          id?: string
          is_pinned?: boolean
          universe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_banner?: string | null
          custom_color?: string | null
          custom_cover?: string | null
          custom_sort?: string | null
          id?: string
          is_pinned?: boolean
          universe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_universe_subscriptions_universe_fk"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "curated_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_universe_subscriptions_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_favorite: boolean
          is_pinned: boolean
          last_activity_at: string | null
          media_type: Database["public"]["Enums"]["media_type"]
          notes: string | null
          progress_minutes: number | null
          rating: number | null
          rewatch_count: number
          rewatch_dates: string[] | null
          season_dates: Json | null
          season_rewatch_count: number
          season_rewatch_dates: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["vault_status_type"]
          tmdb_id: number
          updated_at: string
          user_id: string
          watched_on: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favorite?: boolean
          is_pinned?: boolean
          last_activity_at?: string | null
          media_type: Database["public"]["Enums"]["media_type"]
          notes?: string | null
          progress_minutes?: number | null
          rating?: number | null
          rewatch_count?: number
          rewatch_dates?: string[] | null
          season_dates?: Json | null
          season_rewatch_count?: number
          season_rewatch_dates?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["vault_status_type"]
          tmdb_id: number
          updated_at?: string
          user_id: string
          watched_on?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favorite?: boolean
          is_pinned?: boolean
          last_activity_at?: string | null
          media_type?: Database["public"]["Enums"]["media_type"]
          notes?: string | null
          progress_minutes?: number | null
          rating?: number | null
          rewatch_count?: number
          rewatch_dates?: string[] | null
          season_dates?: Json | null
          season_rewatch_count?: number
          season_rewatch_dates?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["vault_status_type"]
          tmdb_id?: number
          updated_at?: string
          user_id?: string
          watched_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
    }
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
        | "export_failed"
      adult_content_type: "hide" | "show"
      collection_type: "user" | "curated" | "smart"
      collection_view_type: "grid" | "carousel" | "timeline" | "list"
      density_type: "comfortable" | "compact"
      discover_view_type: "grid" | "list"
      external_provider_type:
        | "imdb"
        | "trakt"
        | "anilist"
        | "myanimelist"
        | "tvdb"
        | "tvmaze"
      import_export_format: "json" | "csv"
      import_export_job_type: "import" | "export"
      import_export_source:
        | "imdb"
        | "letterboxd"
        | "trakt"
        | "anilist"
        | "myanimelist"
        | "simkl"
        | "json"
        | "csv"
        | "cinelog_backup"
      import_export_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      media_type: "movie" | "tv"
      preferred_content_type: "movies" | "tv" | "anime" | "all"
      sort_mode_type:
        | "manual"
        | "rating"
        | "year"
        | "title"
        | "date_added"
        | "last_updated"
      spoiler_level_type: "hide" | "warn" | "show"
      theme_type: "system" | "light" | "dark"
      universe_default_view_type: "timeline" | "release" | "story" | "franchise"
      vault_status_type:
        | "planned"
        | "watching"
        | "completed"
        | "on_hold"
        | "dropped"
      vault_view_type: "carousel" | "grid" | "list"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

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
        "export_failed",
      ],
      adult_content_type: ["hide", "show"],
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
        "tvmaze",
      ],
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
        "cinelog_backup",
      ],
      import_export_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      media_type: ["movie", "tv"],
      preferred_content_type: ["movies", "tv", "anime", "all"],
      sort_mode_type: [
        "manual",
        "rating",
        "year",
        "title",
        "date_added",
        "last_updated",
      ],
      spoiler_level_type: ["hide", "warn", "show"],
      theme_type: ["system", "light", "dark"],
      universe_default_view_type: ["timeline", "release", "story", "franchise"],
      vault_status_type: [
        "planned",
        "watching",
        "completed",
        "on_hold",
        "dropped",
      ],
      vault_view_type: ["carousel", "grid", "list"],
    },
  },
} as const
