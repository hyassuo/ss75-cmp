"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DS } from "@/lib/design/tokens";
import { useShell } from "@/lib/context/ShellContext";
import { useData } from "@/lib/context/DataContext";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", icon: "▦", label: "Dashboard" },
  { href: "/zones", icon: "☰", label: "Zones & Items" },
  { href: "/risk-matrix", icon: "△", label: "Risk Matrix" },
  { href: "/schedule", icon: "◷", label: "Schedule" },
  { href: "/export", icon: "↗", label: "Export" },
  { href: "/users", icon: "◉", label: "Users", adminOnly: true },
  { href: "/audit-log", icon: "≡", label: "Audit Log", adminOnly: true },
];

export function Sidebar() {
  const { sidebarCollapsed } = useShell();
  const { profile } = useData();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = profile.role === "admin";
  const isReadOnly = profile.role === "viewer";
  const collapsed = sidebarCollapsed;

  async function signOut() {
    if (!confirm("Sign out?")) return;
    const supabase = createClient();
    await supabase.auth.signOut();
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

  return (
    <div
      style={{
        width: collapsed ? 56 : 196,
        background: DS.sbBg,
        borderRight: "1px solid " + DS.sbBord,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "hidden",
        transition: "width 0.22s ease",
      }}
    >
      <div style={{ padding: "16px 0" }}>
        {!collapsed && (
          <div
            style={{
              fontSize: 9,
              color: DS.sbTxt2,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              padding: "0 16px 10px",
            }}
          >
            NAVIGATION
          </div>
        )}
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              title={collapsed ? n.label : ""}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed ? "10px 0" : "10px 16px",
                justifyContent: collapsed ? "center" : "flex-start",
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
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.85 }}>{n.icon}</span>
              {!collapsed && <span>{n.label}</span>}
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
            <Link
              href="/zones"
              title={collapsed ? "New Item" : ""}
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
                background: DS.blu,
                color: "#fff",
                borderRadius: 6,
                padding: "9px 0",
                fontWeight: 700,
                fontSize: collapsed ? 14 : 12,
                fontFamily: DS.sans,
                whiteSpace: "nowrap",
              }}
            >
              {collapsed ? "+" : "+ New Item"}
            </Link>
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
          title={collapsed ? `${profile.role.toUpperCase()} — ${profile.full_name ?? ""}` : ""}
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
          title={collapsed ? "Sign out" : ""}
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
          {collapsed ? "⏻" : "⏻  Sign out"}
        </button>
      </div>
    </div>
  );
}
