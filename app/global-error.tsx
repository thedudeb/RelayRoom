"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/empty/ErrorState";
import "./globals.css";

// Last-resort error boundary for failures in the root layout itself. Because it
// replaces the whole document when the normal layout can't render, it must
// supply its own <html>/<body>. Only ever shown in production builds.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RelayRoom] global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="global-error-shell">
          <ErrorState
            title="RelayRoom couldn't load."
            body="A fatal error happened before the workspace could render. Try reloading; if it persists, share the detail below."
            error={error}
            onReset={reset}
            homeHref="/"
            homeLabel="Back to landing"
          />
        </main>
      </body>
    </html>
  );
}
