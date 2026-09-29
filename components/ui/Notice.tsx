import type { CSSProperties, ReactNode } from "react";
import { DS } from "@/lib/design/tokens";

export type NoticeTone = "error" | "info" | "success" | "warning";

const TONE: Record<NoticeTone, { fg: string; bg: string; bd: string }> = {
  error: { fg: DS.red, bg: DS.redBg, bd: DS.redBord },
  info: { fg: DS.blu, bg: DS.bluBg, bd: DS.bluBord },
  success: { fg: DS.grn, bg: DS.grnBg, bd: DS.grnBord },
  warning: { fg: DS.ora, bg: DS.oraBg, bd: DS.oraBord },
};

interface NoticeProps {
  tone: NoticeTone;
  /** Live-region role: "alert" for errors, "status" otherwise by default;
   *  null for a box that is not a message (e.g. a static hint). */
  role?: "alert" | "status" | null;
  id?: string;
  /** Layout extras (margins, flex for inline buttons, alignment). */
  style?: CSSProperties;
  children: ReactNode;
}

// Tinted message box: errors, info, success and warnings.
export function Notice({ tone, role, id, style, children }: NoticeProps) {
  const c = TONE[tone];
  return (
    <div
      id={id}
      role={(role === undefined ? (tone === "error" ? "alert" : "status") : role) ?? undefined}
      style={{
        background: c.bg,
        border: "1px solid " + c.bd,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: DS.fs.md,
        lineHeight: 1.5,
        color: c.fg,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
