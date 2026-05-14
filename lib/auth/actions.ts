"use server";

import { signOut } from "@/auth";

export async function signOutFromApp() {
  await signOut({ redirectTo: "/" });
}
