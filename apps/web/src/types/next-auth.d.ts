import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** B2B tenant the authenticated user belongs to. */
      clientId: string;
    } & DefaultSession["user"];
  }

  interface User {
    clientId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    clientId?: string;
  }
}
