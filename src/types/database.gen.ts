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
      children: {
        Row: {
          age: number
          created_at: string | null
          id: string
          name: string
          parent_id: string | null
          primary_sport: string | null
        }
        Insert: {
          age: number
          created_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          primary_sport?: string | null
        }
        Update: {
          age?: number
          created_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          primary_sport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          age_max: number | null
          age_min: number | null
          ai_age_range: string | null
          ai_brand: string | null
          ai_condition_grade: string | null
          ai_confidence: number | null
          ai_identified_item: string | null
          ai_size: string | null
          ai_suggested_price: number | null
          category: string
          city: string | null
          condition: string | null
          created_at: string | null
          description: string | null
          id: string
          photo_urls: string[] | null
          price: number
          retail_price: number | null
          seller_id: string | null
          sport: string
          status: string | null
          title: string
          views: number | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          ai_age_range?: string | null
          ai_brand?: string | null
          ai_condition_grade?: string | null
          ai_confidence?: number | null
          ai_identified_item?: string | null
          ai_size?: string | null
          ai_suggested_price?: number | null
          category: string
          city?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          photo_urls?: string[] | null
          price: number
          retail_price?: number | null
          seller_id?: string | null
          sport: string
          status?: string | null
          title: string
          views?: number | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          ai_age_range?: string | null
          ai_brand?: string | null
          ai_condition_grade?: string | null
          ai_confidence?: number | null
          ai_identified_item?: string | null
          ai_size?: string | null
          ai_suggested_price?: number | null
          category?: string
          city?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          photo_urls?: string[] | null
          price?: number
          retail_price?: number | null
          seller_id?: string | null
          sport?: string
          status?: string | null
          title?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meetups: {
        Row: {
          auto_completed: boolean | null
          buyer_completed_at: string | null
          buyer_confirmed_at: string | null
          buyer_id: string | null
          completed_at: string | null
          created_at: string | null
          deposit_amount: number
          deposit_payment_intent_id: string | null
          final_payment_intent_id: string | null
          id: string
          listing_id: string | null
          meetup_location: string | null
          meetup_time: string | null
          meetup_window_end: string | null
          meetup_window_start: string | null
          offer_type: string | null
          offered_price: number | null
          seller_completed_at: string | null
          seller_confirmed_at: string | null
          seller_id: string | null
          status: string | null
        }
        Insert: {
          auto_completed?: boolean | null
          buyer_completed_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deposit_amount: number
          deposit_payment_intent_id?: string | null
          final_payment_intent_id?: string | null
          id?: string
          listing_id?: string | null
          meetup_location?: string | null
          meetup_time?: string | null
          meetup_window_end?: string | null
          meetup_window_start?: string | null
          offer_type?: string | null
          offered_price?: number | null
          seller_completed_at?: string | null
          seller_confirmed_at?: string | null
          seller_id?: string | null
          status?: string | null
        }
        Update: {
          auto_completed?: boolean | null
          buyer_completed_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deposit_amount?: number
          deposit_payment_intent_id?: string | null
          final_payment_intent_id?: string | null
          id?: string
          listing_id?: string | null
          meetup_location?: string | null
          meetup_time?: string | null
          meetup_window_end?: string | null
          meetup_window_start?: string | null
          offer_type?: string | null
          offered_price?: number | null
          seller_completed_at?: string | null
          seller_confirmed_at?: string | null
          seller_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetups_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          listing_id: string | null
          read: boolean | null
          receiver_id: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          read?: boolean | null
          receiver_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          read?: boolean | null
          receiver_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          listing_id: string | null
          rating: number | null
          reviewee_id: string | null
          reviewer_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          rating?: number | null
          reviewee_id?: string | null
          reviewer_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          rating?: number | null
          reviewee_id?: string | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listings: {
        Row: {
          created_at: string | null
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      strikes: {
        Row: {
          created_at: string | null
          id: string
          meetup_id: string | null
          reason: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meetup_id?: string | null
          reason: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meetup_id?: string | null
          reason?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strikes_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          auto_completed: boolean | null
          buyer_id: string | null
          created_at: string | null
          gross_amount: number
          id: string
          listing_id: string | null
          meetup_id: string | null
          net_amount: number
          platform_fee: number
          retail_price: number | null
          seller_id: string | null
        }
        Insert: {
          auto_completed?: boolean | null
          buyer_id?: string | null
          created_at?: string | null
          gross_amount: number
          id?: string
          listing_id?: string | null
          meetup_id?: string | null
          net_amount: number
          platform_fee: number
          retail_price?: number | null
          seller_id?: string | null
        }
        Update: {
          auto_completed?: boolean | null
          buyer_id?: string | null
          created_at?: string | null
          gross_amount?: number
          id?: string
          listing_id?: string | null
          meetup_id?: string | null
          net_amount?: number
          platform_fee?: number
          retail_price?: number | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string | null
          avatar_url: string | null
          avg_rating: number | null
          blackout_until: string | null
          city: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          review_count: number | null
          role: string | null
          strike_status: string | null
          strikes: number | null
          zipcode: string | null
        }
        Insert: {
          account_status?: string | null
          avatar_url?: string | null
          avg_rating?: number | null
          blackout_until?: string | null
          city?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          review_count?: number | null
          role?: string | null
          strike_status?: string | null
          strikes?: number | null
          zipcode?: string | null
        }
        Update: {
          account_status?: string | null
          avatar_url?: string | null
          avg_rating?: number | null
          blackout_until?: string | null
          city?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          review_count?: number | null
          role?: string | null
          strike_status?: string | null
          strikes?: number | null
          zipcode?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
