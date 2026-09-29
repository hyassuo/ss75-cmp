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

  // A screen's code that couldn't be downloaded: "Try again" would re-throw
  // the same cached failure, so reload the page instead.
  const chunk =
    error.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk|dynamically imported module/i.test(error.message);

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
        {chunk ? "This screen couldn't be downloaded" : "Something went wrong"}
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
        {/* Raw error messages can carry internals (SQL, stack details):
            show a generic line plus the digest the server log is keyed by. */}
        {chunk
          ? "Check the connection, then reload."
          : "An unexpected error occurred while loading this view."}
        {!chunk && error.digest ? ` (ref ${error.digest})` : ""}
      </div>
      <button
        onClick={chunk ? () => window.location.reload() : reset}
        style={{
          background: DS.blu,
          color: DS.onAccent,
          border: "none",
          borderRadius: 8,
          padding: "10px 22px",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        {chunk ? "Reload" : "Try again"}
      </button>
    </div>
  );
}
