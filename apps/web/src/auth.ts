import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@autonomous-ux/database";
import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";

import { authConfig } from "@/auth.config";

/**
 * Provision a B2B `Client` tenant for every new Auth.js user, then link
 * `User.clientId` so projects/runs are scoped from the first request.
 */
function createTenantProvisioningAdapter(): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,
    async createUser(data) {
      const email =
        data.email?.trim() ||
        `user-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}@uxeval.local`;
      const workspaceName = data.name?.trim()
        ? `${data.name.trim()}'s Workspace`
        : "Personal Workspace";

      const user = await prisma.$transaction(async (tx) => {
        const client = await tx.client.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: workspaceName,
          },
        });

        return tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            emailVerified: data.emailVerified,
            image: data.image,
            clientId: client.id,
          },
        });
      });

      return user as AdapterUser;
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: createTenantProvisioningAdapter(),
});
