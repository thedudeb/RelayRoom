import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database"
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

      const allowedEmails = getAllowedSignInEmails();
      if (allowedEmails.size === 0) {
        return true;
      }

      return allowedEmails.has(email.toLowerCase()) || "/?error=AccessDenied";
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

function getAllowedSignInEmails() {
  const configuredEmails = [
    process.env.INITIAL_ADMIN_EMAIL,
    ...(process.env.AUTH_ALLOWED_EMAILS || "").split(",")
  ];

  return new Set(
    configuredEmails
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  );
}
