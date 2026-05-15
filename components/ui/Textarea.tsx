"use client";

import { S } from "@/lib/design/styles";
import { Label } from "@/components/ui/Label";

interface TextareaProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}

export function Textarea({ label, value, onChange, rows = 3 }: TextareaProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <Label>{label}</Label> : null}
      <textarea
        value={value || ""}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...S.inp,
          height: "auto",
          minHeight: "auto",
          maxHeight: "none",
          padding: "9px 11px",
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />
    </div>
  );
}
