import { NextResponse } from "next/server";

import { listProjects } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[api/projects] failed", error);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 },
    );
  }
}
