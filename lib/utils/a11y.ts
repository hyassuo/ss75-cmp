import type { KeyboardEvent } from "react";

// Makes a non-button element (e.g. a card whose layout needs block
// children, which <button> may not contain) operable like a button:
// focusable, announced as a button, activated by Enter and Space.
export function pressable(onPress: () => void, label?: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: onPress,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress();
      }
    },
  };
}
