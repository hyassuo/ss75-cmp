import type { LucideIcon } from "lucide-react";

// The app's only icon set: lucide-react, monochrome inline SVG stroked in
// currentColor (so an icon takes the colour of its button or link). One
// stroke weight and a small size scale keep the sidebar, bottom nav and
// buttons alike. Icons are decorative: the accessible name stays on the
// control (aria-label / title / visible text), never on the SVG.
export const ICON_SIZE = {
  xs: 12, // tight table headers
  sm: 14, // inline with 11-12px text (chips, hints, risk levels)
  md: 16, // buttons, form toggles
  lg: 20, // navigation (sidebar, bottom nav, top bar)
  xl: 32, // empty and error states
} as const;

export type IconSize = keyof typeof ICON_SIZE;

export function Icon({
  icon: Glyph,
  size = "md",
  filled = false,
}: {
  icon: LucideIcon;
  size?: IconSize;
  /** Solid shape (fill with currentColor), e.g. the critical risk level. */
  filled?: boolean;
}) {
  return (
    <Glyph
      size={ICON_SIZE[size]}
      strokeWidth={1.75}
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: "block" }}
    />
  );
}
