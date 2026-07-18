import type { ItemWithRelations, Reading } from "@/lib/types/domain";

// A complete, healthy item: OK status, inspected, scheduled far in the
// future. Tests override only what they exercise. Dates far in the past
// ("2000-…") or future ("2999-…") keep assertions timezone-independent.
export function makeItem(
  overrides: Partial<ItemWithRelations> = {}
): ItemWithRelations {
  return {
    id: "item-1",
    unit_id: "unit-1",
    zone_id: "Z01",
    name: "Test item",
    mechanism: null,
    protection: null,
    ifs_obj_id: null,
    ifs_obj_desc: null,
    ifs_wo: null,
    ifs_fl: null,
    prob: null,
    cons: null,
    priority: null,
    status: "OK",
    sece: false,
    drops_risk: false,
    structural: false,
    obs_source: null,
    freq_insp: null,
    last_insp: "2026-01-01",
    next_insp: "2999-01-01",
    resolved_at: null,
    archived: false,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    readings: [],
    evidences: [],
    ...overrides,
  };
}

export function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: "r-1",
    item_id: "item-1",
    reading_date: "2026-01-01",
    depth_mm: 1,
    location: null,
    checked_by: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
