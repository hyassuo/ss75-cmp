// Unsaved item-modal edits, mirrored to localStorage so a dropped
// connection, an idle logout or a closed tab doesn't lose an inspection
// that was typed but not saved. Per-browser convenience only — never the
// source of truth. Every access is guarded: storage can be disabled or
// full (private mode, quota), and the app must work without it.
const PREFIX = "ss75-cmp.itemDraft.";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ItemDraft<F> {
  form: F;
  /** items.updated_at the edits were based on (for conflict detection). */
  baseUpdatedAt: string;
  savedAt: number;
}

export function loadItemDraft<F>(itemId: string): ItemDraft<F> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + itemId);
    if (!raw) return null;
    const d = JSON.parse(raw) as ItemDraft<F>;
    if (!d || typeof d.savedAt !== "number" || !d.form) return null;
    if (Date.now() - d.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + itemId);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveItemDraft<F>(itemId: string, draft: ItemDraft<F>): void {
  try {
    window.localStorage.setItem(PREFIX + itemId, JSON.stringify(draft));
  } catch {
    // quota / disabled — drafts are best-effort
  }
}

export function clearItemDraft(itemId: string): void {
  try {
    window.localStorage.removeItem(PREFIX + itemId);
  } catch {
    // ignore
  }
}

// Drop drafts for items that no longer exist (or are too old).
export function pruneItemDrafts(liveIds: Set<string>): void {
  try {
    const ls = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      let stale = !liveIds.has(id);
      if (!stale) {
        try {
          const d = JSON.parse(ls.getItem(k) ?? "null") as ItemDraft<unknown> | null;
          stale = !d || Date.now() - d.savedAt > MAX_AGE_MS;
        } catch {
          stale = true;
        }
      }
      if (stale) doomed.push(k);
    }
    doomed.forEach((k) => ls.removeItem(k));
  } catch {
    // ignore
  }
}
