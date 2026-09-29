"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ITEM_SELECT,
  loadAppData,
  takePreloadedAppData,
} from "@/lib/supabase/loadAppData";
import { pruneItemDrafts } from "@/lib/utils/itemDraft";
import type {
  AIAnalysis,
  Evidence,
  Item,
  ItemWithRelations,
  Profile,
  Reading,
  Subarea,
  Zone,
} from "@/lib/types/domain";

// Every mutation reports its outcome so the caller can keep the user's
// input on screen when it fails (offshore links drop often) instead of
// closing a form over a lost write.
//   conflict: the row changed since the caller read it (see updateItem)
//   notFound: the row is gone (deleted elsewhere) or RLS hides it
export type MutationResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; conflict?: boolean; notFound?: boolean };

type ReadingInput = Omit<Reading, "id" | "item_id" | "created_at" | "created_by">;

interface DataState {
  loading: boolean;
  error: string | null;
  clearError: () => void;
  profile: Profile;
  zones: Zone[];
  subareas: Subarea[];
  subareasByZone: (zid: string) => Subarea[];
  createSubarea: (zoneId: string, name: string) => Promise<Subarea | null>;
  allItems: ItemWithRelations[];
  itemsByZone: (zid: string) => ItemWithRelations[];
  refresh: () => Promise<void>;
  createItem: (
    zoneId: string,
    patch: Partial<Item>
  ) => Promise<ItemWithRelations | null>;
  updateItem: (
    id: string,
    patch: Partial<Item>,
    opts?: { expectedUpdatedAt?: string }
  ) => Promise<MutationResult<ItemWithRelations>>;
  deleteItem: (
    id: string,
    opts?: { discardDraft?: boolean }
  ) => Promise<MutationResult>;
  addReading: (
    itemId: string,
    r: ReadingInput
  ) => Promise<MutationResult<Reading>>;
  deleteReading: (id: string, itemId: string) => Promise<MutationResult>;
  addEvidence: (
    itemId: string,
    e: EvidenceInput
  ) => Promise<MutationResult<Evidence>>;
  deleteEvidence: (id: string, itemId: string) => Promise<MutationResult>;
}

export interface EvidenceInput {
  evidence_date: string;
  description: string | null;
  // No file_url: the legacy column stays empty, since a stored link would be a
  // way to reach a photo outside the session (C7). Files go by file_path.
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  ai_analysis: AIAnalysis | null;
}

const BUCKET = "evidence-photos";
// Re-fetch when the tab regains focus, at most this often, so a screen left
// open all shift doesn't keep showing (and saving over) stale data.
const FOCUS_REFRESH_MS = 60 * 1000;

const DataContext = createContext<DataState | null>(null);

