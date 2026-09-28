"use client";

import { useId } from "react";
import { S } from "@/lib/design/styles";
import { Label } from "@/components/ui/Label";

interface TextareaProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
}

export function Textarea({
  label,
  value,
  onChange,
  rows = 3,
  ariaLabel,
}: TextareaProps) {
  const id = useId();
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <textarea
        id={id}
        value={value || ""}
        rows={rows}
        aria-label={label ? undefined : ariaLabel}
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
