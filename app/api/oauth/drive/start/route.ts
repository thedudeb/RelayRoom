import { startGoogleConnection } from "@/lib/oauth/google-connections";

// Kicks off the Drive OAuth flow: builds the Google consent URL (with state +
// the right scopes) and redirects the user to it. The matching callback route
// completes the exchange.
export async function GET() {
  return startGoogleConnection("drive");
}