export function DataProvider({
  profile,
  itemCountHint,
  children,
}: {
  profile: Profile;
  /** Items visible to the user, counted by the server for this render. */
  itemCountHint: number | null;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [subareas, setSubareas] = useState<Subarea[]>([]);
  const [allItems, setAllItems] = useState<ItemWithRelations[]>([]);
  // Latest items for callbacks that must not be re-created on every change
  // (and must not roll back to a stale snapshot).
  const itemsRef = useRef<ItemWithRelations[]>([]);
  useEffect(() => {
    itemsRef.current = allItems;
  }, [allItems]);
  // Bumped by every local write. A background refresh that started before
  // a write would put pre-write rows back (resurrect a deleted item, drop a
  // just-created draft, revert a save): such a result is discarded.
  const writeSeq = useRef(0);

  const replaceItem = useCallback(
    (id: string, next: ItemWithRelations | undefined) =>
      setAllItems((prev) =>
        next
          ? prev.map((i) => (i.id === id ? next : i))
          : prev.filter((i) => i.id !== id)
      ),
    []
  );

  // silent: background refresh: no skeleton, no error banner, no sweep of
  // abandoned drafts (loadAppData), so a draft open in the item modal right
  // now can never be swept from under it.
  // The first load takes over the one LoginForm started at sign-in, if any.
  const firstLoad = useRef(true);
  // A ref: a later layout render with a new count must not re-create
  // load() (which would reload everything).
  const countHint = useRef(itemCountHint);
  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const seqAtStart = writeSeq.current;
      const preloaded = firstLoad.current
        ? takePreloadedAppData(profile.id)
        : null;
      firstLoad.current = false;
      const res = await (preloaded ??
        loadAppData(createClient(), {
          sweep: !silent,
          // Every page of the items at once: the rows already held, or
          // on the first load the server's count.
          expectedItems: itemsRef.current.length || countHint.current,
        }));
      // Stale by the time it arrived: a local write happened meanwhile.
      // (The next focus refresh will pick up remote changes.)
      if (silent && writeSeq.current !== seqAtStart) return;
      if (!res.ok) {
        if (!silent) {
          setError(res.error);
          setLoading(false);
        }
        return;
      }
      setZones(res.zones);
      setSubareas(res.subareas);
      setAllItems(res.items);
      if (!silent) {
        pruneItemDrafts(profile.id, new Set(res.items.map((i) => i.id)));
        setLoading(false);
      }
    },
    [profile.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < FOCUS_REFRESH_MS) return;
      last = Date.now();
      void load(true);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ItemWithRelations[]>();
    for (const i of allItems) {
      const arr = map.get(i.zone_id);
      if (arr) arr.push(i);
      else map.set(i.zone_id, [i]);
    }
    map.forEach((arr) =>
      arr.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    );
    return map;
  }, [allItems]);

  const itemsByZone = useCallback(
    (zid: string) => grouped.get(zid) ?? [],
    [grouped]
  );

  const subareasGrouped = useMemo(() => {
    const map = new Map<string, Subarea[]>();
    for (const s of subareas) {
      const arr = map.get(s.zone_id);
      if (arr) arr.push(s);
      else map.set(s.zone_id, [s]);
    }
    return map;
  }, [subareas]);

  const subareasByZone = useCallback(
    (zid: string) => subareasGrouped.get(zid) ?? [],
    [subareasGrouped]
  );

  const createSubarea = useCallback(
    async (zoneId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      writeSeq.current++;
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("subareas")
        .insert({
          unit_id: profile.unit_id!,
          zone_id: zoneId,
          name: trimmed,
        })
        .select("*")
        .single();
      if (e || !data) {
        // Unique violation (duplicate name) or RLS denial surfaces here.
        setError(e?.message || "Create sub-area failed");
        return null;
      }
      const created = data as Subarea;
      setSubareas((prev) =>
        [...prev, created].sort(
          (a, b) =>
            (a.display_order ?? 0) - (b.display_order ?? 0) ||
            a.name.localeCompare(b.name)
        )
      );
      return created;
    },
    [profile.unit_id]
  );

  const createItem = useCallback(
    async (zoneId: string, patch: Partial<Item>) => {
      writeSeq.current++;
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
          drops_risk: patch.drops_risk ?? false,
          structural: patch.structural ?? false,
          obs_source: patch.obs_source ?? null,
          freq_insp: patch.freq_insp ?? null,
          last_insp: patch.last_insp ?? null,
          next_insp: patch.next_insp ?? null,
          subarea_id: patch.subarea_id ?? null,
          action_type: patch.action_type ?? null,
          action_due: patch.action_due ?? null,
          action_status: patch.action_status ?? null,
          action_note: patch.action_note ?? null,
          corr_extent_band: patch.corr_extent_band ?? null,
          material_loss_band: patch.material_loss_band ?? null,
          is_accessory: patch.is_accessory ?? false,
          accessory_type: patch.accessory_type ?? null,
          notes: patch.notes ?? null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select(ITEM_SELECT)
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

  // expectedUpdatedAt: optimistic concurrency. The write only applies if
  // the row still carries the updated_at the caller started from; if
  // someone else saved in between, nothing is written and the result is
  // { conflict: true } (local state is refreshed with their version).
  const updateItem = useCallback(
    async (
      id: string,
      patch: Partial<Item>,
      opts: { expectedUpdatedAt?: string } = {}
    ): Promise<MutationResult<ItemWithRelations>> => {
      writeSeq.current++;
      // Roll back only the keys this call changed: other state (a reading
      // added a moment ago, a newer save) must survive a failed write.
      const before = itemsRef.current.find((i) => i.id === id);
      const undo: Partial<Item> = {};
      if (before) {
        for (const k of Object.keys(patch) as Array<keyof Item>) {
          (undo as Record<string, unknown>)[k] = before[k];
        }
      }
      const revert = () =>
        setAllItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, ...undo } : i))
        );
      setAllItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
      const supabase = createClient();
      let q = supabase
        .from("items")
        .update({ ...patch, updated_by: profile.id })
        .eq("id", id);
      if (opts.expectedUpdatedAt) q = q.eq("updated_at", opts.expectedUpdatedAt);
      const { data, error: e } = await q.select(ITEM_SELECT);
      if (e) {
        revert();
        return { ok: false, error: e.message };
      }
      const rows = (data ?? []) as unknown as ItemWithRelations[];
      if (rows.length === 0) {
        // Either the row moved on (someone else saved) or it's gone / not
        // writable for us. Tell them apart and show the current version.
        const { data: cur } = await supabase
          .from("items")
          .select(ITEM_SELECT)
          .eq("id", id)
          .maybeSingle();
        const current = (cur ?? undefined) as unknown as
          | ItemWithRelations
          | undefined;
        // Gone: drop it from the lists (the open modal keeps its own copy).
        replaceItem(id, current);
        if (!current) {
          return { ok: false, error: "Item not found", notFound: true };
        }
        if (
          opts.expectedUpdatedAt &&
          current.updated_at !== opts.expectedUpdatedAt
        ) {
          // Our own write may already have landed: on a flaky link the
          // browser can retry a PATCH whose response was lost, and the retry
          // then misses on the old updated_at. If the row holds exactly our
          // values and we were the last writer, that's success, not a
          // conflict with "someone else".
          const mine =
            current.updated_by === profile.id &&
            Object.entries(patch).every(
              ([k, v]) =>
                JSON.stringify((current as unknown as Record<string, unknown>)[k] ?? null) ===
                JSON.stringify(v ?? null)
            );
          if (mine) return { ok: true, data: current };
          return { ok: false, error: "Changed by someone else", conflict: true };
        }
        return { ok: false, error: "Update not permitted" };
      }
      const updated = rows[0];
      replaceItem(id, updated);
      return { ok: true, data: updated };
    },
    [profile.id, replaceItem]
  );

  // Storage objects don't cascade with the DB row. Their paths are
  // collected up front (listing needs the item to exist), then:
  //   discardDraft: files first, then the row: the storage policy lets a
  //     creator remove files only while the draft row still exists;
  //   otherwise: the row first, then the files, so a failed delete
  //     never leaves an item whose photos are already gone.
  const deleteItem = useCallback(
    async (
      id: string,
      opts: { discardDraft?: boolean } = {}
    ): Promise<MutationResult> => {
      const target = itemsRef.current.find((i) => i.id === id);
      writeSeq.current++;
      const supabase = createClient();
      const paths = new Set<string>();
      for (const ev of target?.evidences ?? []) {
        if (ev.file_path) paths.add(ev.file_path);
      }
      const { data: listed } = await supabase.storage.from(BUCKET).list(id, {
        limit: 1000,
      });
      for (const obj of listed ?? []) paths.add(`${id}/${obj.name}`);
      const removeFiles = async () => {
        if (!paths.size) return;
        const { error: se } = await supabase.storage
          .from(BUCKET)
          .remove(Array.from(paths));
        if (se) console.warn("[deleteItem] storage cleanup failed", se.message);
      };

      if (opts.discardDraft) await removeFiles();
      // RLS turns a disallowed DELETE into a silent 0-row no-op; ask for the
      // deleted id back so that case is reported instead of "succeeding".
      const { data: gone, error: e } = await supabase
        .from("items")
        .delete()
        .eq("id", id)
        .select("id");
      if (e || !gone?.length) {
        return { ok: false, error: e?.message || "Delete not permitted" };
      }
      if (!opts.discardDraft) await removeFiles();
      setAllItems((prev) => prev.filter((i) => i.id !== id));
      return { ok: true, data: undefined };
    },
    []
  );

  const addReading = useCallback(
    async (itemId: string, r: ReadingInput): Promise<MutationResult<Reading>> => {
      writeSeq.current++;
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("readings")
        .insert({ ...r, item_id: itemId, created_by: profile.id })
        .select("*")
        .single();
      if (e || !data) {
        return { ok: false, error: e?.message || "Add reading failed" };
      }
      const created = data as Reading;
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, readings: [...i.readings, created] } : i
        )
      );
      return { ok: true, data: created };
    },
    [profile.id]
  );

  const deleteReading = useCallback(
    async (id: string, itemId: string): Promise<MutationResult> => {
      writeSeq.current++;
      const supabase = createClient();
      const { data: gone, error: e } = await supabase
        .from("readings")
        .delete()
        .eq("id", id)
        .select("id");
      if (e || !gone?.length) {
        return { ok: false, error: e?.message || "Delete not permitted" };
      }
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, readings: i.readings.filter((x) => x.id !== id) }
            : i
        )
      );
      return { ok: true, data: undefined };
    },
    []
  );

  const addEvidence = useCallback(
    async (itemId: string, ev: EvidenceInput): Promise<MutationResult<Evidence>> => {
      writeSeq.current++;
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("evidences")
        .insert({
          ...ev,
          item_id: itemId,
          created_by: profile.id,
        })
        .select("*")
        .single();
      if (e || !data) {
        return { ok: false, error: e?.message || "Add evidence failed" };
      }
      const created = data as Evidence;
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, evidences: [...i.evidences, created] } : i
        )
      );
      return { ok: true, data: created };
    },
    [profile.id]
  );

  // Row first, then the file: a failure can at worst orphan a blob (quota),
  // never leave an evidence row whose photo is already gone.
  const deleteEvidence = useCallback(
    async (id: string, itemId: string): Promise<MutationResult> => {
      writeSeq.current++;
      const supabase = createClient();
      const evidence = itemsRef.current
        .find((i) => i.id === itemId)
        ?.evidences.find((x) => x.id === id);
      const { data: gone, error: e } = await supabase
        .from("evidences")
        .delete()
        .eq("id", id)
        .select("id");
      if (e || !gone?.length) {
        return { ok: false, error: e?.message || "Delete not permitted" };
      }
      if (evidence?.file_path) {
        const { error: se } = await supabase.storage
          .from(BUCKET)
          .remove([evidence.file_path]);
        if (se) console.warn("[deleteEvidence] storage cleanup failed", se.message);
      }
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, evidences: i.evidences.filter((x) => x.id !== id) }
            : i
        )
      );
      return { ok: true, data: undefined };
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);
  const refresh = useCallback(() => load(), [load]);

  const value = useMemo<DataState>(
    () => ({
      loading,
      error,
      clearError,
      profile,
      zones,
      subareas,
      subareasByZone,
      createSubarea,
      allItems,
      itemsByZone,
      refresh,
      createItem,
      updateItem,
      deleteItem,
      addReading,
      deleteReading,
      addEvidence,
      deleteEvidence,
    }),
    [
      loading,
      error,
      clearError,
      profile,
      zones,
      subareas,
      subareasByZone,
      createSubarea,
      allItems,
      itemsByZone,
      refresh,
      createItem,
      updateItem,
      deleteItem,
      addReading,
      deleteReading,
      addEvidence,
      deleteEvidence,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
