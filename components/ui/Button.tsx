"use client";

import type { CSSProperties, ReactNode } from "react";
import { DS } from "@/lib/design/tokens";

type Variant = "primary" | "ghost" | "danger";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: DS.blu, color: "#fff", border: "none" },
  ghost: {
    background: "transparent",
    color: DS.text3,
    border: "1px solid " + DS.bord,
  },
  danger: {
    background: DS.redBg,
    color: DS.red,
    border: "1px solid " + DS.redBord,
  },
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  style,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...VARIANTS[variant],
        borderRadius: 8,
        padding: "10px 22px",
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        fontSize: 14,
        fontFamily: DS.sans,
        opacity: disabled ? 0.55 : 1,
        transition: DS.transition,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
