import { NextRequest, NextResponse } from "next/server";
import { isRelayRoomApiKey } from "@/lib/security/api-keys";

const SAME_SITE_FETCH_VALUES = new Set(["none", "same-origin", "same-site"]);

export function rejectCrossSiteMutation(request: NextRequest) {
  if (hasApiKeyAuthorization(request)) {
    return null;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return sameOrigin(origin, request.nextUrl.origin)
      ? null
      : NextResponse.json({ error: "InvalidRequestOrigin" }, { status: 403 });
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && !SAME_SITE_FETCH_VALUES.has(fetchSite)) {
    return NextResponse.json({ error: "InvalidRequestOrigin" }, { status: 403 });
  }

  return NextResponse.json({ error: "MissingRequestOrigin" }, { status: 403 });
}

// Same-site check for GETs that have side effects (e.g. quota-burning calls to
// upstream APIs). Permits top-level navigations (sec-fetch-site=none) so users
// can hit the URL directly; blocks cross-site/cross-origin embedded fetches.
export function rejectCrossSiteRead(request: NextRequest) {
  if (hasApiKeyAuthorization(request)) {
    return null;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite) {
    if (fetchSite === "cross-site") {
      return NextResponse.json({ error: "InvalidRequestOrigin" }, { status: 403 });
    }
    return null;
  }

  const origin = request.headers.get("origin");
  if (origin && !sameOrigin(origin, request.nextUrl.origin)) {
    return NextResponse.json({ error: "InvalidRequestOrigin" }, { status: 403 });
  }

  return null;
}

function hasApiKeyAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return isRelayRoomApiKey(token);
}

function sameOrigin(origin: string, expectedOrigin: string) {
  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
