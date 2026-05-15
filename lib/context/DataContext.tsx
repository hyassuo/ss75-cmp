"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AIAnalysis,
  Evidence,
  Item,
  ItemWithRelations,
  Profile,
  Reading,
  Zone,
} from "@/lib/types/domain";

interface DataState {
  loading: boolean;
  error: string | null;
  profile: Profile;
  zones: Zone[];
  allItems: ItemWithRelations[];
  itemsByZone: (zid: string) => ItemWithRelations[];
  refresh: () => Promise<void>;
  createItem: (
    zoneId: string,
    patch: Partial<Item>
  ) => Promise<ItemWithRelations | null>;
  updateItem: (
    id: string,
    patch: Partial<Item>
  ) => Promise<ItemWithRelations | null>;
  deleteItem: (id: string) => Promise<boolean>;
  addReading: (
    itemId: string,
    r: Omit<Reading, "id" | "item_id" | "created_at" | "created_by">
  ) => Promise<void>;
  deleteReading: (id: string, itemId: string) => Promise<void>;
  addEvidence: (itemId: string, e: EvidenceInput) => Promise<void>;
  deleteEvidence: (id: string, itemId: string) => Promise<void>;
}

export interface EvidenceInput {
  evidence_date: string;
  description: string | null;
  file_url?: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  ai_analysis: AIAnalysis | null;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [allItems, setAllItems] = useState<ItemWithRelations[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [zoneRes, itemRes] = await Promise.all([
      supabase.from("zones").select("*").order("display_order"),
      supabase
        .from("items")
        .select("*, readings(*), evidences(*)")
        .order("created_at"),
    ]);
    if (zoneRes.error || itemRes.error) {
      setError(zoneRes.error?.message || itemRes.error?.message || "Load error");
      setLoading(false);
      return;
    }
    setZones((zoneRes.data as Zone[]) ?? []);
    setAllItems((itemRes.data as unknown as ItemWithRelations[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsByZone = useCallback(
    (zid: string) =>
      allItems
        .filter((i) => i.zone_id === zid)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allItems]
  );

  const createItem = useCallback(
    async (zoneId: string, patch: Partial<Item>) => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("items")
        .insert({
          unit_id: profile.unit_id!,
          zone_id: zoneId,
          name: patch.name || "Untitled",
          mechanism: patch.mechanism ?? null,
          protection: patch.protection ?? null,
          ifs_obj_id: patch.ifs_obj_id ?? null,
          ifs_obj_desc: patch.ifs_obj_desc ?? null,
          ifs_wo: patch.ifs_wo ?? null,
          ifs_fl: patch.ifs_fl ?? null,
          prob: patch.prob ?? null,
          cons: patch.cons ?? null,
          priority: patch.priority ?? null,
          status: patch.status ?? "Pending",
          sece: patch.sece ?? false,
          freq_insp: patch.freq_insp ?? null,
          last_insp: patch.last_insp ?? null,
          next_insp: patch.next_insp ?? null,
          notes: patch.notes ?? null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select("*, readings(*), evidences(*)")
        .single();
      if (e || !data) {
        setError(e?.message || "Create failed");
        return null;
      }
      const created = data as unknown as ItemWithRelations;
      setAllItems((prev) => [...prev, created]);
      return created;
    },
    [profile.id, profile.unit_id]
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>) => {
      const prevItems = allItems;
      setAllItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("items")
        .update({ ...patch, updated_by: profile.id })
        .eq("id", id)
        .select("*, readings(*), evidences(*)")
        .single();
      if (e || !data) {
        setAllItems(prevItems);
        setError(e?.message || "Update failed");
        return null;
      }
      const updated = data as unknown as ItemWithRelations;
      setAllItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return updated;
    },
    [allItems, profile.id]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const prevItems = allItems;
      setAllItems((prev) => prev.filter((i) => i.id !== id));
      const supabase = createClient();
      const { error: e } = await supabase.from("items").delete().eq("id", id);
      if (e) {
        setAllItems(prevItems);
        setError(e.message);
        return false;
      }
      return true;
    },
    [allItems]
  );

  const addReading = useCallback(
    async (
      itemId: string,
      r: Omit<Reading, "id" | "item_id" | "created_at" | "created_by">
    ) => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("readings")
        .insert({ ...r, item_id: itemId, created_by: profile.id })
        .select("*")
        .single();
      if (e || !data) {
        setError(e?.message || "Add reading failed");
        return;
      }
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, readings: [...i.readings, data as Reading] }
            : i
        )
      );
    },
    [profile.id]
  );

  const deleteReading = useCallback(async (id: string, itemId: string) => {
    const supabase = createClient();
    const { error: e } = await supabase.from("readings").delete().eq("id", id);
    if (e) {
      setError(e.message);
      return;
    }
    setAllItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, readings: i.readings.filter((x) => x.id !== id) }
          : i
      )
    );
  }, []);

  const addEvidence = useCallback(
    async (itemId: string, ev: EvidenceInput) => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("evidences")
        .insert({
          ...ev,
          file_url: ev.file_url ?? null,
          item_id: itemId,
          created_by: profile.id,
        })
        .select("*")
        .single();
      if (e || !data) {
        setError(e?.message || "Add evidence failed");
        return;
      }
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, evidences: [...i.evidences, data as Evidence] }
            : i
        )
      );
    },
    [profile.id]
  );

  const deleteEvidence = useCallback(async (id: string, itemId: string) => {
    const supabase = createClient();
    const { error: e } = await supabase.from("evidences").delete().eq("id", id);
    if (e) {
      setError(e.message);
      return;
    }
    setAllItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, evidences: i.evidences.filter((x) => x.id !== id) }
          : i
      )
    );
  }, []);

  return (
    <DataContext.Provider
      value={{
        loading,
        error,
        profile,
        zones,
        allItems,
        itemsByZone,
        refresh: load,
        createItem,
        updateItem,
        deleteItem,
        addReading,
        deleteReading,
        addEvidence,
        deleteEvidence,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
