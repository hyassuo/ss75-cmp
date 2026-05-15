"use client";

import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/context/DataContext";
import { PROB_LABELS, CONS_LABELS, PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import type { ItemWithRelations } from "@/lib/types/domain";

function cellClr(p: number, c: number): string {
  const v = p * c;
  return v >= 15 ? DS.red : v >= 8 ? DS.ora : v >= 4 ? DS.yel : DS.grn;
}

export function RiskMatrix() {
  const { zones, itemsByZone } = useData();
  const allItems: Array<ItemWithRelations & { zoneName: string }> = zones.flatMap(
    (z) => itemsByZone(z.zid).map((i) => ({ ...i, zoneName: z.name }))
  );
  const withRisk = allItems.filter((i) => i.prob && i.cons);

  if (!withRisk.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>△</div>
        <div
          style={{
            fontSize: 15,
            color: DS.text3,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          No items with risk assessment
        </div>
        <div style={{ fontSize: 13, color: DS.text3 }}>
          Edit items and fill in Probability and Consequence.
        </div>
      </div>
    );
  }

  const highRisk = withRisk
    .filter((i) => (i.prob || 0) * (i.cons || 0) >= 8)
    .sort(
      (a, b) =>
        (b.prob || 0) * (b.cons || 0) - (a.prob || 0) * (a.cons || 0)
    );

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Risk Matrix — API 580 / DNV-RP-G101
        </div>
        <div style={{ fontSize: 12, color: DS.text3, marginBottom: 20 }}>
          {withRisk.length} of {allItems.length} items assessed
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: "12%",
                    padding: "6px 4px",
                    fontSize: 10,
                    color: DS.text3,
                    textAlign: "left",
                  }}
                >
                  Prob / Cons
                </th>
                {CONS_LABELS.map((l, i) => (
                  <th
                    key={i}
                    style={{
                      width: "17.6%",
                      padding: "6px 4px",
                      fontSize: 10,
                      color: DS.text3,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 800,
                        marginBottom: 2,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: 9 }}>{l}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((p) => (
                <tr key={p}>
                  <td
                    style={{
                      padding: "4px 4px",
                      fontSize: 10,
                      color: DS.text3,
                      verticalAlign: "middle",
                      width: "12%",
                    }}
                  >
                    <div
                      style={{ fontFamily: "monospace", fontWeight: 800 }}
                    >
                      {p}
                    </div>
                    <div style={{ fontSize: 8 }}>{PROB_LABELS[p - 1]}</div>
                  </td>
                  {[1, 2, 3, 4, 5].map((c) => {
                    const clr = cellClr(p, c);
                    const its = withRisk.filter(
                      (i) => i.prob === p && i.cons === c
                    );
                    return (
                      <td
                        key={c}
                        style={{
                          padding: 3,
                          verticalAlign: "top",
                          width: "17.6%",
                        }}
                      >
                        <div
                          style={{
                            background: clr + "18",
                            border: "1px solid " + clr + "35",
                            borderRadius: 6,
                            minHeight: 52,
                            padding: "4px 5px",
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "monospace",
                              fontSize: 9,
                              color: clr,
                              fontWeight: 800,
                              marginBottom: 3,
                              opacity: 0.8,
                            }}
                          >
                            {p * c}
                          </div>
                          {its.map((it) => (
                            <div
                              key={it.id}
                              title={it.name}
                              style={{
                                fontSize: 9,
                                color: DS.text,
                                background: clr + "28",
                                borderRadius: 3,
                                padding: "2px 4px",
                                marginBottom: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {it.sece ? "[S] " : ""}
                              {(it.name || "").slice(0, 12)}
                              {(it.name || "").length > 12 ? "..." : ""}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          {[
            [DS.grn, "Low (RPN ≤ 3)"],
            [DS.yel, "Medium (RPN 4-7)"],
            [DS.ora, "High (RPN 8-14)"],
            [DS.red, "Critical (RPN ≥ 15)"],
          ].map((pair) => (
            <div
              key={pair[1]}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: pair[0],
                  borderRadius: 2,
                }}
              />
              <span style={{ fontSize: 11, color: DS.text3 }}>{pair[1]}</span>
            </div>
          ))}
        </div>
      </div>

      {highRisk.length > 0 && (
        <div style={S.card}>
          <div
            style={{
              fontSize: 11,
              color: DS.ora,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            High / Critical Risk Items (RPN ≥ 8)
          </div>
          {highRisk.map((it) => {
            const rpn = (it.prob || 0) * (it.cons || 0);
            const c = rpn >= 15 ? DS.red : DS.ora;
            return (
              <div
                key={it.id}
                style={{
                  background: DS.sur2,
                  borderRadius: 8,
                  padding: "11px 14px",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 7,
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 16,
                    fontWeight: 800,
                    color: c,
                    minWidth: 30,
                  }}
                >
                  {rpn}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: DS.text,
                    }}
                  >
                    {it.name || it.id}
                  </div>
                  <div style={{ fontSize: 11, color: DS.text3 }}>
                    {it.zoneName} | P:{it.prob} x C:{it.cons}
                  </div>
                </div>
                <div
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                >
                  {it.priority && (
                    <Badge
                      text={it.priority}
                      color={PRIORITY_COLOR[it.priority]}
                      sm
                    />
                  )}
                  {it.sece && <Badge text="SECE" color={DS.red} sm />}
                  <Badge
                    text={it.status}
                    color={STATUS_COLOR[it.status] || DS.text3}
                    sm
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
