"use client";

import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";

interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  disabled = false,
  mono = false,
}: InputProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <Label>{label}</Label> : null}
      <input
        type={type}
        value={value || ""}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...S.inp,
          ...(mono ? S.mono : {}),
          background: disabled ? "#eef2f7" : DS.sur2,
          color: disabled ? DS.text3 : DS.text,
        }}
      />
    </div>
  );
}
