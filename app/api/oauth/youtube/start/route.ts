import { startGoogleConnection } from "@/lib/oauth/google-connections";

export async function GET() {
  return startGoogleConnection("youtube");
}
