"use client";

import { useEffect, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { fmt, isOverdue, daysUntil } from "@/lib/utils/format";
import { calcRate } from "@/lib/domain/calcRate";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";

const COLLAPSE_KEY = "ss75.alerts.collapsed";

interface Alert {
  t: "danger" | "warn";
  msg: string;
}

export function AlertBar() {
  const { zones, itemsByZone } = useData();
  const { sysFilter } = useShell();
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

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
        onClick={toggle}
        role="button"
        aria-expanded={!collapsed}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "nowrap",
          padding: "10px 14px",
          background: DS.redBg,
          borderBottom: collapsed ? "none" : "1px solid " + DS.redBord,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Left: just the title. Counts move to the right cluster so they
            sit next to the total and the expand/collapse button. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            minWidth: 0,
            flex: 1,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: DS.red }}>
            {t("alert.title")}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {danger > 0 && (
            <span
              style={{
                background: DS.red,
                color: "#fff",
                borderRadius: 8,
                padding: "3px 8px",
                fontWeight: 700,
                lineHeight: 1.05,
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                flexShrink: 0,
                minWidth: 56,
                boxSizing: "border-box",
              }}
            >
              <span style={{ fontSize: 12 }}>{danger}</span>
              <span style={{ fontSize: 8, opacity: 0.9, marginTop: 1 }}>
                {t("alert.critical")}
              </span>
            </span>
          )}
          {warn > 0 && (
            <span
              style={{
                background: DS.ora,
                color: "#fff",
                borderRadius: 8,
                padding: "3px 8px",
                fontWeight: 700,
                lineHeight: 1.05,
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                flexShrink: 0,
                minWidth: 56,
                boxSizing: "border-box",
              }}
            >
              <span style={{ fontSize: 12 }}>{warn}</span>
              <span style={{ fontSize: 8, opacity: 0.9, marginTop: 1 }}>
                {t("alert.warning")}
              </span>
            </span>
          )}
          <span
            style={{
              background: DS.sur2,
              color: DS.text2,
              borderRadius: 8,
              padding: "3px 8px",
              fontWeight: 700,
              lineHeight: 1.05,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              flexShrink: 0,
              border: "1px solid " + DS.bord,
              minWidth: 56,
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 12 }}>{alerts.length}</span>
            <span style={{ fontSize: 8, opacity: 0.9, marginTop: 1 }}>
              {t("alert.total")}
            </span>
          </span>
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: DS.red,
              fontWeight: 800,
              background: "#fff",
              border: "1px solid " + DS.redBord,
              borderRadius: 6,
              transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.15s ease",
            }}
          >
            ▾
          </span>
        </div>
      </div>
      {!collapsed && (
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
      )}
    </div>
  );
}
