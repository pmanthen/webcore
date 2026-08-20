import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listProjects } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!session?.user || !clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await listProjects(clientId);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[api/projects] failed", error);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 },
    );
  }
}
