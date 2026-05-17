"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/empty/ErrorState";

export default function RouteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RelayRoom] route error:", error);
  }, [error]);

  return <ErrorState error={error} onReset={reset} />;
}
