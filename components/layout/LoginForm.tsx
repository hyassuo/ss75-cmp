"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin() {
    if (!email.trim() || !password) {
      setErr("Enter your email and password.");
      return;
    }
    setLoading(true);
    setErr("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      setErr(error.message || "Invalid email or password.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: DS.sbBg,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        // Push the card down a bit so it sits in the upper third rather
        // than dead-centre — feels balanced on phones (where the keyboard
        // would cover a centred card anyway) and reads as "form first".
        paddingTop: "12vh",
        fontFamily: DS.sans,
      }}
    >
      <div
        style={{
          background: DS.sur,
          borderRadius: 12,
          padding: "40px 44px",
          width: 360,
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          border: "1px solid " + DS.bord,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontSize: 10,
              color: DS.text3,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            SS-75 — Noble Courage
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: DS.text,
              fontFamily: DS.mono,
              letterSpacing: -0.3,
              marginBottom: 2,
            }}
          >
            CORROSION
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: DS.text,
              fontFamily: DS.mono,
              letterSpacing: -0.3,
              marginBottom: 16,
            }}
          >
            MANAGEMENT PLAN
          </div>
          <div
            style={{
              width: 40,
              height: 3,
              background: DS.blu,
              borderRadius: 2,
              margin: "0 auto",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Email</Label>
          <input
            type="email"
            value={email}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doLogin();
            }}
            placeholder="Enter your email"
            style={{ ...S.inp, height: 40, lineHeight: "38px", fontSize: 13 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Label>Password</Label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doLogin();
            }}
            placeholder="Enter your password"
            style={{ ...S.inp, height: 40, lineHeight: "38px", fontSize: 13 }}
          />
        </div>

        {err ? (
          <div
            style={{
              background: DS.redBg,
              border: "1px solid " + DS.redBord,
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: DS.red,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {err}
          </div>
        ) : null}

        <button
          onClick={() => void doLogin()}
          disabled={loading}
          style={{
            width: "100%",
            background: DS.blu,
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "11px 0",
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            fontSize: 14,
            fontFamily: DS.sans,
            transition: DS.transition,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {loading ? <Spinner size={14} /> : null}
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <div
          style={{
            marginTop: 20,
            fontSize: 10,
            color: DS.text3,
            textAlign: "center",
            lineHeight: 1.8,
          }}
        >
          Contact your administrator for access credentials.
        </div>
      </div>
    </div>
  );
}
