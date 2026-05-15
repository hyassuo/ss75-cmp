"use client";

import { useEffect } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        ...S.card,
        textAlign: "center",
        padding: "48px 24px",
        borderLeft: "3px solid " + DS.red,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
      <div
        style={{
          fontSize: 15,
          color: DS.text,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Something went wrong
      </div>
      <div
        style={{
          fontSize: 13,
          color: DS.text3,
          marginBottom: 20,
          maxWidth: 480,
          margin: "0 auto 20px",
        }}
      >
        {error.message || "An unexpected error occurred while loading this view."}
      </div>
      <button
        onClick={reset}
        style={{
          background: DS.blu,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 22px",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Try again
      </button>
    </div>
  );
}
