"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  children: ReactNode;
  /** compact: small centred card (confirmations), also on phones. */
  size?: "full" | "compact";
  /** "alertdialog" for confirmations that interrupt the user. */
  role?: "dialog" | "alertdialog";
  /** id of the element that describes the dialog (alertdialog message). */
  describedBy?: string;
  /** id of the element that names the dialog (its title). */
  labelledBy?: string;
  /**
   * Escape key. Route it through the same handler as the Cancel button so
   * unsaved-changes confirmations apply. Omit to ignore Escape.
   */
  onEscape?: () => void;
}

// Open modals, innermost last. Only the top one handles Escape / Tab, so a
// confirmation opened over the item modal doesn't also trigger the item
// modal's Escape (= Cancel). #app-root stays inert while any is open.
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  labelledBy,
  onEscape,
  role = "dialog",
  describedBy,
  size = "full",
}: ModalProps) {
  // Portal-mount only after hydration so SSR doesn't see a document.body
  // reference; also escapes any ancestor with position: fixed / transform
  // that would otherwise confine the modal to a corner on iOS Safari.
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus management: move focus into the dialog, keep Tab inside it, and
  // hand focus back to whatever opened it when it closes.
  useEffect(() => {
    if (!mounted) return;
    const card = cardRef.current;
    if (!card) return;
    const opener = document.activeElement as HTMLElement | null;
    const token = Symbol("modal");
    stack.push(token);
    // The page behind is inert for keyboard and assistive tech.
    const app = document.getElementById("app-root");
    app?.setAttribute("inert", "");
    app?.setAttribute("aria-hidden", "true");
    // A control marked data-autofocus (e.g. the safe choice of a
    // confirmation) gets focus; otherwise the dialog itself.
    const auto = card.querySelector<HTMLElement>("[data-autofocus]");
    (auto ?? card).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape" && escRef.current) {
        e.preventDefault();
        escRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        card.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) {
        app?.removeAttribute("inert");
        app?.removeAttribute("aria-hidden");
      }
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [mounted]);

  if (!mounted) return null;

  // No backdrop-click-to-close — too easy to lose half-filled forms by
  // accident. Each modal renders its own Cancel / close affordance.
  return createPortal(
    <div
      className={
        "modal-overlay" + (size === "compact" ? " modal-overlay--compact" : "")
      }
    >
      <div
        ref={cardRef}
        className={"modal-card" + (size === "compact" ? " modal-card--compact" : "")}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={{ outline: "none" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
