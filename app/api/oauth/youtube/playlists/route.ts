import { ConnectionKind, ConnectionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { markConnectionRefreshFailed } from "@/lib/oauth/connection-health";
import { logGoogleApiError } from "@/lib/oauth/google-errors";
import { rejectCrossSiteMutation, rejectCrossSiteRead } from "@/lib/security/request-guard";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";

interface GoogleRefreshResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface YouTubePlaylistResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
  }>;
  nextPageToken?: string;
}

interface CreatePlaylistResponse {
  error?: {
    message?: string;
  };
  id?: string;
  snippet?: {
    title?: string;
  };
}

export async function GET(request: NextRequest) {
  const originError = rejectCrossSiteRead(request);
  if (originError) {
    return originError;
  }

  const context = await getYouTubeConnectionContext(request);
  if (context instanceof NextResponse) {
    return context;
  }

  const playlists = await fetchYouTubePlaylists(context.accessToken);
  return NextResponse.json({ playlists });
}

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteMutation(request);
  if (originError) {
    return originError;
  }

  const context = await getYouTubeConnectionContext(request);
  if (context instanceof NextResponse) {
    return context;
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "MissingPlaylistTitle" }, { status: 400 });
  }

  const existingPlaylist = (await fetchYouTubePlaylists(context.accessToken)).find(
    (playlist) => playlist.title.trim().toLowerCase() === title.toLowerCase()
  );

  if (existingPlaylist) {
    return NextResponse.json({ playlist: existingPlaylist, reused: true });
  }

  const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
    body: JSON.stringify({
      snippet: { title },
      status: { privacyStatus: "private" }
    }),
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const payload = (await response.json()) as CreatePlaylistResponse;

  if (!response.ok || payload.error || !payload.id) {
    logGoogleApiError("YouTube playlist create failed.", response, payload);
    return NextResponse.json({ error: "PlaylistCreateFailed" }, { status: 502 });
  }

  return NextResponse.json({
    playlist: {
      id: payload.id,
      title: payload.snippet?.title || title
    }
  });
}

async function getYouTubeConnectionContext(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { disabledAt: true, id: true }
  });

  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    return NextResponse.json({ error: "MissingTokenKey" }, { status: 400 });
  }

  const connectionId = request.nextUrl.searchParams.get("connectionId");
  const youtubeConnection = await prisma.oAuthConnection.findFirst({
    where: {
      id: connectionId || undefined,
      kind: ConnectionKind.YOUTUBE,
      status: ConnectionStatus.ACTIVE,
      userId: user.id
    },
    orderBy: { connectedAt: "desc" }
  });

  if (!youtubeConnection?.encryptedAccessToken || !youtubeConnection.encryptedRefreshToken) {
    return NextResponse.json({ error: "MissingYouTubeConnection" }, { status: 400 });
  }

  const accessToken = await getUsableYouTubeAccessToken(youtubeConnection, tokenKey);
  if (!accessToken) {
    return NextResponse.json({ error: "TokenRefreshFailed" }, { status: 502 });
  }

  return { accessToken };
}

async function fetchYouTubePlaylists(accessToken: string) {
  const playlists: Array<{ id: string; title: string }> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("mine", "true");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = (await response.json()) as YouTubePlaylistResponse;

    if (!response.ok) {
      logGoogleApiError("YouTube playlist fetch failed.", response, payload);
      return playlists;
    }

    for (const item of payload.items || []) {
      if (item.id && item.snippet?.title) {
        playlists.push({ id: item.id, title: item.snippet.title });
      }
    }

    pageToken = payload.nextPageToken;
  } while (pageToken);

  return playlists;
}

async function getUsableYouTubeAccessToken(
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    expiresAt: Date | null;
    id: string;
  },
  tokenKey: string
) {
  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey);
  }

  const clientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken, tokenKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = (await response.json()) as GoogleRefreshResponse;

  if (!response.ok || !payload.access_token || payload.error) {
    logGoogleApiError("YouTube token refresh failed.", response, payload);
    await markConnectionRefreshFailed({
      connectionId: connection.id,
      kind: ConnectionKind.YOUTUBE,
      message: "YouTube token refresh failed. Reconnect YouTube and enable affected pipelines."
    });
    return null;
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptToken(payload.access_token, tokenKey),
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : connection.expiresAt
    }
  });

  return payload.access_token;
}
