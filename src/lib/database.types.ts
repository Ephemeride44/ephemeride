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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      city_subscriptions: {
        Row: {
          city: string
          created_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_recurrences: {
        Row: {
          created_at: string
          end_date: string
          frequency: string
          id: string
          interval: number
          start_date: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          end_date: string
          frequency?: string
          id?: string
          interval?: number
          start_date: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          end_date?: string
          frequency?: string
          id?: string
          interval?: number
          start_date?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      events: {
        Row: {
          audience: string | null
          cover_url: string | null
          created_by: string | null
          createdby: Json | null
          emoji: string | null
          end_at: string | null
          id: string
          is_cancelled: boolean
          is_full: boolean
          location_city: string | null
          location_department: string | null
          location_place: string | null
          name: string
          organization_id: string | null
          price: string | null
          recurrence_id: string | null
          start_at: string | null
          status: string
          theme_id: string | null
          ticketing_url: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          audience?: string | null
          cover_url?: string | null
          created_by?: string | null
          createdby?: Json | null
          emoji?: string | null
          end_at?: string | null
          id?: string
          is_cancelled?: boolean
          is_full?: boolean
          location_city?: string | null
          location_department?: string | null
          location_place?: string | null
          name: string
          organization_id?: string | null
          price?: string | null
          recurrence_id?: string | null
          start_at?: string | null
          status?: string
          theme_id?: string | null
          ticketing_url?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          audience?: string | null
          cover_url?: string | null
          created_by?: string | null
          createdby?: Json | null
          emoji?: string | null
          end_at?: string | null
          id?: string
          is_cancelled?: boolean
          is_full?: boolean
          location_city?: string | null
          location_department?: string | null
          location_place?: string | null
          name?: string
          organization_id?: string | null
          price?: string | null
          recurrence_id?: string | null
          start_at?: string | null
          status?: string
          theme_id?: string | null
          ticketing_url?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "event_recurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          notify_bookmarks: boolean
          notify_cities: boolean
          notify_organizations: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          notify_bookmarks?: boolean
          notify_cities?: boolean
          notify_organizations?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          notify_bookmarks?: boolean
          notify_cities?: boolean
          notify_organizations?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          event_id: string | null
          icon: string | null
          id: string
          organization_id: string | null
          read_at: string | null
          target_city: string | null
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event_id?: string | null
          icon?: string | null
          id?: string
          organization_id?: string | null
          read_at?: string | null
          target_city?: string | null
          title: string
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string | null
          icon?: string | null
          id?: string
          organization_id?: string | null
          read_at?: string | null
          target_city?: string | null
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          is_used: boolean | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          is_used?: boolean | null
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          is_used?: boolean | null
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location_city: string | null
          location_department: string | null
          logo_url: string | null
          name: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_city?: string | null
          location_department?: string | null
          logo_url?: string | null
          name: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_city?: string | null
          location_department?: string | null
          logo_url?: string | null
          name?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
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
      super_admins: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          image_url_light: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_url_light?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_url_light?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      user_organizations: {
        Row: {
          joined_at: string | null
          organization_active: boolean | null
          organization_id: string | null
          organization_name: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_active: boolean | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_organization_invitation: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: Json
      }
      count_event_bookmarks: { Args: { p_event_id: string }; Returns: number }
      count_organization_subscribers: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_all_organizations: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
          role: string
        }[]
      }
      get_organization_users_with_emails: {
        Args: { org_id: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_email: string
          user_id: string
          user_raw_user_meta_data: Json
        }[]
      }
      get_event_creators: {
        Args: { p_event_ids: string[] }
        Returns: {
          email: string | null
          event_id: string
          full_name: string | null
          user_id: string
        }[]
      }
      get_super_admins_with_user_info: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          user_email: string
          user_id: string
          user_raw_user_meta_data: Json
        }[]
      }
      get_user_organizations: {
        Args: { user_uuid: string }
        Returns: {
          is_active: boolean
          organization_id: string
          organization_name: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      invite_user_to_organization: {
        Args: {
          p_email: string
          p_organization_id: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: Json
      }
      is_organization_admin: {
        Args: { org_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_super_admin: { Args: { user_uuid: string }; Returns: boolean }
    }
    Enums: {
      user_role: "organization_admin" | "organization_member"
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
      user_role: ["organization_admin", "organization_member"],
    },
  },
} as const
