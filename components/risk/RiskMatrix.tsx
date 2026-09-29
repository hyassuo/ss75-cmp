"use client";

import { ArrowDown, ArrowRight, Circle, Diamond, Grid3x3, Info, Triangle, type LucideIcon } from "lucide-react";
import { S } from "@/lib/design/styles";
import { DS, tint } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { useData } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import type { ItemWithRelations } from "@/lib/types/domain";
import { effectivePriority } from "@/lib/domain/calcPriority";
import { useShell } from "@/lib/context/ShellContext";
import { useScopedZones } from "@/lib/hooks/useScopedZones";
import { pressable } from "@/lib/utils/a11y";

type Level = "Low" | "Medium" | "High" | "Critical";

function cellLevel(p: number, c: number): Level {
  const v = p * c;
  return v >= 15 ? "Critical" : v >= 8 ? "High" : v >= 4 ? "Medium" : "Low";
}

// Colour plus a shape per level: the four colours are close in brightness,
// so colour-blind users (and a phone in direct sunlight) read the shape:
// circle, diamond, triangle outline, solid triangle (SVG, not font glyphs).
// These are RPN bands of the matrix (risk.level.*), not the item Priority
// (calcPriority also weighs SECE and due dates), hence their own names.
const LEVEL: Record<
  Level,
  { color: string; shape: LucideIcon; filled: boolean; range: string }
> = {
  Low: { color: DS.grn, shape: Circle, filled: false, range: "RPN \u2264 3" },
  Medium: { color: DS.yel, shape: Diamond, filled: false, range: "RPN 4\u20137" },
  High: { color: DS.ora, shape: Triangle, filled: false, range: "RPN 8\u201314" },
  Critical: { color: DS.red, shape: Triangle, filled: true, range: "RPN \u2265 15" },
};

function LevelShape({ level }: { level: Level }) {
  const l = LEVEL[level];
  return <Icon icon={l.shape} filled={l.filled} size="sm" />;
}

