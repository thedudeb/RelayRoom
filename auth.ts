import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { hasConfiguredSignInAllowlist, isAllowedSignInIdentity } from "@/lib/auth/signin-allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    // 30-day rolling session; idle past 7 days re-authenticates.
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 7
  },
  // Explicit cookie hardening (ISSUE-043). NextAuth's defaults are reasonable
  // but undeclared; pin them so a dependency bump can't silently relax them.
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_SIGNIN_CLIENT_ID || "missing-google-client-id",
      clientSecret: process.env.GOOGLE_SIGNIN_CLIENT_SECRET || "missing-google-client-secret"
    })
  ],
  pages: {
    signIn: "/"
  },
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email || profile?.email;
      if (!email) {
        return "/?error=AccessDenied";
      }

      if (!hasConfiguredSignInAllowlist()) {
        // Fail closed: an empty allowlist must never grant access. Dev convenience requires
        // explicit opt-in via AUTH_ALLOW_ANY=true and non-production NODE_ENV.
        if (process.env.NODE_ENV !== "production" && process.env.AUTH_ALLOW_ANY === "true") {
          return true;
        }
        return "/?error=AccessDenied";
      }

      const hostedDomain = typeof profile?.hd === "string" ? profile.hd : undefined;
      return isAllowedSignInIdentity({ email, hostedDomain }) || "/?error=AccessDenied";
    }
  },
  events: {
    async createUser({ user }) {
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
      if (!initialAdminEmail || !user.email) {
        return;
      }

      if (user.email.toLowerCase() === initialAdminEmail.toLowerCase()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "OWNER" }
        });
      }
    }
  }
});
