import { handlers } from "@/auth";

// NextAuth's catch-all route. The [...nextauth] segment funnels every auth
// endpoint (sign-in, callback, session, sign-out, CSRF, ...) here; we just
// re-export the GET/POST handlers built from the central auth config in auth.ts.
export const { GET, POST } = handlers;
