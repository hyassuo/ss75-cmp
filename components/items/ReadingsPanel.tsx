"use client";

import { useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { fmt, today } from "@/lib/utils/format";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import type { Reading } from "@/lib/types/domain";

interface Props {
  readings: Reading[];
  onAdd: (r: {
    reading_date: string;
    depth_mm: number;
    location: string | null;
    checked_by: string | null;
  }) => void;
  onRemove: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function ReadingsPanel({
  readings,
  onAdd,
  onRemove,
  canEdit = true,
  canDelete = true,
}: Props) {
  const [date, setDate] = useState(today());
  const [depth, setDepth] = useState("");
  const [loc, setLoc] = useState("");
  const [tech, setTech] = useState("");

  const sorted = [...readings].sort((a, b) =>
    a.reading_date.localeCompare(b.reading_date)
  );
  const rate = calcRate(readings);

  function add() {
    if (!depth.trim()) return;
    onAdd({
      reading_date: date,
      depth_mm: parseFloat(depth),
      location: loc || null,
      checked_by: tech || null,
    });
    setDate(today());
    setDepth("");
    setLoc("");
    setTech("");
  }

  return (
    <div>
      {canEdit && (
      <div
        style={{
          background: DS.sur2,
          border: "1px solid " + DS.bord,
          borderRadius: 8,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            alignItems: "end",
            marginBottom: 10,
          }}
        >
          <div>
            <Label>Date</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <div>
            <Label>Pit Depth (mm)</Label>
            <input
              type="number"
              value={depth}
              placeholder="e.g. 1.5"
              onChange={(e) => setDepth(e.target.value)}
              style={{ ...S.inp, ...S.mono, marginBottom: 0 }}
            />
          </div>
          <div>
            <Label>Location / Point</Label>
            <input
              type="text"
              value={loc}
              placeholder="ex: FR-12 P/S"
              onChange={(e) => setLoc(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <Label>Checked by</Label>
            <input
              type="text"
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <button
            onClick={add}
            style={{
              background: DS.blu,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "0 22px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
              height: 36,
              boxSizing: "border-box",
              fontFamily: DS.sans,
            }}
          >
            + Reading
          </button>
        </div>
      </div>
      )}

      {rate !== null && (
        <div
          style={{
            background: DS.sur2,
            border: "2px solid " + rateColor(rate) + "50",
            borderRadius: 9,
            padding: "12px 16px",
            marginBottom: 12,
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: DS.text3,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 2,
              }}
            >
              Pit Growth Rate
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: rateColor(rate),
                fontFamily: "monospace",
                lineHeight: 1,
              }}
            >
              {rate.toFixed(3)}
              <span style={{ fontSize: 12, marginLeft: 3, fontWeight: 400 }}>
                mm/yr
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: rateColor(rate),
            }}
          >
            {rate > 0.5
              ? "CRITICAL - Immediate Action"
              : rate > 0.2
                ? "Severe - Increase Monitoring"
                : rate > 0
                  ? "Moderate - Monitor"
                  : "Stable"}
          </div>
        </div>
      )}

      {!sorted.length && (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: DS.bord2,
            padding: "12px 0",
          }}
        >
          No readings recorded yet
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord }}>
                {["Date", "Depth (mm)", "Change", "Location", "Inspector", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        color: DS.text3,
                        fontSize: 10,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const prev = i > 0 ? sorted[i - 1].depth_mm : null;
                const delta = prev !== null ? r.depth_mm - prev : null;
                const dClr =
                  delta === null
                    ? DS.text3
                    : delta > 0
                      ? DS.red
                      : delta < 0
                        ? DS.grn
                        : DS.text3;
                const dTxt =
                  delta === null
                    ? "-"
                    : (delta > 0 ? "+" : "") + delta.toFixed(2);
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: DS.text3,
                      }}
                    >
                      {fmt(r.reading_date)}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: DS.text,
                        fontWeight: 700,
                      }}
                    >
                      {r.depth_mm}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: dClr,
                      }}
                    >
                      {dTxt}
                    </td>
                    <td style={{ padding: "7px 8px", color: DS.text3 }}>
                      {r.location || "-"}
                    </td>
                    <td style={{ padding: "7px 8px", color: DS.text3 }}>
                      {r.checked_by || "-"}
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      {canDelete && (
                        <button
                          onClick={() => onRemove(r.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(192,57,43,0.5)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
