"use client";

import { useEffect, useRef, useState } from "react";
import { ItemModal } from "@/components/items/ItemModal";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";

type Shown = { id: string; isNew: boolean };

// The one place the item modal is rendered. It follows ?item= in the URL
// (see ShellContext): opening pushes a history entry, so the phone's Back
// button closes the modal. Back is routed through the modal's own
// discard check: if the user declines, the entry is pushed back.
export function ItemModalHost() {
  const {
    openItemId,
    openItemIsNew,
    openItem,
    closeItem,
    closingIntentionally,
  } = useShell();
  const { allItems, zones, loading, profile } = useData();
  const [shown, setShown] = useState<Shown | null>(null);
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (openItemId) {
      setShown((s) => {
        if (s && s.id === openItemId) return s;
        seen.current = new Set(); // "seen" is per opening
        return { id: openItemId, isNew: openItemIsNew };
      });
      return;
    }
    if (!shown) return;
    if (closingIntentionally.current) {
      closingIntentionally.current = false;
      guard.current = null;
      setShown(null);
      return;
    }
    // History navigation (Back) while the modal was open.
    const current = shown;
    void (async () => {
      const ok = guard.current ? await guard.current() : true;
      if (ok) {
        guard.current = null;
        setShown(null);
      } else {
        openItem(current.id, { isNew: current.isNew });
      }
    })();
    // React only to URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  const item = shown ? allItems.find((i) => i.id === shown.id) : undefined;
  if (item) seen.current.add(item.id);

  // A link to an item that doesn't exist (deleted, other unit, typo):
  // drop the parameter instead of leaving an invisible modal state.
  useEffect(() => {
    if (shown && !loading && !item && !seen.current.has(shown.id)) {
      closingIntentionally.current = true;
      closeItem();
    }
  }, [shown, loading, item, closeItem, closingIntentionally]);

  if (!shown) return null;
  // "&new=1" in the URL is only a hint (it survives in history and in
  // copied links). Only a stub that is still unnamed and ours is treated as
  // a new draft: Cancel on a *saved* item must never delete it.
  const isNew =
    shown.isNew &&
    !!item &&
    item.name === "Untitled" &&
    item.created_by === profile.id;
  const zoneName =
    zones.find((z) => z.zid === item?.zone_id)?.name ?? item?.zone_id ?? "";
  return (
    <ItemModal
      key={shown.id}
      itemId={shown.id}
      zoneName={zoneName}
      isNew={isNew}
      onClose={closeItem}
      registerCloseGuard={(fn) => {
        guard.current = fn;
      }}
    />
  );
}
