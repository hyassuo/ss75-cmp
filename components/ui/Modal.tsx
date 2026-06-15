"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  children: ReactNode;
}

export function Modal({ children }: ModalProps) {
  // Portal-mount only after hydration so SSR doesn't see a document.body
  // reference; also escapes any ancestor with position: fixed / transform
  // that would otherwise confine the modal to a corner on iOS Safari.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  // No backdrop-click-to-close — too easy to lose half-filled forms by
  // accident. Each modal renders its own Cancel / close affordance.
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card">{children}</div>
    </div>,
    document.body
  );
}
