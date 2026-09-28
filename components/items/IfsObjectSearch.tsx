"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import type { IfsObject } from "@/lib/types/domain";
import { useLang } from "@/lib/context/LangContext";

interface Props {
  value: IfsObject | null;
  onSelect: (o: IfsObject | null) => void;
}

export function IfsObjectSearch({ value, onSelect }: Props) {
  const [q, setQ] = useState(value ? `${value.id} - ${value.desc}` : "");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<IfsObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLang();
  const id = useId();
  const listId = id + "-list";
  const optId = (i: number) => `${id}-opt-${i}`;

  function doSearch(term: string) {
    if (!term || term.length < 2) {
      setRes([]);
      setOpen(false);
      return;
    }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/ifs/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term }),
        });
        const data = await r.json();
        const hits: IfsObject[] = Array.isArray(data) ? data : [];
        setRes(hits);
        setActive(-1);
        setOpen(hits.length > 0);
      } catch {
        setRes([]);
        setOpen(false);
      }
      setLoading(false);
    }, 400);
  }

  function pick(o: IfsObject) {
    setQ(`${o.id} - ${o.desc}`);
    setOpen(false);
    onSelect(o);
  }

  function clear() {
    setQ("");
    setOpen(false);
    onSelect(null);
  }

  // Combobox keyboard model: ↓/↑ move through the results, Enter picks,
  // Escape closes the list (without closing the surrounding modal).
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || res.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % res.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? res.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(res[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <Label htmlFor={id}>{t("ifs.label")}</Label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          onKeyDown={onKeyDown}
          value={q}
          placeholder={t("ifs.placeholder")}
          style={{ ...S.inp, ...S.mono, paddingRight: 30 }}
          onChange={(e) => {
            setQ(e.target.value);
            doSearch(e.target.value);
          }}
          onFocus={() => {
            if (q.length > 1) doSearch(q);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {q && (
          <button
            type="button"
            onClick={clear}
            aria-label={t("ifs.clear")}
            style={{
              position: "absolute",
              right: 4,
              minWidth: 32,
              minHeight: 32,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: DS.text3,
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
        {loading && (
          <div
            style={{
              fontSize: 11,
              color: DS.text3,
              padding: "3px 0",
              marginTop: 2,
            }}
          >
            {t("ifs.searching")}
          </div>
        )}
        {open && (
          <div
            id={listId}
            role="listbox"
            aria-label={t("ifs.label")}
            style={{
              position: "absolute",
              top: "calc(100% + 3px)",
              left: 0,
              right: 0,
              background: DS.sur,
              border: "1px solid " + DS.bord,
              borderRadius: 8,
              zIndex: 999,
              maxHeight: 230,
              overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            {res.map((o, i) => (
              <div
                key={o.id}
                id={optId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={() => pick(o)}
                style={{
                  background: i === active ? DS.bluBg : undefined,
                  minHeight: 40,
                  padding: "8px 13px",
                  cursor: "pointer",
                  borderBottom: "1px solid " + DS.sur2,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    color: DS.blu,
                    minWidth: 100,
                    flexShrink: 0,
                  }}
                >
                  {o.id}
                </span>
                <span style={{ fontSize: 12, color: DS.text2, flex: 1 }}>
                  {o.desc}
                </span>
                {o.sece && (
                  <span
                    style={{
                      fontSize: 9,
                      color: DS.red,
                      fontWeight: 800,
                      background: DS.redBg,
                      borderRadius: 3,
                      padding: "1px 6px",
                    }}
                  >
                    SECE
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {value && value.sece && (
        <div
          style={{
            fontSize: 10,
            color: DS.red,
            marginTop: 3,
            fontWeight: 700,
          }}
        >
          {t("ifs.seceNote")}
        </div>
      )}
    </div>
  );
}
