"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  children: ReactNode;
  /** id of the element that names the dialog (its title). */
  labelledBy?: string;
  /**
   * Escape key. Route it through the same handler as the Cancel button so
   * unsaved-changes confirmations apply. Omit to ignore Escape.
   */
  onEscape?: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ children, labelledBy, onEscape }: ModalProps) {
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
    // The page behind is inert for keyboard and assistive tech.
    const app = document.getElementById("app-root");
    app?.setAttribute("inert", "");
    app?.setAttribute("aria-hidden", "true");
    card.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
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
      app?.removeAttribute("inert");
      app?.removeAttribute("aria-hidden");
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [mounted]);

  if (!mounted) return null;

  // No backdrop-click-to-close — too easy to lose half-filled forms by
  // accident. Each modal renders its own Cancel / close affordance.
  return createPortal(
    <div className="modal-overlay">
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={{ outline: "none" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
