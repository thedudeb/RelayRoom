import { startGoogleConnection } from "@/lib/oauth/google-connections";

// Kicks off the YouTube OAuth flow (consent redirect). Same machinery as the
// Drive start route, but requests YouTube upload/read scopes instead.
export async function GET() {
  return startGoogleConnection("youtube");
}
