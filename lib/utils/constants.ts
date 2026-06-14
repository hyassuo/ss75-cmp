import { DS } from "@/lib/design/tokens";
import type {
  EffectiveStatus,
  InspectionFrequency,
  ItemPriority,
} from "@/lib/types/domain";

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

export const INSPECTION_METHODS: string[] = [
  "Visual Inspection (VT)",
  "Ultrasonic Testing (UT)",
  "ACFM",
  "Magnetic Particle (MT)",
  "Liquid Penetrant (PT)",
  "ROV Survey",
  "Fluid Analysis",
  "Corrosion Coupon",
  "Cathodic Potential",
  "Other",
];

// Per the SS-75 Risk Matrix (MSC_2123.0_A) — probability of an event of this
// severity occurring at the facility / company / industry level.
export const PROB_LABELS = [
  "Never occurred in the Industry",
  "Has occurred in the Industry",
  "Has occurred in the Company",
  "Multiple occurrences per year in the Company",
  "Multiple occurrences per year at the Facility",
];

export const CONS_LABELS = [
  "Insignificant",
  "Minor",
  "Moderate",
  "Serious",
  "Critical",
];

export const PRIORITIES: ItemPriority[] = ["Critical", "High", "Medium", "Low"];

export const STATUSES = ["OK", "Attention", "Critical", "Pending"] as const;

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

export const FREQUENCY_LABELS: Record<InspectionFrequency, string> = {
  Weekly: "Weekly",
  Monthly: "Monthly",
  Quarterly: "Quarterly (every 3 months)",
  "Semi-annual": "Semi-annual (every 6 months)",
  Annual: "Annual (once a year)",
  "Every 2 years": "Every 2 years",
  "Every 2.5 years": "Every 2.5 years (SPS / Dry Dock)",
  "Every 5 years": "Every 5 years (Special Survey)",
  "Per operation": "Per operation (pre/post use)",
  "As required": "As required / Condition-based",
};

export const SYSTEMS = [
  "All",
  "Drilling",
  "Maintenance",
  "Marine",
  "Safety",
  "Third Party",
] as const;

export type SystemFilter = (typeof SYSTEMS)[number];
