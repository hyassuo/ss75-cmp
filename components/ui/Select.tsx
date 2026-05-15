"use client";

import { S } from "@/lib/design/styles";
import { Label } from "@/components/ui/Label";

export interface SelectOption {
  v: string;
  l: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | SelectOption>;
}

export function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <Label>{label}</Label> : null}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={S.inp}
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.v;
          const l = typeof o === "string" ? o : o.l;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </div>
  );
}
