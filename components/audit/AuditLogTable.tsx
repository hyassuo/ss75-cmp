"use client";

import { useEffect, useMemo, useState } from "react";
import { S } from "@/lib/design/styles";
import { DS, tint } from "@/lib/design/tokens";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { fmt, today } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { csvRow } from "@/lib/utils/csv";
import { addDays } from "@/lib/utils/format";
import { useLang } from "@/lib/context/LangContext";
import { download } from "@/lib/utils/download";
import { latestNameByRef } from "@/lib/utils/historyNames";
import { historyNote } from "@/lib/utils/historyNote";
import { historyAction, historyField, historyValue } from "@/lib/i18n/history";
import type { HistoryEntry } from "@/lib/types/domain";

type Row = HistoryEntry & { itemName: string };

// Upper bound on rows pulled into the browser; the date filter narrows it.
const MAX_ROWS = 10_000;

// Local calendar day → UTC instant of its start (event_date is timestamptz).
function dayStartIso(d: string): string {
  return new Date(d + "T00:00:00").toISOString();
}

export function AuditLogTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const { lang, t } = useLang();
  // Excel in pt-BR expects ";" (the comma is the decimal separator).
  const csvSep = lang === "pt" ? ";" : ",";

  // Date filtering runs server-side (on the user's local calendar days), so
  // older events are reachable instead of silently cut off by a row cap.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    setLoading(true);
    (async () => {
      const res = await fetchAll<
        HistoryEntry & { items: { name: string } | null }
      >(
        (lo, hi, withCount) => {
          let q = supabase
            .from("history")
            .select("*, items(name)", { count: withCount ? "exact" : undefined })
            .order("event_date", { ascending: false })
            .order("id");
          if (from) q = q.gte("event_date", dayStartIso(from));
          if (to) q = q.lt("event_date", dayStartIso(addDays(to, 1) ?? to));
          return q.range(lo, hi);
        },
        { max: MAX_ROWS, key: (r) => r.id }
      );
      if (!active) return;
      const raw = res.data;
      // item_id is NULL once the item is deleted; fall back to the name
      // snapshots kept on the audit rows.
      const names = latestNameByRef(raw);
      setRows(
        raw.map((r) => ({
          ...r,
          itemName:
            r.items?.name ??
            (r.item_ref ? names.get(r.item_ref) : undefined) ??
            r.item_name ??
            r.item_ref ??
            "-",
        }))
      );
      setTruncated(res.truncated);
      setLoadErr(res.error ?? "");
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [from, to]);

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows]
  );
  const users = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.by_user_email).filter(Boolean))
      ).sort() as string[],
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (action && r.action !== action) return false;
    if (user && r.by_user_email !== user) return false;
    return true;
  });

  // The CSV is the raw audit trail for downstream use: fixed English
  // headers, stored values and ISO timestamps in both languages (only the
  // separator follows the language, for Excel).
  function exportCSV() {
    const headers = [
      "Date",
      "Item",
      "Action",
      "Field",
      "Previous",
      "New",
      "Note",
      "User",
    ];
    const csv = [
      csvRow(headers, csvSep),
      ...filtered.map((r) =>
        csvRow([
          r.event_date,
          r.itemName,
          r.action,
          r.field_changed,
          r.prev_value,
          r.new_value,
          historyNote(r.note),
          r.by_user_email,
        ], csvSep)
      ),
    ].join("\n");
    download(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `ss75-cmp_audit_${today()}.csv`
    );
  }

  const filterStyle = { ...S.inp, width: "auto", marginBottom: 0 };

  return (
    <div style={S.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: DS.fs.sm,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
          }}
        >
          {t("audit.title", filtered.length)}
        </div>
        <Button onClick={exportCSV} disabled={!filtered.length}>
          {t("exp.csv")}
        </Button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          type="date"
          value={from}
          aria-label={t("audit.from")}
          onChange={(e) => setFrom(e.target.value)}
          style={filterStyle}
        />
        <span aria-hidden="true" style={{ color: DS.text3, fontSize: DS.fs.md }}>→</span>
        <input
          type="date"
          value={to}
          aria-label={t("audit.to")}
          onChange={(e) => setTo(e.target.value)}
          style={filterStyle}
        />
        <select
          value={action}
          aria-label={t("audit.action")}
          onChange={(e) => setAction(e.target.value)}
          style={filterStyle}
        >
          <option value="">{t("audit.allActions")}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {historyAction(a, lang)}
            </option>
          ))}
        </select>
        <select
          value={user}
          aria-label={t("audit.user")}
          onChange={(e) => setUser(e.target.value)}
          style={filterStyle}
        >
          <option value="">{t("audit.allUsers")}</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {(from || to || action || user) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setAction("");
              setUser("");
            }}
          >
            {t("common.clear")}
          </Button>
        )}
      </div>

      {loadErr && (
        <Notice tone="error" style={{ marginBottom: 10 }}>
          {t("audit.loadFailed")} {loadErr}
        </Notice>
      )}
      {truncated && (
        <Notice tone="warning" style={{ marginBottom: 10 }}>
          {t("audit.truncated")}
        </Notice>
      )}
      {loading ? (
        <div style={{ fontSize: DS.fs.base, color: DS.text3 }}>{t("common.loading")}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: DS.fs.md,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord2 }}>
                {[
                  t("audit.col.date"),
                  t("audit.col.item"),
                  t("audit.col.action"),
                  t("audit.col.field"),
                  t("audit.col.change"),
                  t("audit.col.user"),
                ].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        color: DS.text3,
                        fontSize: DS.fs.xs,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid " + tint(DS.bord, 60) }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "monospace",
                      fontSize: DS.fs.sm,
                      color: DS.text3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(r.event_date.split("T")[0], lang)}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: DS.text,
                      fontWeight: 600,
                    }}
                  >
                    {r.itemName}
                  </td>
                  <td style={{ padding: "8px 10px", color: DS.text2 }}>
                    {historyAction(r.action, lang)}
                  </td>
                  <td style={{ padding: "8px 10px", color: DS.text3 }}>
                    {r.field_changed ? historyField(r.field_changed, lang) : "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "monospace",
                      fontSize: DS.fs.sm,
                      color: DS.text3,
                    }}
                  >
                    {historyValue(r.field_changed, r.prev_value, lang) +
                      " → " +
                      historyValue(r.field_changed, r.new_value, lang)}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontSize: DS.fs.sm,
                      color: DS.text3,
                    }}
                  >
                    {r.by_user_email ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
