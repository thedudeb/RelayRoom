import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { handleGoogleConnectionCallback } from "@/lib/oauth/google-connections";

export async function GET(request: NextRequest) {
  try {
    await handleGoogleConnectionCallback("youtube", request.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error &&
        typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("YouTube OAuth callback failed.", error);
    redirect("/connections?error=ConnectionCallbackFailed");
  }
}
