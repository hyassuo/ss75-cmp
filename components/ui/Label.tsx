import type { ReactNode } from "react";
import { S } from "@/lib/design/styles";

export function Label({ children }: { children: ReactNode }) {
  return <label style={S.lbl}>{children}</label>;
}
