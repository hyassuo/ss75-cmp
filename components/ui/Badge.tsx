import { DS, tint } from "@/lib/design/tokens";
interface BadgeProps {
  text: string;
  color: string;
  sm?: boolean;
}

export function Badge({ text, color, sm }: BadgeProps) {
  return (
    <span
      style={{
        background: tint(color, 13),
        color,
        border: "1px solid " + tint(color, 27),
        borderRadius: 5,
        padding: sm ? "2px 7px" : "3px 10px",
        fontSize: sm ? DS.fs.xs : DS.fs.sm,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}
