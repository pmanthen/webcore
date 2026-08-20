import { Client as MinioClient } from "minio";

import { getEnv } from "../env.js";

let cachedClient: MinioClient | null = null;
let bucketReady = false;

function getClient(): MinioClient {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getEnv();
  cachedClient = new MinioClient({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  return cachedClient;
}

/**
 * `docker compose` provisions the bucket via the `minio-init` service, but the
 * worker also self-heals so it can run against a bare MinIO/S3 endpoint.
 */
async function ensureBucket(): Promise<string> {
  const { MINIO_BUCKET } = getEnv();
  if (bucketReady) {
    return MINIO_BUCKET;
  }

  const client = getClient();
  if (!(await client.bucketExists(MINIO_BUCKET))) {
    await client.makeBucket(MINIO_BUCKET);
    console.info("[storage] created bucket", { bucket: MINIO_BUCKET });
  }

  bucketReady = true;
  return MINIO_BUCKET;
}

export interface StoredArtifact {
  /** Object key inside the bucket, the canonical reference stored in Postgres. */
  key: string;
  bucket: string;
  /** Direct MinIO URL, handy for debugging outside the app. */
  url: string;
  size: number;
}

/** Build the object key for an audit artifact. */
export function buildScreenshotKey(
  runId: string,
  label: string,
  extension = "png",
): string {
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `runs/${runId}/${safeLabel || "artifact"}.${extension}`;
}

export async function uploadArtifact(
  key: string,
  body: Buffer,
  contentType = "image/png",
): Promise<StoredArtifact> {
  const bucket = await ensureBucket();
  const env = getEnv();

  await getClient().putObject(bucket, key, body, body.byteLength, {
    "Content-Type": contentType,
  });

  return {
    key,
    bucket,
    url: `${env.MINIO_PUBLIC_URL.replace(/\/+$/, "")}/${bucket}/${key}`,
    size: body.byteLength,
  };
}
