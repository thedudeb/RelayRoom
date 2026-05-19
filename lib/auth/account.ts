import { auth } from "@/auth";
import type { AccountSummary } from "@/components/layout/AppShell";
import { prisma } from "@/lib/db/prisma";
import { hashApiKey, isRelayRoomApiKey } from "@/lib/security/api-keys";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export type AppAccess =
  | {
      account: AccountSummary | null;
      authMethod: "demo";
      isDemo: true;
      userId: null;
    }
  | {
      account: AccountSummary;
      authMethod: "api_key" | "session";
      isDemo: false;
      userId: string;
    };

export async function getCurrentAccount(): Promise<AccountSummary | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image
  };
}

export async function requireAppAccess(searchParams?: {
  demo?: string | string[];
}): Promise<AppAccess> {
  if (isTruthyParam(searchParams?.demo)) {
    return {
      account: null,
      authMethod: "demo",
      isDemo: true,
      userId: null
    };
  }

  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    redirect("/?error=SignInRequired");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      image: true,
      name: true,
      disabledAt: true
    }
  });

  if (!user || user.disabledAt) {
    redirect("/?error=AccessDenied");
  }

  return {
    account: {
      name: user.name,
      email: user.email,
      image: user.image
    },
    authMethod: "session",
    isDemo: false,
    userId: user.id
  };
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function getApiAccess(
  searchParams: URLSearchParams,
  request?: { headers: Headers; method?: string }
): Promise<AppAccess | null> {
  if (isTruthyParam(searchParams.get("demo") || undefined)) {
    return {
      account: null,
      authMethod: "demo",
      isDemo: true,
      userId: null
    };
  }

  // API keys authorize read-only requests only. SPEC §4.10: REST API is read-only;
  // mutations must use a browser session so CSRF + ownership checks apply uniformly.
  const methodAllowsApiKey = !request?.method || READ_ONLY_METHODS.has(request.method.toUpperCase());
  const apiKeyAccess = request && methodAllowsApiKey ? await getApiKeyAccess(request) : null;
  if (apiKeyAccess) {
    return apiKeyAccess;
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      image: true,
      name: true,
      disabledAt: true
    }
  });

  if (!user || user.disabledAt) {
    return null;
  }

  return {
    account: {
      name: user.name,
      email: user.email,
      image: user.image
    },
    authMethod: "session",
    isDemo: false,
    userId: user.id
  };
}

async function getApiKeyAccess(request: { headers: Headers }): Promise<AppAccess | null> {
  const authHeader = request.headers.get("authorization");
  const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!isRelayRoomApiKey(apiKey)) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      revokedAt: true,
      user: {
        select: {
          disabledAt: true,
          email: true,
          id: true,
          image: true,
          name: true
        }
      }
    }
  });

  if (!record?.user || record.revokedAt || record.user.disabledAt) {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    account: {
      name: record.user.name,
      email: record.user.email,
      image: record.user.image
    },
    authMethod: "api_key",
    isDemo: false,
    userId: record.user.id
  };
}

export async function requireOwnerAccess() {
  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/settings?demo=true&error=OwnerOnly");
  }

  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { role: true }
  });

  if (user?.role !== Role.OWNER) {
    redirect("/settings?error=OwnerOnly");
  }

  return access;
}

function isTruthyParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "true" || rawValue === "1";
}
