import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { encryptToken } from "@/lib/security/token-vault";

export type GoogleConnectionKind = "drive" | "youtube";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
}

interface YouTubeChannelResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      customUrl?: string;
      title?: string;
    };
  }>;
}

const connectionConfig = {
  drive: {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    envPrefix: "GOOGLE_DRIVE",
    kind: "DRIVE",
    redirectUri:
      process.env.GOOGLE_DRIVE_REDIRECT_URI ||
      "http://localhost:3000/api/oauth/drive/callback",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.file"
    ]
  },
  youtube: {
    clientId: process.env.GOOGLE_YOUTUBE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_YOUTUBE_CLIENT_SECRET,
    envPrefix: "GOOGLE_YOUTUBE",
    kind: "YOUTUBE",
    redirectUri:
      process.env.GOOGLE_YOUTUBE_REDIRECT_URI ||
      "http://localhost:3000/api/oauth/youtube/callback",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.upload"
    ]
  }
} as const;

export async function startGoogleConnection(kind: GoogleConnectionKind) {
  const user = await requireSignedInUser();
  const config = getConnectionConfig(kind);
  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();

  cookieStore.set(stateCookieName(kind), state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);

  console.info(`Starting ${kind} connection for ${user.email}.`);
  return NextResponse.redirect(authorizationUrl);
}

export async function handleGoogleConnectionCallback(
  kind: GoogleConnectionKind,
  requestUrl: string
) {
  const user = await requireSignedInUser();
  const config = getConnectionConfig(kind);
  const url = new URL(requestUrl);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookieName(kind))?.value;

  cookieStore.delete(stateCookieName(kind));

  if (error) {
    redirect(`/connections?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    redirect("/connections?error=InvalidOAuthState");
  }

  const tokenResponse = await exchangeCodeForTokens(kind, code, config.redirectUri);
  if (!tokenResponse.access_token) {
    redirect("/connections?error=TokenExchangeFailed");
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    redirect("/connections?error=MissingTokenKey");
  }

  const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
  const accountEmail = userInfo.email || user.email;
  const existingConnection = await prisma.oAuthConnection.findFirst({
    where: {
      accountEmail,
      kind: config.kind,
      userId: user.id
    }
  });

  if (!tokenResponse.refresh_token && !existingConnection) {
    redirect("/connections?error=MissingRefreshToken");
  }

  const encryptedAccessToken = encryptToken(tokenResponse.access_token, tokenKey);
  const encryptedRefreshToken = tokenResponse.refresh_token
    ? encryptToken(tokenResponse.refresh_token, tokenKey)
    : undefined;
  const scopes = parseScopes(tokenResponse.scope, config.scopes);
  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : undefined;
  const youtubeChannel =
    kind === "youtube"
      ? await fetchYouTubeChannel(tokenResponse.access_token)
      : undefined;

  const label =
    kind === "youtube"
      ? youtubeChannel?.snippet?.title || userInfo.name || "YouTube Channel"
      : userInfo.name
        ? `${userInfo.name} Drive`
        : "Google Drive";

  if (existingConnection) {
    await prisma.oAuthConnection.update({
      where: { id: existingConnection.id },
      data: {
        accountEmail,
        channelHandle: youtubeChannel?.snippet?.customUrl,
        channelId: youtubeChannel?.id,
        channelName: youtubeChannel?.snippet?.title,
        encryptedAccessToken,
        encryptedRefreshToken: encryptedRefreshToken || existingConnection.encryptedRefreshToken,
        errorMessage: null,
        expiresAt,
        label,
        scopes,
        status: "ACTIVE"
      }
    });
  } else {
    await prisma.oAuthConnection.create({
      data: {
        accountEmail,
        channelHandle: youtubeChannel?.snippet?.customUrl,
        channelId: youtubeChannel?.id,
        channelName: youtubeChannel?.snippet?.title,
        encryptedAccessToken,
        encryptedRefreshToken: encryptedRefreshToken as string,
        expiresAt,
        kind: config.kind,
        label,
        scopes,
        status: "ACTIVE",
        userId: user.id
      }
    });
  }

  redirect("/connections?connected=true");
}

async function requireSignedInUser() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    redirect("/?error=SignInRequired");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      disabledAt: true,
      email: true,
      id: true
    }
  });

  if (!user || user.disabledAt) {
    redirect("/?error=AccessDenied");
  }

  return user;
}

function getConnectionConfig(kind: GoogleConnectionKind) {
  const config = connectionConfig[kind];

  if (!config.clientId || !config.clientSecret) {
    redirect(`/connections?error=Missing${config.envPrefix}Config`);
  }

  return {
    ...config,
    clientId: config.clientId,
    clientSecret: config.clientSecret
  };
}

async function exchangeCodeForTokens(
  kind: GoogleConnectionKind,
  code: string,
  redirectUri: string
) {
  const config = getConnectionConfig(kind);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || payload.error) {
    console.error(`${kind} token exchange failed.`, payload);
  }

  return payload;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    return {};
  }

  return response.json() as Promise<GoogleUserInfo>;
}

async function fetchYouTubeChannel(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as YouTubeChannelResponse;
  return payload.items?.[0];
}

function parseScopes(scope: string | undefined, fallbackScopes: readonly string[]) {
  const scopes = scope?.split(" ").filter(Boolean);
  return scopes?.length ? scopes : [...fallbackScopes];
}

function stateCookieName(kind: GoogleConnectionKind) {
  return `relayroom_${kind}_oauth_state`;
}
