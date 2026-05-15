import type { ReactNode } from "react";
import { DS } from "@/lib/design/tokens";

interface SectionProps {
  title: string;
  accent?: string;
  children: ReactNode;
}

export function Section({ title, accent = DS.blu, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 9,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: 2,
          fontWeight: 800,
          paddingBottom: 6,
          marginBottom: 14,
          borderBottom: "1px solid " + accent + "28",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
