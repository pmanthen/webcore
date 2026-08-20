import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@autonomous-ux/database"],
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
};

export default nextConfig;
