"use client";

import { useRef, useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import type { IfsObject } from "@/lib/types/domain";

interface Props {
  value: IfsObject | null;
  onSelect: (o: IfsObject | null) => void;
}

export function IfsObjectSearch({ value, onSelect }: Props) {
  const [q, setQ] = useState(value ? `${value.id} - ${value.desc}` : "");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<IfsObject[]>([]);
  const [loading, setLoading] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div style={{ marginBottom: 12 }}>
      <Label>Object ID / Description (IFS)</Label>
      <div style={{ position: "relative" }}>
        <input
          value={q}
          placeholder="Type Object ID or description..."
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
            onClick={clear}
            style={{
              position: "absolute",
              right: 9,
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
            Searching IFS...
          </div>
        )}
        {open && (
          <div
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
            {res.map((o) => (
              <div
                key={o.id}
                onMouseDown={() => pick(o)}
                style={{
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
          SECE - Safety &amp; Environmental Critical Element
        </div>
      )}
    </div>
  );
}