export function RiskMatrix() {
  const { itemsByZone } = useData();
  const zones = useScopedZones();
  const { t, tPriority, tStatus } = useLang();
  const { openItem } = useShell();
  const allItems: Array<ItemWithRelations & { zoneName: string }> = zones.flatMap(
    (z) =>
      itemsByZone(z.zid)
        .filter((i) => !i.archived)
        .map((i) => ({ ...i, zoneName: z.name }))
  );
  const withRisk = allItems.filter((i) => i.prob && i.cons);

  if (!withRisk.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: "48px 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: DS.text3 }}>
          <Icon icon={Grid3x3} size="xl" />
        </div>
        <div
          style={{
            fontSize: DS.fs.xl,
            color: DS.text3,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >{t("risk.empty.title")}</div>
        <div style={{ fontSize: DS.fs.base, color: DS.text3 }}>{t("risk.empty.hint")}</div>
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
            fontSize: DS.fs.sm,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >{t("risk.title")}</div>
        <div
          style={{
            fontSize: DS.fs.md,
            color: DS.text3,
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>{t("risk.assessedOf", withRisk.length, allItems.length)}</span>
          <details style={{ fontSize: DS.fs.sm }}>
            <summary
              style={{
                cursor: "pointer",
                color: DS.blu,
                listStyle: "none",
                userSelect: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon icon={Info} size="sm" />
              {t("risk.legend")}
            </summary>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: DS.sur2,
                border: "1px solid " + DS.bord,
                borderRadius: 8,
                minWidth: 260,
                maxWidth: 360,
              }}
            >
              <div
                style={{
                  fontSize: DS.fs.xs,
                  fontWeight: 700,
                  color: DS.text3,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                {t("f.probability")}
              </div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={`p${n}`}
                  style={{
                    fontSize: DS.fs.sm,
                    color: DS.text2,
                    marginBottom: 3,
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 800,
                      minWidth: 14,
                    }}
                  >
                    {n}
                  </span>
                  <span>{t(`prob.${n}` as DictKey)}</span>
                </div>
              ))}
              <div
                style={{
                  fontSize: DS.fs.xs,
                  fontWeight: 700,
                  color: DS.text3,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginTop: 10,
                  marginBottom: 6,
                }}
              >
                {t("f.consequence")}
              </div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={`c${n}`}
                  style={{
                    fontSize: DS.fs.sm,
                    color: DS.text2,
                    marginBottom: 3,
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 800,
                      minWidth: 14,
                    }}
                  >
                    {n}
                  </span>
                  <span>{t(`cons.${n}` as DictKey)}</span>
                </div>
              ))}
            </div>
          </details>
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
                    width: "4%",
                    padding: "6px 4px",
                    fontSize: DS.fs.xs,
                    color: DS.text3,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {/* Axes: probability down the rows, consequence across. */}
                  <span
                    aria-hidden="true"
                    style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      P<Icon icon={ArrowDown} size="xs" />
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      C<Icon icon={ArrowRight} size="xs" />
                    </span>
                  </span>
                  <span className="sr-only">
                    {t("f.probability")} / {t("f.consequence")}
                  </span>
                </th>
                {[1, 2, 3, 4, 5].map((i) => (
                  <th
                    key={i}
                    style={{
                      width: "19.2%",
                      padding: "6px 4px",
                      fontSize: DS.fs.xs,
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
                      {i}
                    </div>
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
                      fontSize: DS.fs.xs,
                      color: DS.text3,
                      verticalAlign: "middle",
                      width: "4%",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontFamily: "monospace", fontWeight: 800 }}
                    >
                      {p}
                    </div>
                  </td>
                  {[1, 2, 3, 4, 5].map((c) => {
                    const level = cellLevel(p, c);
                    const clr = LEVEL[level].color;
                    const its = withRisk.filter(
                      (i) => i.prob === p && i.cons === c
                    );
                    return (
                      <td
                        key={c}
                        style={{
                          padding: 3,
                          verticalAlign: "top",
                          width: "19.2%",
                        }}
                      >
                        <div
                          style={{
                            background: tint(clr, 9),
                            border: "1px solid " + tint(clr, 21),
                            borderRadius: 6,
                            minHeight: 52,
                            padding: "4px 5px",
                          }}
                        >
                          <div
                            title={`${t(`risk.level.${level}`)} · RPN ${p * c}`}
                            style={{
                              fontFamily: "monospace",
                              fontSize: DS.fs.xs,
                              color: clr,
                              fontWeight: 800,
                              marginBottom: 3,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>{p * c}</span>
                            <LevelShape level={level} />
                            <span className="sr-only">{t(`risk.level.${level}`)}</span>
                          </div>
                          {its.map((it) => (
                            <div
                              key={it.id}
                              title={it.name}
                              {...pressable(() => openItem(it.id), it.name)}
                              style={{
                                fontSize: DS.fs.xs,
                                color: DS.text,
                                background: tint(clr, 16),
                                borderRadius: 3,
                                padding: "2px 4px",
                                marginBottom: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
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
          {(["Low", "Medium", "High", "Critical"] as const).map((lv) => (
            <div
              key={lv}
              style={{ display: "flex", gap: 6, alignItems: "center", color: LEVEL[lv].color }}
            >
              <LevelShape level={lv} />
              <span style={{ fontSize: DS.fs.sm, color: DS.text3 }}>
                {t(`risk.level.${lv}`)} ({LEVEL[lv].range})
              </span>
            </div>
          ))}
        </div>
      </div>

      {highRisk.length > 0 && (
        <div style={S.card}>
          <div
            style={{
              fontSize: DS.fs.sm,
              color: DS.ora,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >{t("risk.highTitle")}</div>
          {highRisk.map((it) => {
            const rpn = (it.prob || 0) * (it.cons || 0);
            const c = rpn >= 15 ? DS.red : DS.ora;
            return (
              <div
                key={it.id}
                {...pressable(() => openItem(it.id))}
                style={{
                  background: DS.sur2,
                  borderRadius: 8,
                  padding: "11px 14px",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 7,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: DS.fs.xl,
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
                      fontSize: DS.fs.base,
                      fontWeight: 700,
                      color: DS.text,
                    }}
                  >
                    {it.name || it.id}
                  </div>
                  <div style={{ fontSize: DS.fs.sm, color: DS.text3 }}>
                    {it.zoneName} | P:{it.prob} x C:{it.cons}
                  </div>
                </div>
                <div
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                >
                  {effectivePriority(it) && (
                    <Badge
                      text={tPriority(effectivePriority(it))}
                      color={PRIORITY_COLOR[effectivePriority(it)!]}
                      sm
                    />
                  )}
                  {it.sece && <Badge text="SECE" color={DS.red} sm />}
                  <Badge
                    text={tStatus(it.status)}
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
