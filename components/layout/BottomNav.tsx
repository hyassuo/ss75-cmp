"use client";

import { DS } from "@/lib/design/tokens";
import { useShell, type MainTab } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useNewItem } from "@/lib/context/NewItemContext";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";

const TABS: Array<{ tab: MainTab; icon: string; i18n: DictKey }> = [
  { tab: "dashboard", icon: "▦", i18n: "navShort.dashboard" },
  { tab: "zones", icon: "☰", i18n: "navShort.zones" },
  { tab: "risk", icon: "△", i18n: "navShort.risk" },
  { tab: "schedule", icon: "◷", i18n: "navShort.schedule" },
  { tab: "export", icon: "↗", i18n: "navShort.export" },
];

// Phone navigation (≤768px, see globals.css): thumb-reachable tabs with
// labels, 56px tall. The sidebar becomes an overlay drawer behind the
// hamburger for the admin pages and sign-out.
export function BottomNav() {
  const { tab, setTab } = useShell();
  const { profile } = useData();
  const { openNewItem } = useNewItem();
  const { t } = useLang();
  const canCreate = profile.role !== "viewer";

  const item = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    background: "transparent",
    border: "none",
    borderTop: "3px solid " + (active ? DS.sbActTxt : "transparent"),
    color: active ? DS.sbActTxt : DS.sbTxt,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontSize: 11,
    fontWeight: active ? 700 : 500,
    fontFamily: DS.sans,
    cursor: "pointer",
    padding: "4px 2px",
  });

  return (
    <nav
      className="bottom-nav"
      aria-label={t("nav.main")}
      style={{
        flexShrink: 0,
        background: DS.sbBg,
        borderTop: "1px solid " + DS.sbBord,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((n) => {
        const active = tab === n.tab;
        return (
          <button
            key={n.tab}
            type="button"
            onClick={() => setTab(n.tab)}
            aria-current={active ? "page" : undefined}
            style={item(active)}
          >
            <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>
              {n.icon}
            </span>
            <span
              style={{
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t(n.i18n)}
            </span>
          </button>
        );
      })}
      {canCreate && (
        <button
          type="button"
          onClick={openNewItem}
          aria-label={t("nav.newItem")}
          style={{ ...item(false), color: "#fff" }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: DS.blu,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            +
          </span>
        </button>
      )}
    </nav>
  );
}
