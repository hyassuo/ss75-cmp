"use client";

import { useEffect, useState } from "react";
import { Menu, TriangleAlert } from "lucide-react";
import { DS } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import { fmtShort, today, isOverdue } from "@/lib/utils/format";
import { SYSTEMS } from "@/lib/utils/constants";
import { useShell } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";
import { ItemSearch } from "@/components/layout/ItemSearch";

// Subtle band tones for the two-tone header (dark in both themes).
const TOP_BAND = DS.sbBg;
const BOTTOM_BAND = DS.sbBand; // slightly darker, gives the banded look

export function Topbar() {
  // "Today" in the device's time zone: the server renders in UTC, so the
  // date is filled in after hydration (a server/browser mismatch between
  // 00:00 and 03:00 UTC for Brazil broke hydration).
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => setTodayLabel(fmtShort(today())), []);
  const { toggleSidebar, sidebarCollapsed, sysFilter, setSysFilter } =
    useShell();
  const { allItems, zones } = useData();
  const { t, tDept, lang, setLang } = useLang();

  // Same scope as the alert bar: active items of the selected department.
  const inScope = new Set(
    zones
      .filter((z) => sysFilter === "All" || z.system === sysFilter)
      .map((z) => z.zid)
  );
  const overdue = allItems.filter(
    (i) => !i.archived && inScope.has(i.zone_id) && isOverdue(i.next_insp)
  );
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
        {/* Row 1: hamburger + title + status */}
        <div className="tb-row1">
          <div className="tb-left">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={t("nav.menu")}
              aria-expanded={!sidebarCollapsed}
              style={{
                background: "transparent",
                border: "1px solid " + DS.sbBord,
                borderRadius: 6,
                width: 40,
                height: 40,
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
              <Icon icon={Menu} size="lg" />
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
                      background: active ? DS.sbAct : "transparent",
                      color: active ? "#ffffff" : DS.sbTxt2,
                      border: "none",
                      borderRadius: 4,
                      padding: "6px 10px",
                      minHeight: 32,
                      fontSize: DS.fs.xs,
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
                <span className="tb-chip-extra" style={{ color: chipColor }}>
                  <Icon icon={TriangleAlert} size="sm" />
                </span>
              )}
              <span
                className="tb-chip-extra"
                style={{
                  fontSize: DS.fs.xs,
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

        {/* Row 2: subtitle + short date */}
        <div className="tb-row2">
          <div
            className="tb-sub"
            style={{ color: DS.sbTxt2, fontFamily: DS.mono }}
          >
            Noble Courage SS-75
          </div>
          <div
            style={{
              fontSize: DS.fs.sm,
              color: DS.sbTxt2,
              fontFamily: DS.mono,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            {todayLabel}
          </div>
        </div>
      </div>

      {/* ── Bottom band: dept filter with pill selector + item search ─────── */}
      <div
        className="tb-band-bottom"
        style={{
          background: BOTTOM_BAND,
          display: "flex",
          alignItems: "center",
          gap: 10,
          // The search drops to its own line on narrow screens (globals.css).
          flexWrap: "wrap",
          borderTop: "1px solid rgba(0,0,0,0.18)",
        }}
      >
        <span
          style={{
            fontSize: DS.fs.sm,
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
                  background: active ? DS.sbAct : "transparent",
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
        <ItemSearch />
      </div>
    </div>
  );
}
