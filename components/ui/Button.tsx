import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { DS } from "@/lib/design/tokens";
import { Spinner } from "@/components/ui/Spinner";

export type ButtonVariant = "primary" | "accent" | "danger" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the main action · accent: AI / camera · danger: destructive ·
   *  secondary: bordered neutral · ghost: text only (close ×, links). */
  variant?: ButtonVariant;
  /** lg is a 44 px touch target everywhere. */
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Busy: a spinner before the label, clicks blocked, colours kept. */
  loading?: boolean;
}

// Filled variants; their text is DS.onAccent (dark text on the lighter
// accents of the dark theme), never a literal white.
const FILL: Partial<Record<ButtonVariant, string>> = {
  primary: DS.blu,
  accent: DS.vio,
  danger: DS.red,
};

// Minimum heights live in globals.css (.btn-sm/-md/-lg) so the 44 px
// touch rules there can still raise them.
const SIZE: Record<ButtonSize, CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: DS.fs.md, borderRadius: 6 },
  md: { padding: "7px 16px", fontSize: DS.fs.base, borderRadius: 7 },
  lg: { padding: "10px 22px", fontSize: DS.fs.lg, borderRadius: 8 },
};

function colours(variant: ButtonVariant): CSSProperties {
  const fill = FILL[variant];
  if (fill) return { background: fill, color: DS.onAccent, borderColor: fill };
  return variant === "secondary"
    ? { background: DS.sur, color: DS.text2, borderColor: DS.bord }
    : { background: "none", color: DS.text2, borderColor: "transparent" };
}

// Disabled look (wins over a caller's colours).
function disabledColours(variant: ButtonVariant): CSSProperties {
  return variant === "ghost"
    ? { color: DS.text3 }
    : { background: DS.bord, color: DS.text3, borderColor: DS.bord };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    disabled,
    type = "button",
    className,
    style,
    children,
    ...rest
  },
  ref
) {
  const off = !!disabled && !loading;
  // Filled buttons are main actions: 44 px tall on touch screens too
  // (.touch-target in globals.css).
  const touch = size !== "lg" && variant in FILL;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={["btn-" + size, touch ? "touch-target" : "", className ?? ""].join(" ").trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : undefined,
        borderWidth: 1,
        borderStyle: "solid",
        fontFamily: DS.sans,
        fontWeight: 700,
        cursor: disabled || loading ? "default" : "pointer",
        ...SIZE[size],
        ...colours(variant),
        ...style,
        ...(off ? disabledColours(variant) : null),
      }}
      {...rest}
    >
      {loading && <Spinner size={14} color="currentColor" />}
      {children}
    </button>
  );
});
