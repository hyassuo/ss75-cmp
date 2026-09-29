"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DS } from "@/lib/design/tokens";
import { useData } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";
import { useShell } from "@/lib/context/ShellContext";
import { effectiveStatus } from "@/lib/domain/effectiveStatus";
import { searchItems } from "@/lib/domain/searchItems";
import { STATUS_COLOR } from "@/lib/utils/constants";

// Top-bar item search (combobox): type part of a name, IFS code, work
// order, zone or note; pick a result to open the item. Searches the items
// already loaded, so it answers instantly and offline. "/" focuses it from
// anywhere outside a text field.
export function ItemSearch() {
  const { allItems, zones } = useData();
  const { openItem } = useShell();
  const { t, tStatus } = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = id + "-list";
  const optId = (i: number) => `${id}-opt-${i}`;

  const zoneName = useMemo(() => {
    const byId = new Map(zones.map((z) => [z.zid, z.name]));
    return (zid: string) => byId.get(zid) ?? "";
  }, [zones]);
  const results = useMemo(
    () => searchItems(allItems, q, zoneName),
    [allItems, q, zoneName]
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      // Not while a modal is open (the page behind it is inert).
      if (typing || document.getElementById("app-root")?.hasAttribute("inert")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function pick(itemId: string) {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    openItem(itemId);
  }

  // Combobox keys: arrows move, Enter opens the highlighted (or first)
  // result, Escape clears.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setQ("");
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[Math.min(active, results.length - 1)].id);
    }
  }

  const showList = open && q.trim().length >= 2;

  return (
    <div className="tb-search" style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label={t("search.label")}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? optId(active) : undefined}
        autoComplete="off"
        enterKeyHint="search"
        value={q}
        placeholder={t("search.placeholder")}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 36,
          borderRadius: 6,
          border: "1px solid " + DS.sbBord,
          background: "rgba(0,0,0,0.22)",
          color: "#ffffff",
          padding: "0 10px",
          fontSize: 13,
          fontFamily: DS.sans,
        }}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("search.label")}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            left: 0,
            minWidth: 280,
            background: DS.sur,
            border: "1px solid " + DS.bord,
            borderRadius: 8,
            zIndex: 999,
            maxHeight: 360,
            overflowY: "auto",
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }}
        >
          {results.length === 0 ? (
            <div role="status" style={{ padding: "12px 14px", fontSize: 12, color: DS.text3 }}>
              {t("search.none")}
            </div>
          ) : (
            results.map((it, i) => {
              const st = effectiveStatus(it);
              return (
                <div
                  key={it.id}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: runs before the input's blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(it.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    background: i === active ? DS.bluBg : undefined,
                    minHeight: 44,
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid " + DS.sur2,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: DS.mono, fontSize: 11, color: DS.blu, minWidth: 34 }}>
                    {it.zone_id}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, color: DS.text, fontWeight: 600 }}>
                      {it.name}
                    </span>
                    {(it.ifs_obj_id || it.archived) && (
                      <span style={{ display: "block", fontSize: 11, color: DS.text3, fontFamily: DS.mono }}>
                        {[it.ifs_obj_id, it.archived ? t("search.archived") : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[st] }}>
                    {tStatus(st)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
