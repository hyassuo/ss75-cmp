"use client";

import { useEffect } from "react";
import { S } from "@/lib/design/styles";
import { TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { DS } from "@/lib/design/tokens";
import { Button } from "@/components/ui/Button";

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
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: DS.red }}>
        <Icon icon={TriangleAlert} size="xl" />
      </div>
      <div
        style={{
          fontSize: DS.fs.xl,
          color: DS.text,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {chunk ? "This screen couldn't be downloaded" : "Something went wrong"}
      </div>
      <div
        style={{
          fontSize: DS.fs.base,
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
      <Button size="lg" onClick={chunk ? () => window.location.reload() : reset}>
        {chunk ? "Reload" : "Try again"}
      </Button>
    </div>
  );
}
