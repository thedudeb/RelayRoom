import { auth } from "@/auth";
import type { AccountSummary } from "@/components/layout/AppShell";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";

export type AppAccess =
  | {
      account: AccountSummary | null;
      isDemo: true;
      userId: null;
    }
  | {
      account: AccountSummary;
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
    isDemo: false,
    userId: user.id
  };
}

export async function getApiAccess(searchParams: URLSearchParams): Promise<AppAccess | null> {
  if (isTruthyParam(searchParams.get("demo") || undefined)) {
    return {
      account: null,
      isDemo: true,
      userId: null
    };
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
    isDemo: false,
    userId: user.id
  };
}

function isTruthyParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "true" || rawValue === "1";
}
