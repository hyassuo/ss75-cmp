import { DS } from "@/lib/design/tokens";
import { integrityColor } from "@/lib/domain/itemScore";

interface GaugeProps {
  score: number | null;
  size?: number;
}

export function Gauge({ score, size = 52 }: GaugeProps) {
  if (score === null) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "3px solid #dde3ec",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, color: DS.text3 }}>N/A</span>
      </div>
    );
  }
  const c = integrityColor(score);
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={DS.bord}
          strokeWidth={size > 48 ? 5 : 4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={size > 48 ? 5 : 4}
          strokeDasharray={dash + " " + (circ - dash)}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: size > 48 ? 13 : 10,
            fontWeight: 800,
            color: c,
            fontFamily: "monospace",
          }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}
