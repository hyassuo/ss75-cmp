"use client";

import { Plus } from "lucide-react";
import { DS } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import { TAB_ICONS } from "@/components/layout/navIcons";
import { useShell, type MainTab } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useNewItem } from "@/lib/context/NewItemContext";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";

const TABS: Array<{ tab: MainTab; i18n: DictKey }> = [
  { tab: "dashboard", i18n: "navShort.dashboard" },
  { tab: "zones", i18n: "navShort.zones" },
  { tab: "risk", i18n: "navShort.risk" },
  { tab: "schedule", i18n: "navShort.schedule" },
  { tab: "export", i18n: "navShort.export" },
];

// Phone navigation (768px and below, see globals.css): thumb-reachable tabs with
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
    fontSize: DS.fs.sm,
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
            className="nav-ctl"
            onClick={() => setTab(n.tab)}
            aria-current={active ? "page" : undefined}
            style={item(active)}
          >
            <Icon icon={TAB_ICONS[n.tab]} size="lg" />
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
          className="nav-ctl"
          onClick={openNewItem}
          aria-label={t("nav.newItem")}
          style={{ ...item(false), color: DS.onAccent }}
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
            }}
          >
            <Icon icon={Plus} size="lg" />
          </span>
        </button>
      )}
    </nav>
  );
}
