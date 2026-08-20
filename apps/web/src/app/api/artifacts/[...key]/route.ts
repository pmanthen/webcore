import { NextResponse } from "next/server";

import { getArtifact, isSafeArtifactKey } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Streams audit artifacts (screenshots) out of MinIO so the bucket can stay
 * private and the browser never needs MinIO credentials or a public port.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await context.params;
  const key = (segments ?? []).map(decodeURIComponent).join("/");

  if (!isSafeArtifactKey(key)) {
    return NextResponse.json({ error: "Invalid artifact key" }, { status: 400 });
  }

  try {
    const artifact = await getArtifact(key);
    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const headers = new Headers({
      "Content-Type": artifact.contentType,
      // Artifact keys are immutable (they embed the run id), so cache hard.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    if (artifact.contentLength !== undefined) {
      headers.set("Content-Length", String(artifact.contentLength));
    }
    if (artifact.etag) {
      headers.set("ETag", artifact.etag);
    }

    return new NextResponse(
      artifact.stream as unknown as ReadableStream<Uint8Array>,
      { headers },
    );
  } catch (error) {
    console.error("[api/artifacts] failed to read artifact", { key, error });
    return NextResponse.json(
      { error: "Failed to read artifact" },
      { status: 502 },
    );
  }
}
