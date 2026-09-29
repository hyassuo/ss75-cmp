"use client";

import { forwardRef, useId } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { FieldError } from "@/components/ui/FieldError";

interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
  /** Inline validation message; marks the field invalid for AT. */
  error?: string | null;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    value,
    onChange,
    type = "text",
    placeholder = "",
    disabled = false,
    mono = false,
    error,
    inputMode,
    autoComplete,
  },
  ref
) {
  const id = useId();
  const errId = id + "-err";
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <input
        ref={ref}
        id={id}
        type={type}
        value={value || ""}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...S.inp,
          ...(mono ? S.mono : {}),
          background: disabled ? DS.bg : DS.sur2,
          color: disabled ? DS.text3 : DS.text,
          ...(error ? { borderColor: DS.red } : {}),
        }}
      />
      {error ? <FieldError id={errId}>{error}</FieldError> : null}
    </div>
  );
});
