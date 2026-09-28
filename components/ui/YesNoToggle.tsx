"use client";

import { useId } from "react";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";

interface Props {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
  /** Visual tone of the "yes" state (a risk flag reads as a warning). */
  yesTone?: "warn" | "ok";
}

// Two-button toggle. State is conveyed by aria-pressed and a check mark,
// not by color alone.
export function YesNoToggle({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
  yesTone = "warn",
}: Props) {
  const id = useId();
  const tone = (on: boolean, isYes: boolean) => {
    if (!on) return { bg: DS.sur2, fg: DS.text3, bd: DS.bord };
    const warn = isYes ? yesTone === "warn" : yesTone !== "warn";
    return warn
      ? { bg: DS.oraBg, fg: DS.ora, bd: DS.ora }
      : { bg: DS.grnBg, fg: DS.grn, bd: DS.grn };
  };
  const btn = (isYes: boolean) => {
    const on = value === isYes;
    const c = tone(on, isYes);
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(isYes)}
        style={{
          flex: 1,
          background: c.bg,
          color: c.fg,
          border: (on ? "2px solid " : "1px solid ") + c.bd,
          borderRadius: 6,
          padding: "7px 0",
          minHeight: 36,
          fontSize: 12,
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        {on ? "✓ " : ""}
        {isYes ? yesLabel : noLabel}
      </button>
    );
  };
  return (
    <div>
      <Label id={id}>{label}</Label>
      <div role="group" aria-labelledby={id} style={{ display: "flex", gap: 8 }}>
        {btn(true)}
        {btn(false)}
      </div>
    </div>
  );
}
