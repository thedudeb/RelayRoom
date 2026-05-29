"use server";

import { signOut } from "@/auth";

// Server action wrapper so client components can sign out via a form action
// without importing NextAuth's server-only `signOut` directly.
export async function signOutFromApp() {
  await signOut({ redirectTo: "/" });
}
