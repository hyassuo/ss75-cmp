"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ onClose, children }: ModalProps) {
  // Portal-mount only after hydration so SSR doesn't see a document.body
  // reference; also escapes any ancestor with position: fixed / transform
  // that would otherwise confine the modal to a corner on iOS Safari.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  // No backdrop-click-to-close — too easy to lose half-filled forms by
  // accident. The card carries an X in the top-right, and consumers still
  // have their own Cancel button.
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="modal-close"
        >
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
