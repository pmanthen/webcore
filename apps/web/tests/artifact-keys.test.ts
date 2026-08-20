import { describe, expect, it } from "vitest";

import { artifactUrl } from "@/components/results/severity";
import { artifactProxyPath, isSafeArtifactKey } from "@/lib/storage";

describe("isSafeArtifactKey", () => {
  it("accepts the keys the worker actually writes", () => {
    for (const key of [
      "runs/run_abc123/full-page.png",
      "runs/run_abc123/Accessibility-1-hero-image-has-no-alt-text.png",
      "runs/RUN_1/crop.2.png",
      "single-file.png",
    ]) {
      expect(isSafeArtifactKey(key)).toBe(true);
    }
  });

  it("rejects an empty key", () => {
    expect(isSafeArtifactKey("")).toBe(false);
  });

  it("rejects traversal out of the artifact prefix", () => {
    for (const key of [
      "../secrets.env",
      "runs/../../etc/passwd",
      "runs/run_1/..",
      "..",
    ]) {
      expect(isSafeArtifactKey(key)).toBe(false);
    }
  });

  it("rejects absolute paths and Windows separators", () => {
    expect(isSafeArtifactKey("/etc/passwd")).toBe(false);
    expect(isSafeArtifactKey("runs\\run_1\\full-page.png")).toBe(false);
  });

  it("rejects characters outside the allowed alphabet", () => {
    for (const key of [
      "runs/run 1/full-page.png",
      "runs/run_1/full page.png",
      "runs/run_1/full-page.png?x=1",
      "runs/run_1/full-page.png#frag",
      "runs/run_1/\u0000.png",
      "runs/run_1/café.png",
    ]) {
      expect(isSafeArtifactKey(key)).toBe(false);
    }
  });

  it("rejects an implausibly long key", () => {
    expect(isSafeArtifactKey(`runs/${"a".repeat(512)}.png`)).toBe(false);
  });

  it("accepts a key right at the length limit", () => {
    expect(isSafeArtifactKey("a".repeat(512))).toBe(true);
  });
});

describe("artifact proxy paths", () => {
  it("routes through the proxy rather than exposing MinIO", () => {
    expect(artifactProxyPath("runs/run_1/full-page.png")).toBe(
      "/api/artifacts/runs/run_1/full-page.png",
    );
  });

  it("keeps the client helper and the server helper in agreement", () => {
    for (const key of [
      "runs/run_1/full-page.png",
      "runs/run 1/hero shot.png",
      "runs/run_1/100%-width.png",
    ]) {
      expect(artifactUrl(key)).toBe(artifactProxyPath(key));
    }
  });

  it("encodes each segment but preserves the separators", () => {
    const path = artifactProxyPath("runs/run 1/hero shot.png");

    expect(path).toBe("/api/artifacts/runs/run%201/hero%20shot.png");
    expect(path.split("/").slice(3)).toEqual([
      "runs",
      "run%201",
      "hero%20shot.png",
    ]);
  });

  it("round-trips through the decoding the route performs", () => {
    const key = "runs/run_1/Accessibility-1-alt text missing.png";
    const segments = artifactProxyPath(key)
      .replace("/api/artifacts/", "")
      .split("/");

    expect(segments.map(decodeURIComponent).join("/")).toBe(key);
  });
});
