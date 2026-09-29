import { DS } from "@/lib/design/tokens";

interface SpinnerProps {
  size?: number;
  color?: string;
}

// Default colour suits a spinner inside an accent (primary) button.
export function Spinner({ size = 16, color = DS.onAccent }: SpinnerProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
