"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/empty/ErrorState";

// Next.js route-level error boundary. Catches render/runtime errors thrown by
// pages in this segment and shows the recoverable ErrorState; `reset` retries
// the failed render. Must be a client component (error boundaries are client-only).
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
