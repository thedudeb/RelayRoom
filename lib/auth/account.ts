import { auth } from "@/auth";
import type { AccountSummary } from "@/components/layout/AppShell";

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
