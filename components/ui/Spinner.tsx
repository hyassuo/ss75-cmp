interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 16, color = "#fff" }: SpinnerProps) {
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
