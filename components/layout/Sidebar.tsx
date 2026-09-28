"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DS } from "@/lib/design/tokens";
import { useShell, type MainTab } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { useNewItem } from "@/lib/context/NewItemContext";
import { createClient } from "@/lib/supabase/client";

import type { DictKey } from "@/lib/i18n/dict";
import { useLang } from "@/lib/context/LangContext";
import { useFeedback } from "@/lib/context/FeedbackContext";

interface TabItem {
  tab: MainTab;
  icon: string;
  i18n: DictKey;
}
interface LinkItem {
  href: string;
  icon: string;
  i18n: DictKey;
}

const TABS: TabItem[] = [
  { tab: "dashboard", icon: "▦", i18n: "nav.dashboard" },
  { tab: "zones", icon: "☰", i18n: "nav.zones" },
  { tab: "risk", icon: "△", i18n: "nav.risk" },
  { tab: "schedule", icon: "◷", i18n: "nav.schedule" },
  { tab: "export", icon: "↗", i18n: "nav.export" },
];

const ADMIN_LINKS: LinkItem[] = [
  { href: "/users", icon: "◉", i18n: "nav.users" },
  { href: "/audit-log", icon: "≡", i18n: "nav.audit" },
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
    // This device only — other devices keep their sessions.
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
    fontSize: 12,
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
              <span style={{ fontSize: 14, opacity: 0.85 }}>{nav.icon}</span>
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
                <span style={{ fontSize: 14, opacity: 0.85 }}>{n.icon}</span>
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
            <button
              onClick={() => {
                closeDrawer();
                openNewItem();
              }}
              title={collapsed ? t("nav.newItem") : ""}
              aria-label={collapsed ? t("nav.newItem") : undefined}
              style={{
                display: "block",
                textAlign: "center",
                background: DS.blu,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "9px 0",
                fontWeight: 700,
                fontSize: collapsed ? 14 : 12,
                fontFamily: DS.sans,
                whiteSpace: "nowrap",
                width: "100%",
                cursor: "pointer",
              }}
            >
              {collapsed ? "+" : t("nav.newItem")}
            </button>
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
              ? `${profile.role.toUpperCase()} — ${profile.full_name ?? ""}`
              : ""
          }
          style={{
            background: roleBg,
            border: "1px solid " + roleBord,
            borderRadius: collapsed ? "50%" : 20,
            width: collapsed ? 28 : "auto",
            height: collapsed ? 28 : "auto",
            padding: collapsed ? 0 : "4px 12px",
            fontSize: collapsed ? 12 : 10,
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
            ? profile.role.charAt(0).toUpperCase()
            : profile.role.toUpperCase()}
        </div>
        {!collapsed && (
          <div
            style={{
              fontSize: 11,
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
            fontSize: collapsed ? 14 : 11,
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
          {collapsed ? "⏻" : t("nav.signOut")}
        </button>
      </div>
    </nav>
    </>
  );
}
