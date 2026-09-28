import { DS } from "@/lib/design/tokens";

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <div
      id={id}
      role="alert"
      style={{ color: DS.red, fontSize: 12, marginTop: 4 }}
    >
      {children}
    </div>
  );
}
