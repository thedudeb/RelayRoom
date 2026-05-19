import { logGoogleApiError } from "@/lib/oauth/google-errors";

interface YouTubePlaylistResponse {
  error?: { code?: number; message?: string };
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
  }>;
}

interface CreatePlaylistResponse {
  error?: { code?: number; message?: string };
  id?: string;
  snippet?: { title?: string };
}

export interface YouTubePlaylistRef {
  id: string;
  name: string;
}

// Verify a playlist id belongs to the connected channel (and is therefore
// safe to route to). Used by the manual-route flow so the operator can pick
// any playlist on the channel — not just ones already referenced by an
// existing rule (SPEC §4.8 Edit-and-route).
export async function verifyChannelPlaylist({
  accessToken,
  playlistId
}: {
  accessToken: string;
  playlistId: string;
}): Promise<YouTubePlaylistRef | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
  url.searchParams.set("id", playlistId);
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "snippet");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as YouTubePlaylistResponse;

  if (!response.ok || payload.error) {
    logGoogleApiError("YouTube playlist verify failed.", response, payload);
    return null;
  }

  const match = payload.items?.find((item) => item.id === playlistId);
  if (!match?.id) {
    return null;
  }

  return { id: match.id, name: match.snippet?.title || "Untitled playlist" };
}

// Create a new playlist on the connected channel. Defaults to private until
// the operator explicitly publishes; this matches the pipeline default of
// unlisted uploads (SPEC §4.3 privacy).
export async function createChannelPlaylist({
  accessToken,
  title
}: {
  accessToken: string;
  title: string;
}): Promise<YouTubePlaylistRef> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      body: JSON.stringify({
        snippet: { title },
        status: { privacyStatus: "private" }
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );
  const payload = (await response.json()) as CreatePlaylistResponse;

  if (!response.ok || payload.error || !payload.id) {
    logGoogleApiError("YouTube playlist create failed.", response, payload);
    throw new Error(payload.error?.message || "PlaylistCreateFailed");
  }

  return { id: payload.id, name: payload.snippet?.title || title };
}
