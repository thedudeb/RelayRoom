import { NextRequest } from "next/server";
import { handleGoogleConnectionCallback } from "@/lib/oauth/google-connections";

export async function GET(request: NextRequest) {
  await handleGoogleConnectionCallback("drive", request.url);
}
