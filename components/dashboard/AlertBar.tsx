"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CircleAlert, Clock } from "lucide-react";
import { DS } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import { fmt, fmtNum, isOverdue, daysUntil, today } from "@/lib/utils/format";
import {
  calcRate,
  RATE_CRITICAL_MM_YR,
  RATE_ELEVATED_MM_YR,
} from "@/lib/domain/calcRate";
import { isActionOverdue } from "@/lib/domain/actionPlan";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";

const COLLAPSE_KEY = "ss75.alerts.collapsed";

interface Alert {
  t: "danger" | "warn";
  msg: string;
  itemId: string;
}

export function AlertBar() {
  const { zones, itemsByZone } = useData();
  const { sysFilter, openItem } = useShell();
  const { lang, t } = useLang();
  const [collapsed, setCollapsed] = useState(false);

  // Remembered per browser; with no stored choice it starts collapsed on
  // phones, where an expanded list would push the content off screen.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(COLLAPSE_KEY);
    } catch {
      // storage unavailable
    }
    setCollapsed(
      stored !== null
        ? stored === "1"
        : window.matchMedia("(max-width: 640px)").matches
    );
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
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
          msg: `${z.zid} | ${it.name}: ${t("alert.overdueSince")} ${fmt(it.next_insp, lang)}`,
          itemId: it.id,
        });
      }
      const dd = daysUntil(it.next_insp);
      if (dd !== null && dd >= 0 && dd <= 30) {
        alerts.push({
          t: "warn",
          msg: `${z.zid} | ${it.name}: ${t("alert.dueIn")} ${dd} ${t("alert.days")}`,
          itemId: it.id,
        });
      }
      if (isActionOverdue(it, today())) {
        alerts.push({
          t: "danger",
          msg: `${z.zid} | ${it.name}: ${t("alert.actionOverdue")} ${fmt(it.action_due, lang)} (${it.action_type})`,
          itemId: it.id,
        });
      }
      const rt = calcRate(it.readings);
      if (rt !== null && rt > RATE_CRITICAL_MM_YR) {
        alerts.push({
          t: "danger",
          msg: `${z.zid} | ${it.name}: ${t("alert.critRate")} ${fmtNum(rt, lang, 3)} mm/yr`,
          itemId: it.id,
        });
      } else if (rt !== null && rt > RATE_ELEVATED_MM_YR) {
        alerts.push({
          t: "warn",
          msg: `${z.zid} | ${it.name}: ${t("alert.elevRate")} ${fmtNum(rt, lang, 3)} mm/yr`,
          itemId: it.id,
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
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="alert-header"
        style={{
          width: "100%",
          border: "none",
          font: "inherit",
          textAlign: "left",
          padding: "10px 14px",
          background: DS.redBg,
          borderBottom: collapsed ? "none" : "1px solid " + DS.redBord,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Left: just the title. Counts move to the right cluster so they
            sit next to the total and the expand/collapse button. */}
        <div className="alert-header-title">
          <span style={{ fontSize: DS.fs.base, fontWeight: 700, color: DS.red }}>
            {t("alert.title")}
          </span>
        </div>
        <div className="alert-header-counts">
          {danger > 0 && (
            <span
              style={{
                background: DS.red,
                color: DS.onAccent,
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
              <span style={{ fontSize: DS.fs.md }}>{danger}</span>
              <span style={{ fontSize: DS.fs.xs, opacity: 0.9, marginTop: 1 }}>
                {t("alert.critical")}
              </span>
            </span>
          )}
          {warn > 0 && (
            <span
              style={{
                background: DS.ora,
                color: DS.onAccent,
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
              <span style={{ fontSize: DS.fs.md }}>{warn}</span>
              <span style={{ fontSize: DS.fs.xs, opacity: 0.9, marginTop: 1 }}>
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
            <span style={{ fontSize: DS.fs.md }}>{alerts.length}</span>
            <span style={{ fontSize: DS.fs.xs, opacity: 0.9, marginTop: 1 }}>
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
              color: DS.red,
              background: DS.sur,
              border: "1px solid " + DS.redBord,
              borderRadius: 6,
              transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <Icon icon={ChevronDown} size="md" />
          </span>
        </div>
      </button>
      {!collapsed && (
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {alerts.map((a, i) => {
          const isDanger = a.t === "danger";
          return (
            <button
              type="button"
              key={i}
              onClick={() => openItem(a.itemId)}
              style={{
                width: "100%",
                border: "none",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
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
                  display: "flex",
                  marginTop: 2,
                  color: isDanger ? DS.red : DS.ora,
                }}
              >
                <Icon icon={isDanger ? CircleAlert : Clock} size="md" />
              </span>
              <span
                style={{
                  fontSize: DS.fs.md,
                  color: isDanger ? DS.red : DS.ora,
                  lineHeight: 1.5,
                }}
              >
                {a.msg}
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
