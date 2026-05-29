import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { handleGoogleConnectionCallback } from "@/lib/oauth/google-connections";

// OAuth redirect target for the YouTube flow. Google sends the user back here
// with an authorization code; the shared handler exchanges it for tokens and
// persists the connection, then redirects into the app.
export async function GET(request: NextRequest) {
  try {
    await handleGoogleConnectionCallback("youtube", request.url);
  } catch (error) {
    // `redirect()` works by throwing a NEXT_REDIRECT control-flow error. Let
    // those propagate untouched — catching them would swallow the redirect and
    // mislabel a successful flow as a failure.
    if (error && typeof error === "object" && "digest" in error &&
        typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("YouTube OAuth callback failed.", error);
    redirect("/connections?error=ConnectionCallbackFailed");
  }
}
