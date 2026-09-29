"use client";

import { useEffect, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { fmt } from "@/lib/utils/format";
import {
  historyAction,
  historyField,
  historyNoteText,
  historyValue,
} from "@/lib/i18n/history";
import { useLang } from "@/lib/context/LangContext";
import { createClient } from "@/lib/supabase/client";
import type { HistoryEntry } from "@/lib/types/domain";

export function HistoryPanel({ itemId }: { itemId: string }) {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { lang, t } = useLang();

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
      <div style={{ fontSize: DS.fs.sm, color: DS.text3 }}>{t("history.loading")}</div>
    );
  }
  if (!rows.length) {
    return (
      <div style={{ fontSize: DS.fs.md, color: DS.text3 }}>
        {t("history.empty")}
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
              fontSize: DS.fs.xs,
              color: DS.text3,
              flexShrink: 0,
              paddingTop: 2,
              minWidth: 96,
            }}
          >
            {fmt(h.event_date.split("T")[0], lang)}
          </div>
          <div>
            <div
              style={{
                fontSize: DS.fs.md,
                fontWeight: 700,
                color: DS.text2,
                marginBottom: 2,
              }}
            >
              {historyAction(h.action, lang)}
              {h.field_changed ? ` · ${historyField(h.field_changed, lang)}` : ""}
            </div>
            {(h.prev_value || h.new_value) && (
              <div style={{ fontSize: DS.fs.sm, color: DS.text3 }}>
                {historyValue(h.field_changed, h.prev_value, lang)} →{" "}
                {historyValue(h.field_changed, h.new_value, lang)}
              </div>
            )}
            {h.note && (
              <div style={{ fontSize: DS.fs.sm, color: DS.text3 }}>{historyNoteText(h.note, lang)}</div>
            )}
            {h.by_user_email && (
              <div style={{ fontSize: DS.fs.xs, color: DS.text3, marginTop: 2 }}>
                {t("history.by", h.by_user_email)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
