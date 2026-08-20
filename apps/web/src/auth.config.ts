import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe Auth.js config (no Prisma). Used by middleware and merged into
 * the full Node.js config in `auth.ts`.
 */
export const authConfig = {
  providers: [
    GitHub({
      // Env-driven so CI / local test can boot without real OAuth credentials.
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        if ("clientId" in user && typeof user.clientId === "string") {
          token.clientId = user.clientId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          session.user.id = token.sub;
        }
        if (typeof token.clientId === "string") {
          session.user.clientId = token.clientId;
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
