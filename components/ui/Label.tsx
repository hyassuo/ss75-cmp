import type { ReactNode } from "react";
import { S } from "@/lib/design/styles";

// Always pass htmlFor when the label names a control, so screen readers
// announce it and tapping the label focuses the field.
export function Label({
  children,
  htmlFor,
  id,
}: {
  children: ReactNode;
  htmlFor?: string;
  id?: string;
}) {
  return (
    <label style={S.lbl} htmlFor={htmlFor} id={id}>
      {children}
    </label>
  );
}
