import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "relayroom",
    timestamp: new Date().toISOString()
  });
}
