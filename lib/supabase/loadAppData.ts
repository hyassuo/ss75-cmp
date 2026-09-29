import type { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";
import type { ItemWithRelations, Subarea, Zone } from "@/lib/types/domain";

type Client = ReturnType<typeof createClient>;

export const ITEM_SELECT = "*, readings(*), evidences(*)";

export type AppDataResult =
  | { ok: true; zones: Zone[]; subareas: Subarea[]; items: ItemWithRelations[] }
  | { ok: false; error: string };

// Everything the app shell shows, every request in flight at once.
//   sweep: also let the server discard this user's abandoned drafts.
//     createItem inserts a stub row immediately so the modal has an id for
//     photo uploads; that row stays in the DB if the user gets kicked by
//     IdleLogout or closes the tab without Cancel. The server decides what
//     is an abandoned draft (untouched stub of this user, 30+ min old, no
//     readings/photos), deletes it and reports the ids; they are dropped
//     from the items read alongside (which may or may not still hold them).
//   expectedItems: rows the item query should return (fetchAll `expected`),
//     so all its pages go out together.
export async function loadAppData(
  supabase: Client,
  opts: { sweep: boolean; expectedItems?: number | null }
): Promise<AppDataResult> {
  const [zoneRes, subareaRes, itemRes, swept] = await Promise.all([
    supabase.from("zones").select("*").order("display_order"),
    supabase.from("subareas").select("*").order("display_order").order("name"),
    // Paged: PostgREST silently caps a response at 1000 rows.
    fetchAll<ItemWithRelations>(
      (from, to, withCount) =>
        supabase
          .from("items")
          .select(ITEM_SELECT, { count: withCount ? "exact" : undefined })
          .order("created_at")
          .order("id")
          .range(from, to),
      { expected: opts.expectedItems ?? undefined }
    ),
    opts.sweep ? supabase.rpc("discard_my_abandoned_drafts") : null,
  ]);
  const error = zoneRes.error?.message || subareaRes.error?.message || itemRes.error;
  if (error) return { ok: false, error };
  let items = itemRes.data;
  const gone = swept?.data;
  if (Array.isArray(gone) && gone.length) {
    const ids = new Set(gone as string[]);
    items = items.filter((i) => !ids.has(i.id));
  }
  rememberItemCount(items.length);
  return {
    ok: true,
    zones: (zoneRes.data as Zone[]) ?? [],
    subareas: (subareaRes.data as Subarea[]) ?? [],
    items,
  };
}

// How many items the last load on this device returned: the sign-in
// preload's `expectedItems` (the server's count only comes with the page).
// A per-device hint — missing or wrong, it only costs pages fetched one at
// a time.
const COUNT_KEY = "ss75-cmp.itemCount";
function rememberItemCount(n: number) {
  try {
    window.localStorage.setItem(COUNT_KEY, String(n));
  } catch {
    // storage unavailable — no hint next time
  }
}
function rememberedItemCount(): number | null {
  try {
    const n = Number(window.localStorage.getItem(COUNT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// Sign-in hands the first load over to the app: LoginForm starts it the
// moment the session exists, so it runs while the dashboard is still being
// rendered on the server and its code downloaded, and DataProvider's first
// load takes it instead of starting from zero. Used once, only by the same
// user, only while fresh.
const PRELOAD_TTL_MS = 30_000;
let preloaded: { userId: string; at: number; result: Promise<AppDataResult> } | null = null;

export function preloadAppData(supabase: Client, userId: string) {
  preloaded = {
    userId,
    at: Date.now(),
    result: loadAppData(supabase, { sweep: true, expectedItems: rememberedItemCount() }),
  };
}

export function takePreloadedAppData(userId: string): Promise<AppDataResult> | null {
  const p = preloaded;
  preloaded = null;
  return p && p.userId === userId && Date.now() - p.at < PRELOAD_TTL_MS ? p.result : null;
}
