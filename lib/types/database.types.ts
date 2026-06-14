// Hand-authored from supabase-setup.sql. Mirrors the provisioned schema.
import type {
  AIAnalysis,
  InspectionFrequency,
  ItemPriority,
  ItemStatus,
  UserRole,
} from "./domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      units: {
        Row: {
          id: string;
          code: string;
          name: string;
          type: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          type?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["units"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          dept: string | null;
          unit_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: UserRole;
          dept?: string | null;
          unit_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      zones: {
        Row: {
          zid: string;
          name: string;
          description: string | null;
          system: string;
          default_freq: InspectionFrequency | null;
          drops_zone: boolean;
          display_order: number | null;
        };
        Insert: {
          zid: string;
          name: string;
          description?: string | null;
          system: string;
          default_freq?: InspectionFrequency | null;
          drops_zone?: boolean;
          display_order?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["zones"]["Insert"]>;
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          unit_id: string;
          zone_id: string;
          name: string;
          mechanism: string | null;
          protection: string | null;
          ifs_obj_id: string | null;
          ifs_obj_desc: string | null;
          ifs_wo: string | null;
          ifs_fl: string | null;
          prob: number | null;
          cons: number | null;
          priority: ItemPriority | null;
          status: ItemStatus;
          sece: boolean;
          drops_risk: boolean;
          structural: boolean;
          obs_source: string | null;
          freq_insp: InspectionFrequency | null;
          last_insp: string | null;
          next_insp: string | null;
          resolved_at: string | null;
          archived: boolean;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          zone_id: string;
          name: string;
          mechanism?: string | null;
          protection?: string | null;
          ifs_obj_id?: string | null;
          ifs_obj_desc?: string | null;
          ifs_wo?: string | null;
          ifs_fl?: string | null;
          prob?: number | null;
          cons?: number | null;
          priority?: ItemPriority | null;
          status?: ItemStatus;
          sece?: boolean;
          drops_risk?: boolean;
          structural?: boolean;
          obs_source?: string | null;
          freq_insp?: InspectionFrequency | null;
          last_insp?: string | null;
          next_insp?: string | null;
          resolved_at?: string | null;
          archived?: boolean;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["items"]["Insert"]>;
        Relationships: [];
      };
      readings: {
        Row: {
          id: string;
          item_id: string;
          reading_date: string;
          depth_mm: number;
          location: string | null;
          checked_by: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          reading_date: string;
          depth_mm: number;
          location?: string | null;
          checked_by?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["readings"]["Insert"]>;
        Relationships: [];
      };
      evidences: {
        Row: {
          id: string;
          item_id: string;
          evidence_date: string;
          description: string | null;
          file_url: string | null;
          file_path: string | null;
          file_name: string | null;
          file_type: string | null;
          file_size: number | null;
          ai_analysis: AIAnalysis | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          evidence_date: string;
          description?: string | null;
          file_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          ai_analysis?: AIAnalysis | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["evidences"]["Insert"]>;
        Relationships: [];
      };
      history: {
        Row: {
          id: string;
          item_id: string;
          event_date: string;
          action: string;
          field_changed: string | null;
          prev_value: string | null;
          new_value: string | null;
          note: string | null;
          by_user: string | null;
          by_user_email: string | null;
        };
        Insert: {
          id?: string;
          item_id: string;
          event_date?: string;
          action: string;
          field_changed?: string | null;
          prev_value?: string | null;
          new_value?: string | null;
          note?: string | null;
          by_user?: string | null;
          by_user_email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["history"]["Insert"]>;
        Relationships: [];
      };
      ifs_objects: {
        Row: {
          id: string;
          description: string;
          sece: boolean;
        };
        Insert: {
          id: string;
          description: string;
          sece?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["ifs_objects"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: UserRole;
      };
      current_user_unit: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      item_priority: ItemPriority;
      item_status: ItemStatus;
      inspection_frequency: InspectionFrequency;
    };
    CompositeTypes: Record<string, never>;
  };
}
