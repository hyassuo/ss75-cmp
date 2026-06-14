export type UserRole = "admin" | "inspector" | "viewer";

export type ItemPriority = "Critical" | "High" | "Medium" | "Low";

export type ItemStatus = "OK" | "Attention" | "Critical" | "Pending";

// 'Overdue' is computed for display only — never stored.
export type EffectiveStatus = ItemStatus | "Overdue";

export type InspectionFrequency =
  | "Weekly"
  | "Monthly"
  | "Quarterly"
  | "Semi-annual"
  | "Annual"
  | "Every 2 years"
  | "Every 2.5 years"
  | "Every 5 years"
  | "Per operation"
  | "As required";

export interface Unit {
  id: string;
  code: string;
  name: string;
  type: string | null;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  dept: string | null;
  unit_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  zid: string;
  name: string;
  description: string | null;
  system: string;
  default_freq: InspectionFrequency | null;
  drops_zone: boolean;
  display_order: number | null;
}

export interface Reading {
  id: string;
  item_id: string;
  reading_date: string;
  depth_mm: number;
  location: string | null;
  checked_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AIAnalysis {
  corrosionType: string;
  severity: "Low" | "Moderate" | "High" | "Critical";
  affectedAreaPct: number;
  pitDepthEstMM: number;
  immediateAction: string;
  findings: string;
  recommendation: string;
}

export interface Evidence {
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
}

export interface HistoryEntry {
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
}

export interface Item {
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
}

// Item joined with its child collections (used by the UI).
export interface ItemWithRelations extends Item {
  readings: Reading[];
  evidences: Evidence[];
}

// IFS Equipment Register object (from the AI search proxy).
export interface IfsObject {
  id: string;
  desc: string;
  sece: boolean;
}
