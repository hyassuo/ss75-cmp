"use client";

import { useEffect, useMemo, useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { fmt, today } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { HistoryEntry } from "@/lib/types/domain";

type Row = HistoryEntry & { itemName: string };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("history")
        .select("*, items(name)")
        .order("event_date", { ascending: false })
        .limit(1000);
      const raw = (data as unknown as Array<
        HistoryEntry & { items: { name: string } | null }
      >) ?? [];
      if (active) {
        setRows(
          raw.map((r) => ({ ...r, itemName: r.items?.name ?? r.item_id }))
        );
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
    const d = r.event_date.split("T")[0];
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (action && r.action !== action) return false;
    if (user && r.by_user_email !== user) return false;
    return true;
  });

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
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          r.event_date,
          r.itemName,
          r.action,
          r.field_changed ?? "",
          r.prev_value ?? "",
          r.new_value ?? "",
          r.note ?? "",
          r.by_user_email ?? "",
        ]
          .map(esc)
          .join(",")
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
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
          }}
        >
          Audit Log ({filtered.length})
        </div>
        <button
          onClick={exportCSV}
          disabled={!filtered.length}
          style={{
            background: DS.blu,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontWeight: 700,
            cursor: filtered.length ? "pointer" : "default",
            fontSize: 12,
            opacity: filtered.length ? 1 : 0.6,
          }}
        >
          Export CSV
        </button>
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
          onChange={(e) => setFrom(e.target.value)}
          style={filterStyle}
        />
        <span style={{ color: DS.text3, fontSize: 12 }}>→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={filterStyle}
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={filterStyle}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={user}
          onChange={(e) => setUser(e.target.value)}
          style={filterStyle}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {(from || to || action || user) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setAction("");
              setUser("");
            }}
            style={{
              background: DS.sur2,
              color: DS.text3,
              border: "1px solid " + DS.bord,
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: DS.text3 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord2 }}>
                {["Date", "Item", "Action", "Field", "Prev → New", "User"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        color: DS.text3,
                        fontSize: 10,
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
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: DS.text3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(r.event_date.split("T")[0])}
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
                    {r.action.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "8px 10px", color: DS.text3 }}>
                    {r.field_changed ?? "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: DS.text3,
                    }}
                  >
                    {(r.prev_value ?? "—") + " → " + (r.new_value ?? "—")}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontSize: 11,
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
