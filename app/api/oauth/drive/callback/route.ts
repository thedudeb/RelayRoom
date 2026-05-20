import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { handleGoogleConnectionCallback } from "@/lib/oauth/google-connections";

export async function GET(request: NextRequest) {
  try {
    await handleGoogleConnectionCallback("drive", request.url);
  } catch (error) {
    // Next's redirect() throws a NEXT_REDIRECT signal — must re-throw or
    // the redirect never happens. Any other error is a real failure (DB
    // error, network blip, schema drift) and the user deserves to know
    // instead of hanging on the popup.
    if (error && typeof error === "object" && "digest" in error &&
        typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Drive OAuth callback failed.", error);
    redirect("/connections?error=ConnectionCallbackFailed");
  }
}
