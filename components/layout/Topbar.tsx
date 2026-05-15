"use client";

import { DS } from "@/lib/design/tokens";
import { fmt, today, isOverdue } from "@/lib/utils/format";
import { SYSTEMS } from "@/lib/utils/constants";
import { useShell } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";

export function Topbar() {
  const { toggleSidebar, sidebarCollapsed, sysFilter, setSysFilter } =
    useShell();
  const { allItems } = useData();

  const overdue = allItems.filter((i) => isOverdue(i.next_insp));
  const degraded = overdue.some((i) => i.sece);
  const attention = !degraded && overdue.length > 0;

  const chipColor = degraded ? DS.red : attention ? DS.ora : DS.grn;
  const chipBg = degraded ? DS.redBg : attention ? DS.oraBg : DS.grnBg;
  const chipBord = degraded
    ? DS.redBord
    : attention
      ? DS.oraBord
      : DS.grnBord;
  const chipText = degraded
    ? "DEGRADED"
    : attention
      ? "ATTENTION"
      : "HEALTHY";

  return (
    <div
      style={{
        background: DS.sbBg,
        borderBottom: "1px solid " + DS.sbBord,
        flexShrink: 0,
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Row 1 — hamburger + title + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0 0",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              background: "transparent",
              border: "1px solid " + DS.sbBord,
              borderRadius: 5,
              width: 28,
              height: 28,
              cursor: "pointer",
              color: DS.sbTxt,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              transition: DS.transition,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  width: 13,
                  height: 2,
                  background: "currentColor",
                  borderRadius: 1,
                }}
              />
              <div
                style={{
                  width: 13,
                  height: 2,
                  background: "currentColor",
                  borderRadius: 1,
                }}
              />
              <div
                style={{
                  width: 13,
                  height: 2,
                  background: "currentColor",
                  borderRadius: 1,
                }}
              />
            </div>
          </button>
          <div
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: DS.sbTxt,
              fontFamily: DS.sans,
              letterSpacing: -0.3,
              lineHeight: 1.1,
            }}
          >
            Corrosion Management Plan
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: chipBg,
            border: "1px solid " + chipBord,
            borderRadius: 8,
            padding: "4px 12px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: chipColor,
              animation: "pulse-att 1.8s infinite",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              fontFamily: DS.mono,
              letterSpacing: 0.8,
              color: chipColor,
            }}
          >
            {chipText}
          </span>
        </div>
      </div>

      {/* Row 2 — subtitle + date */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1px 0 6px",
          gap: 12,
          flexWrap: "wrap",
          marginLeft: 40,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: DS.sbTxt2,
            textTransform: "uppercase",
            letterSpacing: 2,
            fontWeight: 600,
            fontFamily: DS.mono,
          }}
        >
          Noble Courage SS-75
        </div>
        <div
          style={{ fontSize: 11, color: DS.sbTxt2, fontFamily: DS.mono }}
        >
          {fmt(today())}
        </div>
      </div>

      {/* Row 3 — dept filter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          paddingBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: DS.sbTxt2,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginRight: 4,
          }}
        >
          DEPT
        </span>
        {SYSTEMS.map((s) => (
          <button
            key={s}
            onClick={() => setSysFilter(s)}
            style={{
              background: sysFilter === s ? DS.bord : "transparent",
              color: sysFilter === s ? DS.blu : DS.sbTxt2,
              border: "1px solid " + DS.sbBord,
              borderRadius: 20,
              padding: "3px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
