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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      banned_words: {
        Row: {
          action: string
          created_at: string
          id: string
          is_global: boolean
          mapping_id: string | null
          word: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          is_global?: boolean
          mapping_id?: string | null
          word: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_global?: boolean
          mapping_id?: string | null
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "banned_words_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "channel_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalog_category_channels: {
        Row: {
          category_id: string
          channel_id: string
          created_at: string
          id: string
          sort_order: number
        }
        Insert: {
          category_id: string
          channel_id: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          channel_id?: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_category_channels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_category_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_mappings: {
        Row: {
          add_buttons: boolean
          add_signature: boolean
          auto_translate: boolean
          created_at: string
          default_buttons: Json | null
          filter_banned_words: boolean
          filter_buttons: boolean
          id: string
          is_active: boolean
          remove_links: boolean
          signature_text: string | null
          source_channel_id: string
          strip_text: boolean
          target_channel_id: string
          target_language: string
          updated_at: string
        }
        Insert: {
          add_buttons?: boolean
          add_signature?: boolean
          auto_translate?: boolean
          created_at?: string
          default_buttons?: Json | null
          filter_banned_words?: boolean
          filter_buttons?: boolean
          id?: string
          is_active?: boolean
          remove_links?: boolean
          signature_text?: string | null
          source_channel_id: string
          strip_text?: boolean
          target_channel_id: string
          target_language?: string
          updated_at?: string
        }
        Update: {
          add_buttons?: boolean
          add_signature?: boolean
          auto_translate?: boolean
          created_at?: string
          default_buttons?: Json | null
          filter_banned_words?: boolean
          filter_buttons?: boolean
          id?: string
          is_active?: boolean
          remove_links?: boolean
          signature_text?: string | null
          source_channel_id?: string
          strip_text?: boolean
          target_channel_id?: string
          target_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_mappings_source_channel_id_fkey"
            columns: ["source_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_mappings_target_channel_id_fkey"
            columns: ["target_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          handle: string
          id: string
          is_owned: boolean
          language: string
          name: string
          status: Database["public"]["Enums"]["channel_status"]
          telegram_chat_id: string | null
          type: Database["public"]["Enums"]["channel_type"]
          updated_at: string
          video_count: number
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          is_owned?: boolean
          language?: string
          name: string
          status?: Database["public"]["Enums"]["channel_status"]
          telegram_chat_id?: string | null
          type: Database["public"]["Enums"]["channel_type"]
          updated_at?: string
          video_count?: number
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          is_owned?: boolean
          language?: string
          name?: string
          status?: Database["public"]["Enums"]["channel_status"]
          telegram_chat_id?: string | null
          type?: Database["public"]["Enums"]["channel_type"]
          updated_at?: string
          video_count?: number
        }
        Relationships: []
      }
      post_templates: {
        Row: {
          caption: string
          channel_handles: Json
          created_at: string
          id: string
          inline_buttons: Json
          media_type: string | null
          media_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          caption?: string
          channel_handles?: Json
          created_at?: string
          id?: string
          inline_buttons?: Json
          media_type?: string | null
          media_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          caption?: string
          channel_handles?: Json
          created_at?: string
          id?: string
          inline_buttons?: Json
          media_type?: string | null
          media_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_schedules: {
        Row: {
          caption: string
          channel_handles: Json
          created_at: string
          days_of_week: number[]
          id: string
          inline_buttons: Json
          is_active: boolean
          last_run_at: string | null
          media_type: string | null
          media_url: string | null
          name: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          caption?: string
          channel_handles?: Json
          created_at?: string
          days_of_week?: number[]
          id?: string
          inline_buttons?: Json
          is_active?: boolean
          last_run_at?: string | null
          media_type?: string | null
          media_url?: string | null
          name: string
          time_of_day?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          channel_handles?: Json
          created_at?: string
          days_of_week?: number[]
          id?: string
          inline_buttons?: Json
          is_active?: boolean
          last_run_at?: string | null
          media_type?: string | null
          media_url?: string | null
          name?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          inline_buttons: Json
          media_type: string | null
          media_url: string | null
          published: boolean
          scheduled_for: string
          title: string
          video_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          inline_buttons?: Json
          media_type?: string | null
          media_url?: string | null
          published?: boolean
          scheduled_for: string
          title: string
          video_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          inline_buttons?: Json
          media_type?: string | null
          media_url?: string | null
          published?: boolean
          scheduled_for?: string
          title?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          duration: string | null
          error: string | null
          id: string
          links_added: number | null
          links_removed: number | null
          progress: number | null
          scheduled_for: string | null
          source_channel_id: string | null
          status: Database["public"]["Enums"]["video_status"]
          target_channel_id: string | null
          title: string
          translated_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration?: string | null
          error?: string | null
          id?: string
          links_added?: number | null
          links_removed?: number | null
          progress?: number | null
          scheduled_for?: string | null
          source_channel_id?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          target_channel_id?: string | null
          title: string
          translated_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration?: string | null
          error?: string | null
          id?: string
          links_added?: number | null
          links_removed?: number | null
          progress?: number | null
          scheduled_for?: string | null
          source_channel_id?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          target_channel_id?: string | null
          title?: string
          translated_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_source_channel_id_fkey"
            columns: ["source_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_target_channel_id_fkey"
            columns: ["target_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      channel_status: "active" | "paused" | "error"
      channel_type: "source" | "target"
      video_status:
        | "queued"
        | "downloading"
        | "translating"
        | "editing"
        | "scheduled"
        | "publishing"
        | "completed"
        | "failed"
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
      channel_status: ["active", "paused", "error"],
      channel_type: ["source", "target"],
      video_status: [
        "queued",
        "downloading",
        "translating",
        "editing",
        "scheduled",
        "publishing",
        "completed",
        "failed",
      ],
    },
  },
} as const
