import { DS } from "@/lib/design/tokens";
import type {
  EffectiveStatus,
  InspectionFrequency,
  ItemPriority,
} from "@/lib/types/domain";

// Display colour maps. Values stored in the DB stay in English; these
// only paint the badges.
export const PRIORITY_COLOR: Record<ItemPriority, string> = {
  Critical: DS.red,
  High: DS.ora,
  Medium: DS.yel,
  Low: DS.grn,
};

export const STATUS_COLOR: Record<EffectiveStatus, string> = {
  OK: DS.grn,
  Attention: DS.ora,
  Critical: DS.red,
  Pending: DS.text3,
  Overdue: DS.red,
};

// Enum value lists used to drive dropdowns. The human-readable labels for
// each value come from lib/i18n/dict.ts (mech.*, prot.*, freq.*,
// statusOpt.*) so they translate with the EN/PT toggle.
export const MECHANISMS: string[] = [
  "Atmospheric Corrosion",
  "CO2 Corrosion (Sweet)",
  "Corrosion Fatigue",
  "Crevice Corrosion",
  "Erosion-Corrosion",
  "Galvanic Corrosion",
  "H2S Corrosion (Sour Service)",
  "MIC (Microbiologically Influenced)",
  "Pitting Corrosion",
  "Uniform Corrosion",
];

export const PROTECTIONS: string[] = [
  "Epoxy Coating (C5-M)",
  "Internal Epoxy Coating (PSPC)",
  "Splash Zone Compound",
  "Sacrificial Anodes Al-Zn-In",
  "ICCP (Impressed Current)",
  "Anodes + Coating",
  "Resistant Material (Duplex/316L)",
  "NACE MR0175/ISO 15156",
  "Corrosion Inhibitor",
  "Special Greases / Lubricants",
  "No Specific Protection",
  "Other",
];

export const STATUSES = ["OK", "Attention", "Critical", "Pending"] as const;

// Where an inspection observation comes from. Values stored in DB; dict
// has obsSrc.* keys for the EN/PT display labels.
export const OBS_SOURCES = [
  "Routine Inspection",
  "Eventual Inspection",
  "3C Card",
  "Petrobras Pending",
  "Other",
] as const;

export const FREQUENCIES: InspectionFrequency[] = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "Semi-annual",
  "Annual",
  "Every 2 years",
  "Every 2.5 years",
  "Every 5 years",
  "Per operation",
  "As required",
];

export const SYSTEMS = [
  "All",
  "Drilling",
  "Maintenance",
  "Marine",
  "Safety",
  "Third Party",
] as const;

export type SystemFilter = (typeof SYSTEMS)[number];
