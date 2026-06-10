"use client";

import { useCallback, useEffect, useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { fmt } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/types/domain";

const ROLES: UserRole[] = ["admin", "inspector", "viewer"];
const ROLE_COLOR: Record<UserRole, string> = {
  admin: DS.vio,
  inspector: DS.blu,
  viewer: DS.text3,
};

export function UserTable({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [invite, setInvite] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    setRows((data as Profile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, body: unknown, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ t: "err", m: data.error || "Request failed" });
      } else {
        setMsg({ t: "ok", m: okMsg });
        await load();
      }
    } catch {
      setMsg({ t: "err", m: "Request failed" });
    }
    setBusy(false);
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: DS.text3 }}>Loading users…</div>;
  }

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Create User
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="email"
            value={invite}
            placeholder="e-mail@abc.com"
            onChange={(e) => setInvite(e.target.value)}
            style={{ ...S.inp, maxWidth: 280, marginBottom: 0 }}
          />
          <input
            type="password"
            value={newPassword}
            placeholder="Temporary password (min 8)"
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ ...S.inp, maxWidth: 240, marginBottom: 0 }}
          />
          <button
            onClick={() =>
              void call(
                "/api/users/create",
                { email: invite, password: newPassword },
                "User created."
              ).then(() => {
                setInvite("");
                setNewPassword("");
              })
            }
            disabled={busy || !invite || newPassword.length < 8}
            style={{
              background: DS.blu,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 20px",
              fontWeight: 700,
              cursor:
                busy || !invite || newPassword.length < 8
                  ? "default"
                  : "pointer",
              fontSize: 13,
              opacity: busy || !invite || newPassword.length < 8 ? 0.6 : 1,
            }}
          >
            Create
          </button>
        </div>
        {msg && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: msg.t === "ok" ? DS.grn : DS.red,
              background: msg.t === "ok" ? DS.grnBg : DS.redBg,
              border:
                "1px solid " + (msg.t === "ok" ? DS.grnBord : DS.redBord),
              borderRadius: 6,
              padding: "8px 12px",
            }}
          >
            {msg.m}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          Users ({rows.length})
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord2 }}>
                {["Email", "Name", "Role", "Dept", "Active", "Created", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        color: DS.text3,
                        fontSize: 10,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td style={{ padding: "8px 10px", color: DS.text }}>
                      {u.email}
                      {isSelf && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            color: DS.text3,
                          }}
                        >
                          (you)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", color: DS.text2 }}>
                      {u.full_name ?? "-"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <select
                        value={u.role}
                        disabled={busy || isSelf}
                        onChange={(e) =>
                          void call(
                            "/api/users/update",
                            { id: u.id, role: e.target.value },
                            "Role updated."
                          )
                        }
                        style={{
                          ...S.inp,
                          width: "auto",
                          height: 30,
                          lineHeight: "28px",
                          marginBottom: 0,
                          color: ROLE_COLOR[u.role],
                          fontWeight: 700,
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "8px 10px", color: DS.text3 }}>
                      {u.dept ?? "-"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge
                        text={u.active ? "ACTIVE" : "INACTIVE"}
                        color={u.active ? DS.grn : DS.text3}
                        sm
                      />
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: DS.text3,
                      }}
                    >
                      {fmt(u.created_at.split("T")[0])}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() =>
                            void call(
                              "/api/users/reset",
                              { email: u.email },
                              "Password reset email sent."
                            )
                          }
                          disabled={busy}
                          style={{
                            background: DS.sur2,
                            color: DS.blu,
                            border: "1px solid " + DS.bord,
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 11,
                            cursor: busy ? "default" : "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Reset PW
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() =>
                              void call(
                                "/api/users/update",
                                { id: u.id, active: !u.active },
                                u.active
                                  ? "User deactivated."
                                  : "User activated."
                              )
                            }
                            disabled={busy}
                            style={{
                              background: u.active ? DS.redBg : DS.grnBg,
                              color: u.active ? DS.red : DS.grn,
                              border:
                                "1px solid " +
                                (u.active ? DS.redBord : DS.grnBord),
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 11,
                              cursor: busy ? "default" : "pointer",
                              fontWeight: 600,
                            }}
                          >
                            {u.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {!isSelf && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete user ${u.email}? This permanently removes the account and cannot be undone.`
                                )
                              ) {
                                void call(
                                  "/api/users/delete",
                                  { id: u.id },
                                  "User deleted."
                                );
                              }
                            }}
                            disabled={busy}
                            style={{
                              background: DS.red,
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 11,
                              cursor: busy ? "default" : "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
