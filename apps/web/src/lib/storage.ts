import type { Readable } from "node:stream";

import { Client as MinioClient } from "minio";

import { getEnv } from "@/lib/env";

const globalForStorage = globalThis as unknown as {
  __uxEvalMinio?: MinioClient;
};

function getClient(): MinioClient {
  if (!globalForStorage.__uxEvalMinio) {
    const env = getEnv();
    globalForStorage.__uxEvalMinio = new MinioClient({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
  }

  return globalForStorage.__uxEvalMinio;
}

export interface ArtifactObject {
  stream: Readable;
  contentType: string;
  contentLength: number | undefined;
  etag: string | undefined;
}

/**
 * Object keys come from the database, but the route that serves them is public,
 * so reject anything that could escape the artifact prefix.
 */
export function isSafeArtifactKey(key: string): boolean {
  if (!key || key.length > 512) {
    return false;
  }
  if (key.startsWith("/") || key.includes("..") || key.includes("\\")) {
    return false;
  }
  return /^[A-Za-z0-9._\-/]+$/.test(key);
}

/** Fetch an artifact for proxying. Returns `null` when the key does not exist. */
export async function getArtifact(key: string): Promise<ArtifactObject | null> {
  const { MINIO_BUCKET } = getEnv();
  const client = getClient();

  let stat;
  try {
    stat = await client.statObject(MINIO_BUCKET, key);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }

  const stream = await client.getObject(MINIO_BUCKET, key);

  return {
    stream,
    contentType:
      typeof stat.metaData?.["content-type"] === "string"
        ? stat.metaData["content-type"]
        : "application/octet-stream",
    contentLength: stat.size,
    etag: stat.etag,
  };
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === "NotFound" || code === "NoSuchKey" || code === "NoSuchBucket"
  );
}

/** Path of the Next.js proxy route that serves an artifact key. */
export function artifactProxyPath(key: string): string {
  return `/api/artifacts/${key.split("/").map(encodeURIComponent).join("/")}`;
}
