"use client";

import { DS } from "@/lib/design/tokens";
import { fmtShort, today, isOverdue } from "@/lib/utils/format";
import { SYSTEMS } from "@/lib/utils/constants";
import { useShell } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";

// Subtle band tones for the two-tone header.
const TOP_BAND = DS.sbBg; // #2c3e52
const BOTTOM_BAND = "#243446"; // slightly darker, gives the banded look

export function Topbar() {
  const { toggleSidebar, sidebarCollapsed, sysFilter, setSysFilter } =
    useShell();
  const { allItems } = useData();
  const { t, tDept, lang, setLang } = useLang();

  const overdue = allItems.filter((i) => isOverdue(i.next_insp));
  const degraded = overdue.some((i) => i.sece);
  const attention = !degraded && overdue.length > 0;
  const healthy = !degraded && !attention;

  const chipColor = degraded ? DS.red : attention ? DS.ora : DS.grn;
  const chipBg = degraded ? DS.redBg : attention ? DS.oraBg : DS.grnBg;
  const chipBord = degraded
    ? DS.redBord
    : attention
      ? DS.oraBord
      : DS.grnBord;
  const chipText = degraded
    ? t("status.degraded")
    : attention
      ? t("status.attention")
      : t("status.healthy");

  return (
    <div
      style={{
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid " + DS.sbBord,
      }}
    >
      {/* ── Top band: title block ─────────────────────────────────────────── */}
      <div className="tb-band-top" style={{ background: TOP_BAND }}>
        {/* Row 1 — hamburger + title + status */}
        <div className="tb-row1">
          <div className="tb-left">
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
                <div style={{ width: 13, height: 2, background: "currentColor", borderRadius: 1 }} />
                <div style={{ width: 13, height: 2, background: "currentColor", borderRadius: 1 }} />
                <div style={{ width: 13, height: 2, background: "currentColor", borderRadius: 1 }} />
              </div>
            </button>
            <div
              className="tb-title"
              style={{ color: DS.sbTxt, fontFamily: DS.sans }}
            >
              {t("header.title")}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {/* Language toggle (EN | PT) */}
            <div
              role="group"
              aria-label="Language"
              style={{
                display: "inline-flex",
                background: "rgba(0,0,0,0.22)",
                border: "1px solid " + DS.sbBord,
                borderRadius: 6,
                padding: 2,
                gap: 0,
              }}
            >
              {(["en", "pt"] as const).map((l) => {
                const active = lang === l;
                return (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    aria-pressed={active}
                    style={{
                      background: active ? "#3b5570" : "transparent",
                      color: active ? "#ffffff" : DS.sbTxt2,
                      border: "none",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: DS.mono,
                      letterSpacing: 0.6,
                      cursor: "pointer",
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: chipBg,
                border: "1px solid " + chipBord,
                borderRadius: 8,
                padding: "4px 10px",
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
              {!healthy && (
                <span
                  className="tb-chip-extra"
                  aria-hidden
                  style={{
                    fontSize: 12,
                    lineHeight: 1,
                    color: chipColor,
                    fontWeight: 800,
                  }}
                >
                  ⚡
                </span>
              )}
              <span
                className="tb-chip-extra"
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
        </div>

        {/* Row 2 — subtitle + short date */}
        <div className="tb-row2">
          <div
            className="tb-sub"
            style={{ color: DS.sbTxt2, fontFamily: DS.mono }}
          >
            Noble Courage SS-75
          </div>
          <div
            style={{
              fontSize: 11,
              color: DS.sbTxt2,
              fontFamily: DS.mono,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            {fmtShort(today())}
          </div>
        </div>
      </div>

      {/* ── Bottom band: dept filter with pill selector ───────────────────── */}
      <div
        className="tb-band-bottom"
        style={{
          background: BOTTOM_BAND,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "nowrap",
          borderTop: "1px solid rgba(0,0,0,0.18)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: DS.sbTxt2,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {t("header.departments")}
        </span>
        <div
          role="group"
          aria-label="Department filter"
          className="tb-pills"
          style={{
            background: "rgba(0,0,0,0.22)",
            border: "1px solid " + DS.sbBord,
          }}
        >
          {SYSTEMS.map((s) => {
            const active = sysFilter === s;
            return (
              <button
                key={s}
                onClick={() => setSysFilter(s)}
                aria-pressed={active}
                className="tb-pill"
                style={{
                  background: active ? "#3b5570" : "transparent",
                  color: active ? "#ffffff" : DS.sbTxt2,
                  fontWeight: active ? 700 : 500,
                  fontFamily: DS.sans,
                  transition: DS.transition,
                }}
              >
                {tDept(s)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
