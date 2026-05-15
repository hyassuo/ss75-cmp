"use client";

import type { ReactNode } from "react";
import { S } from "@/lib/design/styles";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ onClose, children }: ModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        zIndex: 500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
