"use client";

import { useEffect, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { fmt } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { HistoryEntry } from "@/lib/types/domain";

export function HistoryPanel({ itemId }: { itemId: string }) {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("history")
        .select("*")
        .eq("item_id", itemId)
        .order("event_date", { ascending: false });
      if (active) {
        setRows((data as HistoryEntry[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [itemId]);

  if (loading) {
    return (
      <div style={{ fontSize: 11, color: DS.text3 }}>Loading history…</div>
    );
  }
  if (!rows.length) {
    return (
      <div style={{ fontSize: 12, color: DS.text3 }}>
        No history recorded yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((h) => (
        <div
          key={h.id}
          style={{
            background: DS.sur2,
            border: "1px solid " + DS.bord,
            borderRadius: 7,
            padding: "8px 12px",
            display: "flex",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: DS.text3,
              flexShrink: 0,
              paddingTop: 2,
              minWidth: 96,
            }}
          >
            {fmt(h.event_date.split("T")[0])}
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: DS.text2,
                marginBottom: 2,
              }}
            >
              {h.action.replace(/_/g, " ")}
              {h.field_changed ? ` · ${h.field_changed}` : ""}
            </div>
            {(h.prev_value || h.new_value) && (
              <div style={{ fontSize: 11, color: DS.text3 }}>
                {h.prev_value ?? "—"} → {h.new_value ?? "—"}
              </div>
            )}
            {h.note && (
              <div style={{ fontSize: 11, color: DS.text3 }}>{h.note}</div>
            )}
            {h.by_user_email && (
              <div style={{ fontSize: 10, color: DS.text3, marginTop: 2 }}>
                by {h.by_user_email}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
