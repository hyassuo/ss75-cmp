"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LogOut, Plus, ScrollText, Users, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { DS } from "@/lib/design/tokens";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TAB_ICONS } from "@/components/layout/navIcons";
import { useShell, type MainTab } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useNewItem } from "@/lib/context/NewItemContext";
import { createClient } from "@/lib/supabase/client";

import type { DictKey } from "@/lib/i18n/dict";
import { useLang } from "@/lib/context/LangContext";
import { useFeedback } from "@/lib/context/FeedbackContext";

interface LinkItem {
  href: string;
  icon: LucideIcon;
  i18n: DictKey;
}

const TABS: Array<{ tab: MainTab; i18n: DictKey }> = [
  { tab: "dashboard", i18n: "nav.dashboard" },
  { tab: "zones", i18n: "nav.zones" },
  { tab: "risk", i18n: "nav.risk" },
  { tab: "schedule", i18n: "nav.schedule" },
  { tab: "export", i18n: "nav.export" },
];

const ADMIN_LINKS: LinkItem[] = [
  { href: "/users", icon: Users, i18n: "nav.users" },
  { href: "/audit-log", icon: ScrollText, i18n: "nav.audit" },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, tab, setTab } = useShell();
  const { profile } = useData();
  const { openNewItem } = useNewItem();
  const { t } = useLang();
  const { confirm } = useFeedback();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = profile.role === "admin";
  const roleLabel = t(`role.${profile.role}`);
  const isReadOnly = profile.role === "viewer";
  const collapsed = sidebarCollapsed;
  const onMain = pathname === "/dashboard";

  // On phones the expanded sidebar is an overlay drawer: close it once the
  // user has picked a destination.
  function closeDrawer() {
    if (!collapsed && window.matchMedia("(max-width: 768px)").matches) {
      toggleSidebar();
    }
  }

  // Escape closes the phone drawer.
  useEffect(() => {
    if (collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(max-width: 768px)").matches) {
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [collapsed, toggleSidebar]);

  function goTab(t: MainTab) {
    setTab(t);
    closeDrawer();
  }

  async function signOut() {
    if (!(await confirm(t("nav.signOutConfirm")))) return;
    const supabase = createClient();
    // This device only: other devices keep their sessions.
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }

  const roleColor = isAdmin
    ? DS.vio
    : profile.role === "inspector"
      ? DS.blu
      : DS.text2;
  const roleBg = isAdmin
    ? DS.vioBg
    : profile.role === "inspector"
      ? DS.bluBg
      : DS.sur2;
  const roleBord = isAdmin
    ? DS.vioBord
    : profile.role === "inspector"
      ? DS.bluBord
      : DS.bord;

  const itemStyle = (active: boolean) => ({
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: collapsed ? "10px 0" : "10px 16px",
    justifyContent: collapsed ? ("center" as const) : ("flex-start" as const),
    cursor: "pointer",
    textDecoration: "none",
    background: active ? DS.sbAct : "transparent",
    borderLeft: active
      ? "3px solid " + DS.sbActTxt
      : "3px solid transparent",
    color: active ? DS.sbActTxt : DS.sbTxt,
    fontSize: DS.fs.md,
    fontWeight: active ? 600 : 400,
    fontFamily: DS.sans,
    transition: DS.transition,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    border: "none",
    width: "100%",
    textAlign: "left" as const,
  });

  return (
    <>
    {!collapsed && (
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label={t("common.close")}
        onClick={toggleSidebar}
      />
    )}
    <nav
      className="app-sidebar"
      data-collapsed={collapsed}
      aria-label={t("nav.main")}
      style={{
        width: collapsed ? 56 : 196,
        background: DS.sbBg,
        borderRight: "1px solid " + DS.sbBord,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overflowX: "hidden",
        transition: "width 0.22s ease",
      }}
    >
      <div style={{ padding: "12px 0" }}>
        {TABS.map((nav) => {
          const active = onMain && tab === nav.tab;
          const label = t(nav.i18n);
          return (
            <button
              key={nav.tab}
              onClick={() => goTab(nav.tab)}
              title={collapsed ? label : ""}
              aria-label={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              style={{ ...itemStyle(active), minHeight: 44 }}
            >
              <Icon icon={TAB_ICONS[nav.tab]} size="lg" />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
        {isAdmin &&
          ADMIN_LINKS.map((n) => {
            const active = pathname === n.href;
            const label = t(n.i18n);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={closeDrawer}
                title={collapsed ? label : ""}
                aria-label={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
                style={{ ...itemStyle(active), minHeight: 44 }}
              >
                <Icon icon={n.icon} size="lg" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}

        {!isReadOnly && (
          <div
            style={{
              margin: collapsed ? "12px 6px 0" : "12px 10px 0",
              borderTop: "1px solid " + DS.sbBord,
              paddingTop: 12,
            }}
          >
            <Button
              fullWidth
              onClick={() => {
                closeDrawer();
                openNewItem();
              }}
              title={collapsed ? t("nav.newItem") : ""}
              aria-label={collapsed ? t("nav.newItem") : undefined}
              style={{
                padding: "8px 0",
                fontSize: collapsed ? DS.fs.lg : DS.fs.md,
                whiteSpace: "nowrap",
              }}
            >
              {collapsed ? <Icon icon={Plus} size="lg" /> : t("nav.newItem")}
            </Button>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid " + DS.sbBord,
          padding: collapsed ? "10px 0" : "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: collapsed ? "center" : "stretch",
        }}
      >
        <div
          title={
            collapsed
              ? `${roleLabel.toUpperCase()}: ${profile.full_name ?? ""}`
              : ""
          }
          style={{
            background: roleBg,
            border: "1px solid " + roleBord,
            borderRadius: collapsed ? "50%" : 20,
            width: collapsed ? 28 : "auto",
            height: collapsed ? 28 : "auto",
            padding: collapsed ? 0 : "4px 12px",
            fontSize: collapsed ? DS.fs.md : DS.fs.xs,
            fontWeight: 700,
            fontFamily: DS.mono,
            color: roleColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textTransform: "uppercase",
            letterSpacing: collapsed ? 0 : 1,
          }}
        >
          {collapsed
            ? roleLabel.charAt(0).toUpperCase()
            : roleLabel.toUpperCase()}
        </div>
        {!collapsed && (
          <div
            style={{
              fontSize: DS.fs.sm,
              color: DS.sbTxt2,
              textAlign: "center",
              fontFamily: DS.sans,
            }}
          >
            {profile.full_name ?? profile.email}
          </div>
        )}
        <button
          onClick={() => void signOut()}
          title={collapsed ? t("nav.signOut") : ""}
          aria-label={collapsed ? t("nav.signOut") : undefined}
          style={{
            background: "transparent",
            border: "1px solid " + DS.sbBord,
            borderRadius: 6,
            padding: collapsed ? 0 : "6px 10px",
            cursor: "pointer",
            color: DS.sbTxt2,
            fontSize: collapsed ? DS.fs.lg : DS.fs.sm,
            fontFamily: DS.sans,
            transition: DS.transition,
            width: collapsed ? 28 : "100%",
            height: collapsed ? 28 : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon icon={LogOut} size={collapsed ? "md" : "sm"} />
          {!collapsed && t("nav.signOut")}
        </button>
      </div>
    </nav>
    </>
  );
}
