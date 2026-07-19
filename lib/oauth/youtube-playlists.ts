import { assertGoogleIntegrationsEnabled } from "@/lib/google/integrations";
import { logGoogleApiError } from "@/lib/oauth/google-errors";

interface YouTubePlaylistResponse {
  error?: { code?: number; message?: string };
  items?: Array<{
    id?: string;
    snippet?: { channelId?: string; title?: string };
  }>;
}

interface YouTubeChannelResponse {
  error?: { code?: number; message?: string };
  items?: Array<{
    id?: string;
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
  assertGoogleIntegrationsEnabled();

  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("mine", "true");
  channelUrl.searchParams.set("part", "id");

  const channelResponse = await fetch(channelUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const channelPayload = (await channelResponse.json()) as YouTubeChannelResponse;

  if (!channelResponse.ok || channelPayload.error) {
    logGoogleApiError("YouTube channel verify failed.", channelResponse, channelPayload);
    return null;
  }

  const channelId = channelPayload.items?.find((item) => item.id)?.id;
  if (!channelId) {
    return null;
  }

  const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
  playlistUrl.searchParams.set("id", playlistId);
  playlistUrl.searchParams.set("part", "snippet");

  const playlistResponse = await fetch(playlistUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const playlistPayload = (await playlistResponse.json()) as YouTubePlaylistResponse;

  if (!playlistResponse.ok || playlistPayload.error) {
    logGoogleApiError("YouTube playlist verify failed.", playlistResponse, playlistPayload);
    return null;
  }

  const match = playlistPayload.items?.find((item) => item.id === playlistId);
  if (!match?.id || match.snippet?.channelId !== channelId) {
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
  assertGoogleIntegrationsEnabled();

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
