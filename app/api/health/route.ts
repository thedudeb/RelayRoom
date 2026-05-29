import { NextResponse } from "next/server";

// Liveness probe for uptime monitors and deploy health checks. Intentionally
// dependency-free (no DB/auth) so it stays green even when downstream services
// are degraded, and returns a timestamp to confirm the response isn't cached.
export function GET() {
  return NextResponse.json({
    ok: true,
    service: "relayroom",
    timestamp: new Date().toISOString()
  });
}
