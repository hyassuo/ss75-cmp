"use client";

import { DS } from "@/lib/design/tokens";
import { fmt, isOverdue, daysUntil } from "@/lib/utils/format";
import { calcRate } from "@/lib/domain/calcRate";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";

interface Alert {
  t: "danger" | "warn";
  msg: string;
}

export function AlertBar() {
  const { zones, itemsByZone } = useData();
  const { sysFilter } = useShell();
  const { t } = useLang();

  const visibleZones =
    sysFilter === "All"
      ? zones
      : zones.filter((z) => z.system === sysFilter);

  const alerts: Alert[] = [];
  for (const z of visibleZones) {
    for (const it of itemsByZone(z.zid)) {
      if (it.archived) continue;
      if (isOverdue(it.next_insp)) {
        alerts.push({
          t: "danger",
          msg: `${z.zid} | ${it.name}: ${t("alert.overdueSince")} ${fmt(it.next_insp)}`,
        });
      }
      const dd = daysUntil(it.next_insp);
      if (dd !== null && dd >= 0 && dd <= 30) {
        alerts.push({
          t: "warn",
          msg: `${z.zid} | ${it.name}: ${t("alert.dueIn")} ${dd} ${t("alert.days")}`,
        });
      }
      const rt = calcRate(it.readings);
      if (rt !== null && rt > 0.5) {
        alerts.push({
          t: "danger",
          msg: `${z.zid} | ${it.name}: ${t("alert.critRate")} ${rt.toFixed(3)} mm/yr`,
        });
      } else if (rt !== null && rt > 0.2) {
        alerts.push({
          t: "warn",
          msg: `${z.zid} | ${it.name}: ${t("alert.elevRate")} ${rt.toFixed(3)} mm/yr`,
        });
      }
    }
  }

  if (!alerts.length) return null;

  const danger = alerts.filter((a) => a.t === "danger").length;
  const warn = alerts.filter((a) => a.t === "warn").length;

  return (
    <div
      style={{
        marginBottom: 20,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid " + DS.redBord,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          background: DS.redBg,
          borderBottom: "1px solid " + DS.redBord,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: DS.red }}>
            {t("alert.title")}
          </span>
          {danger > 0 && (
            <span
              style={{
                background: DS.red,
                color: "#fff",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {danger} {t("alert.critical")}
            </span>
          )}
          {warn > 0 && (
            <span
              style={{
                background: DS.ora,
                color: "#fff",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {warn} {t("alert.warning")}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: DS.text3, marginLeft: 8 }}>
          {alerts.length} {t("alert.total")}
        </span>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {alerts.map((a, i) => {
          const isDanger = a.t === "danger";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "7px 12px",
                borderBottom:
                  i < alerts.length - 1
                    ? "1px solid " + (isDanger ? DS.redBord : DS.oraBord)
                    : "none",
                background: isDanger ? DS.redBg : DS.oraBg,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 800,
                  marginTop: 1,
                  background: isDanger ? DS.red : DS.ora,
                  color: "#fff",
                }}
              >
                {isDanger ? "!" : "~"}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: isDanger ? DS.red : "#92400e",
                  lineHeight: 1.5,
                }}
              >
                {a.msg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
